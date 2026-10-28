/* THE DRAGON AND THE KRAKEN (js/beasts.js) — the monsters' drawn selves.

   This file pins:

     THE ART LANDS     the four strips are declared in Assets.FX_SETS under
                       the special events' own names (so the rolled event's
                       wantFx asks for them), they are on disk at the frame
                       counts the drawing reads, and they load and slice
     EVERY BEAT DRAWS  the dragon flying in, breathing and leaving, the kraken
                       rising, thrashing and sinking, both facings, on the
                       art and on the procedural fallback, without a throw
     A PICTURE ONLY    drawing them writes nothing into S (the act, the save)
                       and draws nothing from the run's RNG
     ONE WHOLE SCALE   every frame of every strip lands at one fixed,
                       whole-number scale through every beat — height and
                       approach are told by position, never by size
     THE JAWS          the breath is drawn from the dragon's jaws to the line
                       of fire the act lays: the jaws hang just behind it,
                       facing either way
     OPEN WATER        the kraken comes up where the water is, not on the
                       shore it reaches across, and within a tentacle's reach
                       of its prey
     THEY ARE HEARD    a roar, a breath, the deep's groan and the slam
     ITS VICTIMS BURN  in the burning-town flame sprites; the stand-in is
                       stepped tongues, never a translucent box on the body
     THE ART IS THERE  on a phone's wire with a cold cache, a run founded
                       through the real entry holding both beast cards plays
                       them a beat after entering and both acts open on the
                       DRAWN beasts — never the procedural stand-in. The held
                       cards ask at HIGH priority (Deck.wantArt, G.warmFx),
                       and the play's landing waits for strips that are
                       merely late (DeckUI.ART_WAIT_MS), never longer
     NOT IN THE BLACK  by a sea that runs into the board's edge the kraken
                       comes up with ALL of its drawn body on the board, and
                       neither the world's act nor the card's writes a pixel
                       off it (a control that widens R.boardPx must see some)

     DRAGONFIRE'S ACT  the card's dragon comes in from the board's side and
                       writes no pixel off the board; the view goes IN on
                       the fire whatever the player's zoom (the beast 60%+
                       of the screen's width) and is handed back after; its
                       shadow sweeps the screen first under the title; the
                       beast is on screen 3.5s+; each building the fire
                       reaches catches on its own beat with a shake; no warm
                       light pooled on the ground (a soft light wider than
                       0.6 tile on the fire line); its breath and its shadow
                       drawn at the device's own resolution (the operator's
                       ruling, 2026-10-27: "higher pixel count") — the breath
                       fills not one cell, the shadow is the silhouette
                       blurred soft
     KRAKEN'S CALL     over a narrow sea, nothing of the frame's own sea and
                       nothing of the beast below its waterline lands on the
                       land (the card's act and the world's); its blows throw
                       water, never pale shards; every hull it takes is drawn
                       seized, heeling over, into a splash; the view goes in
                       on the deep, the sky's head stands on real water in
                       the open band, and the view is handed back after

   Run after touching: js/beasts.js, the dragon/kraken blocks of R.draw,
   Assets.FX_SETS / wantFx / whenFx, Deck.wantArt, DeckUI._run's landing,
   G.warmFx, G.dragonTick / G.krakenTick's phases, dragonfire in js/deckfx.js,
   krakens_call and Deck.view in js/deckfx-rival.js.

     node tests/beasts.mjs      # exits non-zero on any regression */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import fs from 'node:fs';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const res = {}, fails = [];
const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };

// ---------------- 0. the files themselves (no browser) ----------------
{
  const want = { 'dragon-fly': [8, 256], 'dragon-breath': [9, 256], 'kraken-thrash': [8, 224], 'kraken-tentacle': [13, 160] };
  const bad = [];
  for (const [name, [n, f]] of Object.entries(want)) {
    const p = join(root, 'assets/fx', name + '.png');
    if (!fs.existsSync(p)) { bad.push(name + ' missing'); continue; }
    const b = fs.readFileSync(p), w = b.readUInt32BE(16), h = b.readUInt32BE(20);
    if (h !== f || w !== f * n) bad.push(`${name} ${w}x${h} (want ${f * n}x${f})`);
  }
  ck('theStripsAreOnDiskAtTheirFrameCounts', !bad.length, bad.join('; '));
}

const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });
const ctx = await b.newContext({ viewport: { width: 430, height: 880 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_FILE_NOT_FOUND')) errs.push('console: ' + m.text()); });
await p.goto('file://' + join(root, 'index.html'), { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.Screens && Screens.current === 'title' && window.Beasts, null, { timeout: 120000 });
await p.evaluate(() => { Boot.force(); Screens._demo = false; G.newGame('beasts', 'moderate', 'medium'); S.paused = true; });

// ---------------- 1. declared and loaded ----------------
{
  const decl = await p.evaluate(() => ({
    d: JSON.stringify(Assets.FX_SETS.dragon), k: JSON.stringify(Assets.FX_SETS.kraken),
  }));
  ck('theRolledEventAsksForItsOwnArt', decl.d === '["dragon-fly","dragon-breath"]' && decl.k === '["kraken-thrash","kraken-tentacle"]', JSON.stringify(decl));
  await p.evaluate(() => { Assets.wantFx('dragon'); Assets.wantFx('kraken'); });
  const ok = await p.waitForFunction(() => ['dragon-fly', 'dragon-breath', 'kraken-thrash', 'kraken-tentacle'].every(n => Assets.fxFrames(n)), null, { timeout: 60000 }).then(() => true, () => false);
  const n = await p.evaluate(() => ['dragon-fly', 'dragon-breath', 'kraken-thrash', 'kraken-tentacle'].map(k => (Assets.fxFrames(k) || []).length).join(','));
  ck('andTheStripsLoadAndSlice', ok && n === '8,9,8,13', n);
}

// ---------------- 2. every beat draws, art or not; a picture only ----------------
{
  const r = await p.evaluate(() => {
    const cv = document.createElement('canvas'); cv.width = 900; cv.height = 900;
    const g = cv.getContext('2d');
    const tc = Bld.tcOf('P');
    const errs = [];
    const before = S.rngState;
    const dragonAt = (phase, t, dir) => ({ avail: false, done: true, ash: [], fire: [{ x: tc.x + 3, y: tc.y + 2, ttl: 3, seed: 5 }],
      ev: { phase, t, x: tc.x + 2, y: tc.y + 2, tx: tc.x + 4, ty: tc.y + 2, dir, victims: [], card: phase === 'leave' ? { x: tc.x + 2, y: tc.y + 2 } : null } });
    const w = MapGen.findNear(tc.x, tc.y, 60, (x, y) => G.openWaterAt(x, y)) || { x: tc.x, y: tc.y };
    const krakenAt = (phase, t) => ({ ev: { phase, t, x: w.x + 0.5, y: w.y + 0.5, boatId: -1, owner: 'P' } });
    const drawAll = () => {
      for (const dir of [1, -1]) for (const [ph, ts] of [['fly', [0, 0.2, 0.6, 1.2]], ['burn', [0, 0.2, 0.5, 1.0, 1.6]], ['leave', [0, 0.5, 1.4]]]) for (const t of ts) {
        S.dragon = dragonAt(ph, t, dir);
        const snap = JSON.stringify(S.dragon);
        g.save(); try { R.drawDragonAct(g, 1 / 60); if (R.drawFireTongue) R.drawFireTongue(g, S.dragon.fire[0], 1, 1); } catch (e) { errs.push('dragon ' + ph + t + ': ' + e.message); } g.restore();
        if (JSON.stringify(S.dragon) !== snap) errs.push('dragon act written by its picture (' + ph + ' ' + t + ')');
      }
      for (const [ph, ts] of [['rise', [0, 0.4, 1.0, 1.55]], ['thrash', [0, 0.3, 1.2, 2.1]], ['sink', [0, 0.6, 1.5]]]) for (const t of ts) {
        S.kraken = krakenAt(ph, t);
        const snap = JSON.stringify(S.kraken);
        g.save(); try { R.drawKrakenAct(g, 1 / 60); } catch (e) { errs.push('kraken ' + ph + t + ': ' + e.message); } g.restore();
        if (JSON.stringify(S.kraken) !== snap) errs.push('kraken act written by its picture (' + ph + ' ' + t + ')');
      }
    };
    G.freeVis = true;
    for (let i = 0; i < CFG.W * CFG.H; i++) S.map.explored[i] = 1;
    G.updateVisibility && G.updateVisibility();
    drawAll();
    const withArt = errs.length;
    // …and on the procedural fallback, with the strips taken away
    const kept = {};
    for (const n of ['dragon-fly', 'dragon-breath', 'kraken-thrash', 'kraken-tentacle']) { kept[n] = Assets.fx[n]; delete Assets.fx[n]; Assets._fxAsked[n] = true; }
    drawAll();
    Object.assign(Assets.fx, kept);
    S.dragon.ev = null; S.kraken.ev = null;
    return { errs, withArt, rng: S.rngState === before };
  });
  ck('everyBeatOfBothBeastsDraws', r.errs.length === 0, r.errs.slice(0, 4).join(' | '));
  ck('andTheFallbackDrawsWithoutTheArt', r.errs.length === 0 && r.withArt === 0, 'errors with art ' + r.withArt + ', in all ' + r.errs.length);
  ck('aPictureDrawsNothingFromTheRunsRng', r.rng);
}

// ---------------- 2b. one whole scale, never animated ----------------
/* A nearest-neighbour scale that is not a whole number drops and doubles art
   rows unevenly, and animated it shimmers: the dragon breathed between 0.98x
   and 1.22x with its altitude, the kraken grew through 0.78 x (0.7..1) as it
   rose, a tentacle stood at 0.95x. Every beast frame drawn through every beat
   of both acts, both facings, is measured as it lands on the canvas (the
   destination over the source, through the context's own transform): one
   scale per strip, a whole number, the same in every beat. */
{
  const r = await p.evaluate(() => {
    const names = ['dragon-fly', 'dragon-breath', 'kraken-thrash', 'kraken-tentacle'];
    const of = new Map();
    for (const n of names) for (const f of Assets.fxFrames(n) || []) {
      of.set(f, n);
      // a kraken frame is drawn as its two halves (Beasts.split: the beast, and the sea
      // laid only on the water) — each the frame's own size, so each is the frame here
      const sp = window.Beasts && Beasts.split && /^kraken/.test(n) ? Beasts.split(f) : null;
      if (sp) { of.set(sp.dry, n); of.set(sp.wet, n); }
    }
    const cv = document.createElement('canvas'); cv.width = 900; cv.height = 900;
    const g = cv.getContext('2d');
    const seen = {};
    const di = g.drawImage;
    g.drawImage = function (img, ...a) {
      const n = of.get(img);
      if (n) {
        const T = this.getTransform();
        const [sx, sy] = a.length === 2 ? [1, 1] : a.length === 4 ? [a[2] / img.width, a[3] / img.height] : [a[6] / a[2], a[7] / a[3]];
        const k = Math.hypot(T.a, T.b) * sx, l = Math.hypot(T.c, T.d) * sy;
        (seen[n] = seen[n] || new Set()).add(k.toFixed(3) + 'x' + l.toFixed(3));
      }
      return di.call(this, img, ...a);
    };
    const tc = Bld.tcOf('P');
    const w = MapGen.findNear(tc.x, tc.y, 60, (x, y) => G.openWaterAt(x, y)) || { x: tc.x, y: tc.y };
    for (const dir of [1, -1]) for (const [ph, ts] of [['fly', [0, 0.2, 0.6, 1.2]], ['burn', [0, 0.1, 0.2, 0.5, 1.0, 1.6]], ['leave', [0, 0.5, 1.4]]]) for (const t of ts) {
      S.dragon = { avail: false, done: true, ash: [], fire: [], ev: { phase: ph, t, x: tc.x + 2 + t, y: tc.y + 2, tx: tc.x + 4, ty: tc.y + 2, dir, victims: [],
        card: ph === 'leave' ? { x: tc.x + 2, y: tc.y + 2 } : null } };
      g.save(); try { R.drawDragonAct(g, 1 / 60); } catch (e) {} g.restore();
    }
    for (const [ph, ts] of [['rise', [0.05, 0.2, 0.4, 0.7, 1.0, 1.3, 1.55]], ['thrash', [0, 0.3, 1.2, 2.1]], ['sink', [0, 0.3, 0.6, 1.0, 1.5]]]) for (const t of ts) {
      S.kraken = { ev: { phase: ph, t, x: w.x + 0.5, y: w.y + 0.5, boatId: -1, owner: 'P' } };
      g.save(); try { R.drawKrakenAct(g, 1 / 60); } catch (e) {} g.restore();
    }
    S.dragon.ev = null; S.kraken.ev = null;
    const out = {};
    for (const n of names) out[n] = seen[n] ? [...seen[n]] : [];
    return out;
  });
  const bad = Object.entries(r).filter(([n, ks]) => ks.length !== 1 || !ks.every(k => k.split('x').every(v => Math.abs(+v - Math.round(+v)) < 1e-6 && Math.round(+v) >= 1)));
  ck('theBeastsAreDrawnAtOneWholeScale', Object.values(r).every(ks => ks.length) && !bad.length,
    Object.entries(r).map(([n, ks]) => n + ' ' + ks.join('/')).join('; '));
}

// ---------------- 3. the jaws hang over the line of fire ----------------
{
  const r = await p.evaluate(() => {
    const C = Beasts.DRAGON, TL = CFG.TILE, out = [];
    for (const dir of [1, -1]) {
      // the drawing's own arithmetic over the line it burns (one fixed, whole scale)
      const x = 20, back = (C.reach - C.lead) * TL - C.mouth[0] * C.scale;
      const jaws = (x * TL + dir * back + dir * C.mouth[0] * C.scale) / TL;
      const land = x + dir * C.reach;               // where G.dragonTick lays its fire line
      out.push({ dir, behind: (land - jaws) * dir });
    }
    return out;
  });
  ck('theJawsHangJustBehindTheLineOfFire', r.every(o => o.behind > 0.3 && o.behind < 1.6), JSON.stringify(r));
}

// ---------------- 4. the kraken comes up in open water ----------------
{
  const r = await p.evaluate(() => {
    // a lake built by hand: a wide sea to the east of a long north-south shore
    const W = CFG.W;
    for (let y = 2; y < CFG.H - 2; y++) for (let x = 2; x < W - 2; x++) S.map.terrain[y * W + x] = x >= 20 ? T.WATER : T.GRASS;
    G._wb = null;
    const prey = { x: 20.5, y: 20.5 };                // a boat hugging the shore
    const at = R.krakenBodyAt(prey.x, prey.y);
    let n = 0, m = 0;
    for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) { if (ox * ox + oy * oy > 4.5) continue; m++; if (G.wetAt(at.x + ox, at.y + oy)) n++; }
    return { at, wet: n / m, reach: Math.hypot(at.x - prey.x, at.y - prey.y) };
  });
  ck('theKrakenComesUpInOpenWater', r.wet >= 0.9 && r.at.x > 20.5, JSON.stringify(r));
  ck('withinATentaclesReachOfItsPrey', r.reach <= 3.05, 'reach ' + r.reach.toFixed(2));
}

// ---------------- 5. they are heard ----------------
{
  const r = await p.evaluate(() => ['roar', 'breath', 'kraken', 'splash'].map(k => typeof Sound._VOICES[k] === 'function' && Sound.GAP[k] > 0));
  ck('theMonstersAreHeard', r.every(Boolean), JSON.stringify(r));
}

// ---------------- 6. the real frame, with both acts live ----------------
{
  await p.evaluate(() => {
    G.newGame('beasts-live', 'moderate', 'medium'); Screens.show('playing');
    const tc = Bld.tcOf('P');
    S.dragon = { avail: false, done: true, ash: [], fire: [], ev: { phase: 'fly', t: 0, x: tc.x - 10, y: tc.y + 2, tx: tc.x + 3, ty: tc.y + 2, dir: 1, victims: [] } };
  });
  // in, down, the breath, and away — the frame draws every beat of it
  const seen = await p.evaluate(() => new Promise(done => {
    const ph = new Set(), t0 = performance.now();
    const tick = () => {
      if (S.dragon.ev) ph.add(S.dragon.ev.phase);
      if ((!S.dragon.ev && ph.size) || performance.now() - t0 > 12000) return done([...ph].join(','));
      requestAnimationFrame(tick);
    };
    tick();
  }));
  ck('aLiveDragonFliesItsActInTheRealFrame', seen === 'fly,burn,leave' && errs.length === 0, 'phases ' + seen + ', errors ' + errs.slice(0, 3).join(' | '));
}

// ---------------- 6b. a victim burns in the town's own flames ----------------
/* A unit the dragon's breath caught topples ablaze in the burning-town flame
   sprites (misc/flameSmall, the set R.drawFireTongue and a burning house
   wear) — and the stand-in for a world without them is stepped tongues of
   squares, never the translucent 16x14 orange box laid over the body that
   it used to be (it read as a lit window, not a fire). Both drawn in the
   real frame, each fill and sprite caught as it lands. */
{
  const r = await p.evaluate(() => {
    G.newGame('beasts-burn', 'moderate', 'medium'); Screens.show('playing'); S.paused = true;
    G.freeVis = true; G.updateVisibility();
    const tc = Bld.tcOf('A'), TL = CFG.TILE;
    const u = Units.spawn('axeman', 'A', tc.x + 3, tc.y + 3); u.burnT = 0.8;
    R.cam.z = 1.7; R.centerOn(u.x, u.y);
    const g = R.cv.getContext('2d'), probe = document.createElement('canvas').getContext('2d');
    probe.fillStyle = ART.PALETTE.fire[1]; const orange = probe.fillStyle;
    const near = (x, y) => x >= u.x * TL - 12 && x <= u.x * TL + 12 && y >= u.y * TL - 24 && y <= u.y * TL + 10;
    const frame = (noSprites) => {
      const out = { flames: 0, washes: 0, tongues: 0 };
      const ds = Assets.drawSprite, rs = Assets.resolve, fr = g.fillRect;
      Assets.drawSprite = function (gg, key) { if (/^misc\/flameSmall\//.test(key)) out.flames++; return ds.apply(this, arguments); };
      if (noSprites) Assets.resolve = function (key) { return /^misc\/flame/.test(key) ? null : rs.apply(this, arguments); };
      g.fillRect = function (x, y, w, h) {
        if (near(x, y) && g.fillStyle === orange) { if (g.globalAlpha < 0.99) out.washes++; else out.tongues++; }
        return fr.apply(this, arguments);
      };
      try { R.draw(0); } finally { Assets.drawSprite = ds; Assets.resolve = rs; g.fillRect = fr; }
      return out;
    };
    const res = { sprites: frame(false), standIn: frame(true) };
    S.units = S.units.filter(o => o !== u); G.freeVis = false;
    return res;
  });
  ck('aDragonsVictimBurnsInTheTownsOwnFlames', r.sprites.flames >= 2 && r.sprites.washes === 0, JSON.stringify(r.sprites));
  ck('andItsStandInIsTonguesNeverATranslucentBox', r.standIn.washes === 0 && r.standIn.tongues > 0, JSON.stringify(r.standIn));
}

/* ---------------- 7. the art is there before the act ----------------
   The review measured it: asked at the aim or the play, at the late tier's
   LOW priority, the strips queued behind the whole boot on a phone's cold
   cache and both cards' acts opened on the procedural stand-ins (51.7s for
   the art to arrive). Served over HTTP — a file:// page has no wire to
   throttle — on a FRESH context (a cold cache) at the boot measurements'
   phone wire (~1.6 Mbps, 150 ms), a run is founded through the real entry
   (G.newGame, then Screens.enterGame and its art plaque) with both beast
   cards in hand (?cards=all), and each is played a beat after entering,
   the way a player would: Kraken's Call off the sheet, Dragonfire aimed. */
{
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png',
    '.webp': 'image/webp', '.jpg': 'image/jpeg', '.css': 'text/css', '.json': 'application/json',
    '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
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
  const cx2 = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const q = await cx2.newPage();
  const qerr = [];
  q.on('pageerror', e => qerr.push(String(e)));
  const cdp = await cx2.newCDPSession(q);
  await cdp.send('Network.enable');
  // the priority each beast strip went out at, as the browser saw it
  const prio = {};
  cdp.on('Network.requestWillBeSent', e => { const m = /fx\/((?:dragon|kraken)-[a-z]+)\.png/.exec(e.request.url); if (m && !prio[m[1]]) prio[m[1]] = e.request.initialPriority; });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 0.75e6 / 8 });
  let r7 = null;
  try {
    await q.goto('http://127.0.0.1:' + srv.address().port + '/index.html?cards=all', { waitUntil: 'domcontentloaded' });
    await q.waitForFunction(() => window.Deck && window.DeckUI && window.Screens && Screens.current === 'title', null, { timeout: 240000 });
    await q.evaluate(() => {
      // the stand-ins, counted every time one is drawn
      window.__fall = { kraken: 0, dragon: 0, sky: 0 };
      const KC = Deck.FX.krakens_call, so = KC.skyOld, ok = R.drawKrakenOld, od = R.drawDragonOld;
      KC.skyOld = function () { window.__fall.sky++; return so.apply(this, arguments); };
      R.drawKrakenOld = function () { window.__fall.kraken++; return ok.apply(this, arguments); };
      R.drawDragonOld = function () { window.__fall.dragon++; return od.apply(this, arguments); };
      // what was in at the very moment each act began (the landing's Deck.play)
      window.__atPlay = {};
      for (const [id, kind] of [['krakens_call', 'kraken'], ['dragonfire', 'dragon']]) {
        const fx = Deck.FX[id], ap = fx.apply;
        fx.apply = function () {
          const at = window.__atPlay[id] = { art: !!Beasts.ready(kind), second: kind === 'kraken' ? !!Beasts.tentReady() : !!Assets.fxFrames('dragon-breath'), t: performance.now() };
          const r = ap.apply(this, arguments);
          at.ok = !!(r && r.ok);
          return r;
        };
      }
      Boot.force(); Screens._demo = false;
      G.newGame('beasts-cold', 'moderate', 'medium');
      Screens.enterGame();
    });
    await q.waitForFunction(() => Screens.current === 'playing', null, { timeout: 240000 });
    const asked = await q.evaluate(() => ['dragon-fly', 'dragon-breath', 'kraken-thrash', 'kraken-tentacle'].map(n => Assets._fxAsked[n]).join(','));
    // a sea along the far edge with two of the rival's hulls on it, in sight
    await q.evaluate(() => {
      const W = CFG.W, H = CFG.H, tcP = Bld.tcOf('P');
      const southFar = tcP.y < H / 2;
      const rows = southFar ? [H - 2, H - 3, H - 4, H - 5, H - 6] : [1, 2, 3, 4, 5];
      for (const y of rows) for (let x = 1; x < W - 1; x++) { if (Bld.at(x, y)) continue; const i = y * W + x; S.map.terrain[i] = T.WATER; S.map.resAmount[i] = 0; }
      S.units = S.units.filter(u => S.map.terrain[Math.floor(u.y) * W + Math.floor(u.x)] !== T.WATER);
      Bld._block = null; G._wb = null; R.rebuildTerrain();
      G.reveal(Math.floor(W / 2), Math.floor(H / 2), W);
      const seaY = rows[2];
      for (const [k, x] of [['fireship', 10.5], ['bombard', 13.5]]) { const u = Units.spawn(k, 'A', Math.floor(x), seaY); u.x = x; u.y = seaY + 0.5; }
      Units.spawn('defender', 'P', 12, southFar ? rows[rows.length - 1] - 1 : rows[rows.length - 1] + 1);   // eyes on the water
      G.updateVisibility();
      R.cam.z = 1.7; R.centerOn(12, seaY);
    });
    await q.waitForTimeout(1500);                      // the player opens the deck…
    await q.evaluate(() => { DeckUI.openSheet(); DeckUI.lift('krakens_call', document.querySelector('#dkSheet .dkCell[data-card="krakens_call"]')); });
    await q.waitForTimeout(500);                       // …reads the card, and plays it
    await q.evaluate(() => DeckUI.play('krakens_call'));
    await q.waitForFunction(() => window.__atPlay.krakens_call && !S.deck.kraken, null, { timeout: 30000 }).catch(() => {});
    await q.evaluate(() => { const tcA = Bld.tcOf('A'); R.centerOn(tcA.x + 1, tcA.y + 2); DeckUI.startAim('dragonfire'); });
    await q.waitForTimeout(500);
    await q.evaluate(() => { const tcA = Bld.tcOf('A'), A = DeckUI.aim; A.x = tcA.x + 1; A.y = tcA.y + 3; A.set = true; DeckUI._aimSync(); DeckUI.confirmAim(); });
    await q.waitForFunction(() => window.__atPlay.dragonfire && !(S.dragon && S.dragon.ev), null, { timeout: 30000 }).catch(() => {});
    r7 = await q.evaluate(() => ({ at: window.__atPlay, fall: window.__fall }));
    r7.asked = asked;
    ck('theHeldBeastsAreAskedForAtHighPriority', asked === 'high,high,high,high' &&
      ['dragon-fly', 'dragon-breath', 'kraken-thrash', 'kraken-tentacle'].every(n => prio[n] === 'High'),
      'asked ' + asked + ', on the wire ' + JSON.stringify(prio));
    const ac = r7.at;
    ck('andOnAPhonesColdCacheBothActsOpenOnTheDrawnBeasts',
      !!(ac.krakens_call && ac.krakens_call.ok && ac.krakens_call.art && ac.krakens_call.second &&
         ac.dragonfire && ac.dragonfire.ok && ac.dragonfire.art && ac.dragonfire.second) &&
      r7.fall.kraken === 0 && r7.fall.dragon === 0 && r7.fall.sky === 0, JSON.stringify(r7));

    /* THE BACKSTOP: art that is merely LATE holds the landing — the card's
       flight ends, the act waits for the strip, and opens on it the moment
       it lands; art that never comes holds it no longer than ART_WAIT_MS.
       (The wire is free again: the strips are set aside by hand.) */
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    const late = await q.evaluate(async () => {
      if (!Assets._fxDone || !Assets._fxLanded || !Assets.whenFx) return { missing: 'Assets has no whenFx/_fxDone — nothing can wait for the art' };
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const W = CFG.W, sea = S.map.terrain.findIndex((t, i) => t === T.WATER && G.openWaterAt(i % W, (i / W) | 0) && !S.units.some(u => (u.x | 0) === i % W && (u.y | 0) === ((i / W) | 0)));
      const out = {};
      for (const arrive of [true, false]) {
        const u = Units.spawn('transport', 'A', sea % W, (sea / W) | 0); u.x = sea % W + 0.5; u.y = ((sea / W) | 0) + 0.5;
        G.updateVisibility();
        Deck._add('krakens_call', 1);
        const kept = Assets.fx['kraken-thrash'];
        delete Assets.fx['kraken-thrash']; delete Assets._fxDone['kraken-thrash'];
        window.__atPlay.krakens_call = null;
        let flown = 0;
        DeckUI.play('krakens_call');
        const flight = document.querySelector('#dkFly .dkFCard');
        const anim = flight && flight.getAnimations()[0];
        if (anim) await anim.finished.catch(() => {}); else await wait(700);
        flown = performance.now();
        await wait(250);
        const heldAt250 = !window.__atPlay.krakens_call;
        let landedIn = -1;
        if (arrive) {
          Assets.fx['kraken-thrash'] = kept; Assets._fxLanded('kraken-thrash');
          const t = performance.now();
          while (!window.__atPlay.krakens_call && performance.now() - t < 2000) await wait(10);
          if (window.__atPlay.krakens_call) landedIn = Math.round(window.__atPlay.krakens_call.t - t);
        } else {
          while (!window.__atPlay.krakens_call && performance.now() - flown < 3000) await wait(10);
          if (window.__atPlay.krakens_call) landedIn = Math.round(window.__atPlay.krakens_call.t - flown);
          Assets.fx['kraken-thrash'] = kept; Assets._fxLanded('kraken-thrash');
        }
        out[arrive ? 'arrives' : 'never'] = { heldAt250, landedIn, art: window.__atPlay.krakens_call && window.__atPlay.krakens_call.art };
        while (S.deck.kraken) await wait(50);
        await wait(400);
      }
      return out;
    });
    ck('theLandingWaitsForArtThatIsMerelyLate', late.arrives && late.arrives.heldAt250 && late.arrives.landedIn >= 0 && late.arrives.landedIn < 60 && late.arrives.art === true,
      JSON.stringify(late.missing || late.arrives));
    ck('butNeverLongerThanItsBackstop', late.never && late.never.heldAt250 && late.never.landedIn >= 500 && late.never.landedIn <= 1200,
      JSON.stringify(late.missing || late.never));

    /* ---------------- 8. nothing of the kraken in the black ----------------
       (the same served page — a file:// canvas is tainted and cannot be read)
       A sea that runs into the board's edge — the rim row too, as an island
       map's ocean does — with the prey on the last playable row. The body
       comes up where ALL of it is drawn on the board (R.krakenBodyAt scores
       its wet ground through MapGen.onBoard, never G.wetAt's inB, which
       counts the rim), and every pixel the world's act and the card's act
       write lands on the board: each draw call is diffed against the canvas
       it was handed, its changed pixels mapped back through the call's own
       transform. The control widens R.boardPx — one patch opens every board
       clip at once — and takes the water's own outline away (the sea the
       act lays is laid through it, R.waterBodyPath, and a rim of open water
       is outside it, so with the outline in place the card's act has nothing
       left to lay in the black for the board clip to catch); the same probe
       must then see the kraken out there, or a probe that never looks at the
       rim would read as a pass forever. */
    const void8 = await q.evaluate(() => {
      G.newGame('beasts-void', 'moderate', 'medium');
      Screens.show('playing'); S.paused = true;
      const W = CFG.W, H = CFG.H, tcP = Bld.tcOf('P');
      const south = tcP.y < H / 2;
      const rows = south ? [H - 1, H - 2, H - 3, H - 4, H - 5, H - 6] : [0, 1, 2, 3, 4, 5];
      for (const y of rows) for (let x = 0; x < W; x++) { if (Bld.at(x, y)) continue; const i = y * W + x; S.map.terrain[i] = T.WATER; S.map.resAmount[i] = 0; }
      S.units = S.units.filter(u => S.map.terrain[Math.floor(u.y) * W + Math.floor(u.x)] !== T.WATER);
      Bld._block = null; G._wb = null; R.rebuildTerrain();
      G.reveal(Math.floor(W / 2), Math.floor(H / 2), W);
      const edge = south ? H - 2 : 1, prey = { x: 15.5, y: edge + 0.5 };
      // where the body comes up, and whether all of it is on the board
      const C = Beasts.KRAKEN, half = (C.frame || 224) * C.scale / 2 / CFG.TILE;
      const at = R.krakenBodyAt(prey.x, prey.y);
      const body = { at, half, onBoard: at.x - half >= 1 && at.x + half <= W - 1 && at.y - half >= 1 && at.y + half <= H - 1,
        reach: Math.hypot(at.x - prey.x, at.y - prey.y) };
      G.freeVis = true;   // the whole sea in sight: the act is drawn only where the player can see
      const hull = Units.spawn('fireship', 'A', 15, edge); hull.x = prey.x; hull.y = prey.y;
      G.updateVisibility();
      R.cam.z = 1.7; R.centerOn(prey.x, edge); if (R.clampCam) R.clampCam();
      const real = R.boardPx(), cx = R.cv.getContext('2d');
      // the changed pixels of one draw call that lie off the board (by more
      // than the clip's own antialiased edge pixel)
      const probe = (owner, key) => {
        const f = owner[key]; let off = 0, on = 0;
        owner[key] = function (g) {
          const T0 = g.getTransform(), a = cx.getImageData(0, 0, R.cv.width, R.cv.height).data;
          const ret = f.apply(this, arguments);
          const z = cx.getImageData(0, 0, R.cv.width, R.cv.height).data, cw = R.cv.width;
          const det = T0.a * T0.d - T0.b * T0.c, m = 1 / Math.abs(T0.a);
          for (let i = 0; i < z.length; i += 4) {
            if (z[i] === a[i] && z[i + 1] === a[i + 1] && z[i + 2] === a[i + 2] && z[i + 3] === a[i + 3]) continue;
            const px = (i >> 2) % cw + 0.5 - T0.e, py = ((i >> 2) / cw | 0) + 0.5 - T0.f;
            const wx = (T0.d * px - T0.c * py) / det, wy = (-T0.b * px + T0.a * py) / det;
            if (wx < real.x0 - m || wx >= real.x1 + m || wy < real.y0 - m || wy >= real.y1 + m) off++; else on++;
          }
          return ret;
        };
        return { done: () => { owner[key] = f; return { off, on }; } };
      };
      const out = { body };
      for (const wide of [false, true]) {
        const bp = R.boardPx, wbp = R.waterBodyPath;
        if (wide) { R.boardPx = function () { const b = bp.call(this), p = 6 * CFG.TILE; return { x0: b.x0 - p, y0: b.y0 - p, x1: b.x1 + p, y1: b.y1 + p }; }; R.waterBodyPath = () => null; }
        try {
          // THE WORLD'S KRAKEN, mid-thrash over its boat at the edge
          S.kraken = S.kraken || {};
          S.kraken.ev = { phase: 'thrash', t: 0.4, x: prey.x, y: prey.y, boatId: -1, owner: 'P' };
          let pr = probe(R, 'drawKrakenAct');
          R.draw(0);
          const world = pr.done();
          S.kraken.ev = null;
          // THE CARD'S, played on the hull at the edge and run into its thrash
          Deck._add('krakens_call', 1);
          const play = Deck.play('krakens_call');
          for (let i = 0; i < 160 && S.deck.kraken && !S.deck.kraken.acts.some(a => a.phase === 'thrash'); i++) Deck.krakenTick(0.05);
          G.updateVisibility();
          pr = probe(Deck.FX.krakens_call, 'draw');
          R.draw(0);
          const card = pr.done();
          out[wide ? 'control' : 'clipped'] = { world, card, play: !!play.ok, act: S.deck.kraken ? S.deck.kraken.acts.map(a => a.phase).join(',') : '-' };
          S.deck.kraken = null;
          const u2 = Units.spawn('fireship', 'A', 15, edge); u2.x = prey.x; u2.y = prey.y;
          G.updateVisibility();
        } finally { R.boardPx = bp; R.waterBodyPath = wbp; }
      }
      return out;
    });
    {
      const v = void8, B = v.body;
      ck('theKrakenComesUpWhollyOnTheBoard', B.onBoard && B.reach <= 3.05, JSON.stringify(B));
      ck('andNothingOfItIsDrawnInTheBlack', v.clipped && v.clipped.play && /thrash/.test(v.clipped.act) &&
        v.clipped.world.on > 0 && v.clipped.world.off === 0 && v.clipped.card.on > 0 && v.clipped.card.off === 0,
        JSON.stringify(v.clipped));
      ck('andTheVoidProbeCanSeeTheKraken', v.control && v.control.world.off > 0 && v.control.card.off > 0,
        'with the board widened: ' + JSON.stringify(v.control));
    }

    /* ---------------- 9. DRAGONFIRE: THE ULTIMATE PRIZE'S ACT ----------------
       (the playtest: on screen ~2.3s, the view pulling OUT until the beast was
       a mid-size sprite over a small town, the head and a wing drawn across
       the off-map black, a warm wash over the ground, no title.) Played with
       the real Deck.play on this served phone page, the act's own sim and
       camera ticked frame by frame and drawn through the real R.draw:
         IN FROM THE BOARD   aimed by either edge, it starts its run over the
                             board, on the far side from the near edge
         NOT IN THE BLACK    by the west edge every pixel the act writes —
                             beast, breath, pall, the shadow's sweep — lies
                             on the board (a control widens R.boardPx)
         IN ON THE FIRE      from a player's zoom of 0.8 or 1.7 the view is
                             at the act's zoom through the breath, the beast
                             spans 60%+ of the screen's width, and after it
                             the view is handed back where it was
         EPIC AND EARNED     the shadow sweeps the full width of the screen
                             first, the title goes up, the beast is on screen
                             3.5s+ (whole, half its box or more in frame),
                             every building the fire reaches catches on its
                             own beat and shakes the view, and no warm light
                             is ever laid over the ground */
    const d9 = await q.evaluate(() => {
      const out = {};
      G.newGame('beasts-dragon', 'moderate', 'medium');
      Screens.show('playing'); S.paused = true;
      const W = CFG.W, H = CFG.H, TL = CFG.TILE, DF = Deck.FX.dragonfire;
      // open ground across the middle of the board, seen
      const row = Math.floor(H / 2);
      S.units = S.units.filter(u => Math.abs(u.y - row) > 6);
      S.buildings = S.buildings.filter(b => b.key === 'tc' && Math.abs(b.y - row) > 6);
      for (let y = row - 6; y <= row + 6; y++) for (let x = 0; x < W; x++) { const i = y * W + x; S.map.terrain[i] = T.GRASS; S.map.resAmount[i] = 0; }
      Bld._block = null; G._wb = null; R.rebuildTerrain();
      G.freeVis = true;
      for (let i = 0; i < W * H; i++) S.map.explored[i] = 1;
      G.updateVisibility();
      const vw = R.viewW(), z0 = R.cam.z;
      // the act, run on its own clocks (the sim's and the camera's), drawn whole
      const run = (T, zoom, each) => {
        Deck._add('dragonfire', 1);
        R.cam.z = zoom; R.centerOn(T.x, T.y); R.clampCam();
        const home = { x: R.cam.x, y: R.cam.y, z: R.cam.z };
        const play = Deck.play('dragonfire', T);
        const ev = S.dragon.ev, start = ev ? { x: ev.x, dir: ev.dir } : null;
        let t = 0;
        for (let i = 0; i < 400 && (S.dragon.ev || DF._cam); i++) {
          const dt = 1 / 30;
          if (S.dragon.ev) G.dragonTick(dt);
          DF.cam(dt);
          t += dt;
          if (each) each(t, i);
        }
        return { ok: !!(play && play.ok), start, home, end: { x: R.cam.x, y: R.cam.y, z: R.cam.z } };
      };
      // IN FROM THE BOARD — by either edge
      out.entry = [3.5, W - 3.5].map(x => {
        const r = run({ x, y: row + 0.5 }, z0);
        const inward = x < W / 2 ? 1 : -1;
        return { x, start: r.start && +r.start.x.toFixed(2), onBoard: !!r.start && r.start.x >= 1 && r.start.x <= W - 1,
          fromInside: !!r.start && (r.start.x - x) * inward > 0 };
      });
      // IN ON THE FIRE — and every picture of it, frame by frame
      const flyF = new Set([...(Assets.fxFrames('dragon-fly') || []), ...(Assets.fxFrames('dragon-breath') || [])]);
      // (the shadow's sweep is the frame's silhouette — blurred soft since the
      // operator's ruling on the effects, Beasts.softShadow — either counts)
      const silF = new Set([...flyF].flatMap(f => [Beasts.silhouette(f), ...(Beasts.softShadow ? [Beasts.softShadow(f)] : [])]));
      const g = R.cv.getContext('2d'), di = g.drawImage, CW = R.cv.width, CH = R.cv.height;
      let rec = null;
      g.drawImage = function (img, ...a) {
        if (rec && (flyF.has(img) || silF.has(img)) && a.length >= 4) {
          const Tm = this.getTransform(), dx = a.length === 4 ? a[0] : a[4], dy = a.length === 4 ? a[1] : a[5], dw = a.length === 4 ? a[2] : a[6], dh = a.length === 4 ? a[3] : a[7];
          const xs = [Tm.a * dx + Tm.c * dy + Tm.e, Tm.a * (dx + dw) + Tm.c * dy + Tm.e], ys = [Tm.b * dx + Tm.d * dy + Tm.f, Tm.b * dx + Tm.d * (dy + dh) + Tm.f];
          const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
          (silF.has(img) ? rec.sil : rec.beast).push({ x0, x1, y0, y1, a: this.globalAlpha });
        }
        return di.call(this, img, ...a);
      };
      const shakes = [], flashes = [], titles = new Set(), sa = R.shakeAt, fa = R.flashAt, at = R.actTitle, crg = g.createRadialGradient;
      let radial = 0, pools = 0, tNow = 0, fireRow = 0;
      R.shakeAt = function (amp, dur) { shakes.push({ t: tNow, amp }); return sa.apply(this, arguments); };
      R.flashAt = function (a, d, col) { flashes.push(col || 'white'); return fa.apply(this, arguments); };
      R.actTitle = function (gg, title) { titles.add(title); return at.apply(this, arguments); };
      /* NO LIGHT POOLED ON THE GROUND (the dry summer's ruling, the breath's
         too): a light may be soft now (the operator's ruling on the effects —
         the breath's glow in the air, a spark, an ember), but none wider
         than a little over half a tile may stand on the ground along the
         fire line — that is the warm pool that read as sand. Every radial
         gradient's middle and reach, taken back to the world */
      g.createRadialGradient = function (x0, y0, r0, x1, y1, r1) {
        radial++;
        const Tm = this.getTransform(), z = R.cam.z * R.dpr, sc = Math.max(Math.hypot(Tm.a, Tm.b), Math.hypot(Tm.c, Tm.d));
        const dy = Tm.b * x1 + Tm.d * y1 + Tm.f, wy = dy / z + R.cam.y, wr = r1 * sc / z;
        if (wr >= TL * 0.6 && Math.abs(wy - fireRow * TL) <= TL * 1.2) pools++;
        return crg.apply(this, arguments);
      };
      /* THE BREATH IS DRAWN AT THE DEVICE'S OWN RESOLUTION (the operator's
         ruling, 2026-10-27: "the rays are pixelated again… higher pixel
         count"): inside R.drawDragonBreath not one cell is filled — no
         fillRect, no R.pxDisc — only smooth paths (the beast and the
         burning-town flames are pictures, drawn by drawImage) */
      const breath = { calls: 0, cells: 0, disc: 0, fills: 0 };
      const ddb = R.drawDragonBreath, pxd = R.pxDisc, gfr = g.fillRect, gfl = g.fill;
      let inBreath = 0;
      R.drawDragonBreath = function () { breath.calls++; inBreath++; try { return ddb.apply(this, arguments); } finally { inBreath--; } };
      R.pxDisc = function () { if (inBreath) breath.disc++; return pxd.apply(this, arguments); };
      g.fillRect = function () { if (inBreath) breath.cells++; return gfr.apply(this, arguments); };
      g.fill = function () { if (inBreath) breath.fills++; return gfl.apply(this, arguments); };
      out.cams = {};
      try {
        for (const zoom of [0.8, 1.7]) {
          // a rival hamlet along the line, house by house
          const T = { x: Math.round(W / 2) + 6.5, y: row + 0.5 };
          S.buildings = S.buildings.filter(b => b.owner !== 'A' || b.key === 'tc');
          fireRow = row + 0.5;
          const houses = [-2, 0, 2].map(dx => { const b = Bld.place('A', 'house', T.x - 0.5 + dx, row, { free: true, instant: true }); b.hp = b.maxhp = 900; return b; });
          Bld._block = null; G.updateVisibility();
          const caught = {}, beastT = [], zs = [], spans = [];
          shakes.length = 0; flashes.length = 0; titles.clear(); radial = 0; pools = 0;
          let sweptWide = false, sweepMin = 1e9, sweepMax = -1e9;
          const r = run(T, zoom, (t) => {
            tNow = t;
            rec = { beast: [], sil: [] };
            R.draw(1 / 30);
            const ev = S.dragon.ev;
            if (ev && ev.phase === 'burn') { zs.push(R.cam.z); for (const b of rec.beast) spans.push((b.x1 - b.x0) * (250 / 256) / CW); }
            // on screen: drawn WHOLE (full alpha, never a fading ghost) with half its box or more in the frame
            const inside = b => Math.max(0, Math.min(CW, b.x1) - Math.max(0, b.x0)) * Math.max(0, Math.min(CH, b.y1) - Math.max(0, b.y0)) / ((b.x1 - b.x0) * (b.y1 - b.y0));
            if (rec.beast.some(b => b.a >= 0.99 && inside(b) >= 0.5)) beastT.push(t);
            for (const s of rec.sil) { if (s.x1 - s.x0 >= CW) sweptWide = true; sweepMin = Math.min(sweepMin, (s.x0 + s.x1) / 2); sweepMax = Math.max(sweepMax, (s.x0 + s.x1) / 2); }
            for (const b of houses) if (caught[b.id] == null && b.hp < 900) caught[b.id] = t;
            rec = null;
          });
          const times = Object.values(caught).sort((a, b) => a - b);
          out.cams[zoom] = {
            ok: r.ok, zMin: zs.length ? +Math.min(...zs).toFixed(3) : null, zMax: zs.length ? +Math.max(...zs).toFixed(3) : null,
            span: spans.length ? +Math.min(...spans).toFixed(2) : null,
            back: Math.abs(r.end.z - r.home.z) < 0.01 && Math.abs(r.end.x - r.home.x) < 2 && Math.abs(r.end.y - r.home.y) < 2,
            onScreen: +(beastT.length / 30).toFixed(2),
            sweep: { wide: sweptWide, across: sweepMax - sweepMin >= CW },
            title: [...titles].join('|'),
            caught: times.map(t => +t.toFixed(2)),
            shook: times.filter(tc => shakes.some(s => Math.abs(s.t - tc) < 0.05)).length,
            warm: flashes.filter(c => { const m = /(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(c); return m && +m[1] > +m[3] + 40; }).length,
            radial, pools,
          };
        }
      } finally {
        g.drawImage = di; R.shakeAt = sa; R.flashAt = fa; R.actTitle = at; g.createRadialGradient = crg;
        R.drawDragonBreath = ddb; R.pxDisc = pxd; g.fillRect = gfr; g.fill = gfl;
      }
      out.breath = breath;
      // NOT IN THE BLACK: by the west edge, every pixel the act writes, through its own transform
      const real = R.boardPx(), cx = R.cv.getContext('2d');
      const probe = (owner, key, sky) => {
        const f = owner[key]; let off = 0, on = 0;
        owner[key] = function (gg) {
          const T0 = gg.getTransform(), a = cx.getImageData(0, 0, CW, CH).data;
          const ret = f.apply(this, arguments);
          const zz = cx.getImageData(0, 0, CW, CH).data, z = R.cam.z * R.dpr;
          const det = T0.a * T0.d - T0.b * T0.c, m = sky ? 1 / z : 1 / Math.abs(T0.a);
          for (let i = 0; i < zz.length; i += 4) {
            if (zz[i] === a[i] && zz[i + 1] === a[i + 1] && zz[i + 2] === a[i + 2] && zz[i + 3] === a[i + 3]) continue;
            const px = (i >> 2) % CW + 0.5, py = ((i >> 2) / CW | 0) + 0.5;
            let wx, wy;
            if (sky) { wx = px / z + R.cam.x; wy = py / z + R.cam.y; }
            else { const qx = px - T0.e, qy = py - T0.f; wx = (T0.d * qx - T0.c * qy) / det; wy = (-T0.b * qx + T0.a * qy) / det; }
            if (wx < real.x0 - m || wx >= real.x1 + m || wy < real.y0 - m || wy >= real.y1 + m) off++; else on++;
          }
          return ret;
        };
        return () => { owner[key] = f; return { off, on }; };
      };
      out.void = {};
      for (const wide of [false, true]) {
        const bp = R.boardPx;
        if (wide) R.boardPx = function () { const b = bp.call(this), p = 6 * TL; return { x0: b.x0 - p, y0: b.y0 - p, x1: b.x1 + p, y1: b.y1 + p }; };
        const keepT = R.actTitle; R.actTitle = () => null;      // the title is lettering over the HUD's band, not the world
        let world = { off: 0, on: 0 }, sky = { off: 0, on: 0 };
        try {
          const T = { x: 3.5, y: row + 0.5 };
          run(T, 1.7, (t, i) => {
            if (i % 4) { R.draw(1 / 30); return; }
            const pw = probe(R, 'drawDragonAct', false), ps = DF.show ? probe(DF.show, 'draw', true) : () => ({ off: 0, on: 0 });
            R.draw(1 / 30);
            const a = pw(), b = ps();
            world.off += a.off; world.on += a.on; sky.off += b.off; sky.on += b.on;
          });
        } finally { R.boardPx = bp; R.actTitle = keepT; }
        out.void[wide ? 'control' : 'clipped'] = { world, sky };
      }
      G.freeVis = false;
      return out;
    });
    {
      ck('theCardsDragonComesInFromTheBoardsSide', d9.entry.every(e => e.onBoard && e.fromInside), JSON.stringify(d9.entry));
      const v = d9.void;
      ck('andNoPixelOfItsActIsDrawnInTheBlack', v.clipped.world.on > 0 && v.clipped.world.off === 0 && v.clipped.sky.on > 0 && v.clipped.sky.off === 0,
        JSON.stringify(v.clipped));
      ck('andTheVoidProbeCanSeeTheDragon', v.control.world.off > 0, 'with the board widened: ' + JSON.stringify(v.control));
      const C = d9.cams;
      ck('theViewGoesInOnTheFireWhateverTheZoom', [0.8, 1.7].every(z => C[z].ok && C[z].zMin >= 1.25 && C[z].zMax <= 1.35 && C[z].back),
        Object.entries(C).map(([z, c]) => `from ${z}: ${c.zMin}..${c.zMax} through the breath, handed back ${c.back}`).join('; '));
      ck('andTheBeastFillsMostOfTheScreensWidth', [0.8, 1.7].every(z => C[z].span >= 0.6), Object.entries(C).map(([z, c]) => `from ${z}: ${c.span}`).join('; '));
      ck('itsShadowSweepsTheScreenFirstAndTheTitleGoesUp', [0.8, 1.7].every(z => C[z].sweep.wide && C[z].sweep.across && C[z].title === 'THE BLACK DRAGON ANSWERS'),
        Object.entries(C).map(([z, c]) => `${z}: ${JSON.stringify(c.sweep)} '${c.title}'`).join('; '));
      ck('theBeastIsOnScreenAboutFourSeconds', [0.8, 1.7].every(z => C[z].onScreen >= 3.5 && C[z].onScreen <= 6), Object.entries(C).map(([z, c]) => `${z}: ${c.onScreen}s`).join('; '));
      ck('theFireWalksTheLineBuildingByBuildingAndEachIsFelt', [0.8, 1.7].every(z => C[z].caught.length === 3 && new Set(C[z].caught).size === 3 &&
        C[z].caught[2] - C[z].caught[0] >= 1 && C[z].shook === 3),
        Object.entries(C).map(([z, c]) => `${z}: caught at ${c.caught.join('/')}s, ${c.shook} shaken`).join('; '));
      ck('andNoWarmLightIsLaidOverTheGround', [0.8, 1.7].every(z => C[z].warm === 0 && C[z].pools === 0),
        Object.entries(C).map(([z, c]) => `${z}: ${c.warm} warm flashes, ${c.pools} lights wider than 0.6 tile on the fire line (of ${c.radial} soft lights)`).join('; '));
      const bz = d9.breath;
      ck('andItsBreathIsDrawnAtTheDevicesOwnResolution', bz.calls > 0 && bz.fills > 0 && bz.cells === 0 && bz.disc === 0,
        `${bz.calls} breaths: ${bz.fills} smooth fills, ${bz.cells} cells filled, ${bz.disc} pixel discs`);
    }

    /* ---------------- 10. KRAKEN'S CALL: OUT OF THE REAL SEA ----------------
       (the playtest: on a narrow sea the beast's own disc of dark water lay
       on the meadow beside it — a navy coin on the grass — it surfaced
       through a hard circle cut out of itself, its blows threw pale shards
       that read as ICE, the hulls simply vanished, and the view sat where it
       was, the beast half under the minimap.) Played with the real Deck.play
       on this served phone page over a NARROW SEA (four rows, land on both
       sides), the act's sim and the borrowed view ticked frame by frame and
       drawn through the real R.draw, every body draw's changed pixels mapped
       back to the world through its own transform:
         ITS SEA ON THE SEA   no pixel of the frame's own sea (blue-led or
                              near-white) lands on land, and nothing of the
                              beast below its waterline does — the card's
                              act and the world's alike (R.drawKrakenBody)
         WATER, NOT ICE       the arm's blow frames (7-10) carry no pale
                              shard; a blow on the sea throws a splash in the
                              water's own ramp (R.drawSplash)
         HULL BY HULL         every hull the deep takes is drawn after the
                              take — its own sprite, heeling over — with a
                              splash where it goes down
         SMOOTH WATER         the foam, spray, rings and whirl the deep
                              throws are drawn at the device's own resolution
                              (the operator's ruling on the effects): no
                              light cell filled in its acts; the beast's own
                              cells (its arm, the eye in its socket) are art
         FRAMED, HANDED BACK  from a player's zoom of 0.8 the view goes in on
                              the deep (1.3+); the sky's head comes up out of
                              real water, its waterline in the open band; and
                              after the act the view is handed back */
    const k10 = await q.evaluate(() => {
      const out = {};
      G.newGame('beasts-kraken', 'moderate', 'medium');
      Screens.show('playing'); S.paused = true;
      const W = CFG.W, H = CFG.H, TL = CFG.TILE, KC = Deck.FX.krakens_call, row = Math.floor(H / 2);
      S.units = S.units.filter(u => Math.abs(u.y - row) > 8);
      S.buildings = S.buildings.filter(b => b.key === 'tc' && Math.abs(b.y - row) > 8);
      for (let y = row - 7; y <= row + 7; y++) for (let x = 1; x < W - 1; x++) {
        const i = y * W + x, sea = y >= row - 2 && y <= row + 1 && x >= 3 && x <= W - 4;
        S.map.terrain[i] = sea ? T.WATER : T.GRASS; S.map.resAmount[i] = 0;
      }
      Bld._block = null; G._wb = null; R.rebuildTerrain();
      G.freeVis = true;
      for (let i = 0; i < W * H; i++) S.map.explored[i] = 1;
      const cx0 = Math.floor(W / 2);
      const hulls = [[-7, 'fireship'], [0, 'bombard'], [7, 'transport']].map(([dx, k]) => { const u = Units.spawn(k, 'A', cx0 + dx, row); u.x = cx0 + dx + 0.5; u.y = row + 0.5; return u; });
      Bld.place('A', 'house', cx0 + 3, row - 3, { free: true, instant: true }).hp = 5000;
      Bld._block = null; G.updateVisibility();
      out.knows = KC.knows ? KC.knows() : null;
      R.cam.z = 0.8; R.centerOn(cx0 + 0.5, row + 0.5); R.clampCam();
      const home = { x: R.cam.x, y: R.cam.y, z: R.cam.z };
      const g = R.cv.getContext('2d'), CW = R.cv.width, CH = R.cv.height, dpr = R.dpr;
      const wet = (wx, wy) => { for (const [ox, oy] of [[0, 0], [-0.3, 0], [0.3, 0], [0, -0.3], [0, 0.3]]) if (G.wetAt(wx / TL + ox, wy / TL + oy)) return true; return false; };
      // every body draw on the probed frames: its changed pixels, through its own transform
      const body = { calls: 0, px: 0, seaOnLand: 0, belowOnLand: 0 };
      const dkb = R.drawKrakenBody;
      let probeOn = false;
      R.drawKrakenBody = function (gg, x, y) {
        if (!probeOn || gg !== g) return dkb.apply(this, arguments);
        const T0 = gg.getTransform(), a = g.getImageData(0, 0, CW, CH).data;
        const ret = dkb.apply(this, arguments);
        const z = g.getImageData(0, 0, CW, CH).data, det = T0.a * T0.d - T0.b * T0.c;
        const wl = Beasts.snap(y * TL) + (Beasts.KRAKEN.waterline || 0) * Beasts.KRAKEN.scale;
        body.calls++;
        for (let i = 0; i < z.length; i += 4) {
          if (z[i] === a[i] && z[i + 1] === a[i + 1] && z[i + 2] === a[i + 2] && z[i + 3] === a[i + 3]) continue;
          const qx = (i >> 2) % CW + 0.5 - T0.e, qy = ((i >> 2) / CW | 0) + 0.5 - T0.f;
          const wx = (T0.d * qx - T0.c * qy) / det, wy = (-T0.b * qx + T0.a * qy) / det;
          body.px++;
          if (wet(wx, wy)) continue;
          const r = z[i], gr = z[i + 1], bl = z[i + 2];
          if ((gr >= r && bl > r + 8 && r + gr + bl > 30) || (r > 196 && gr > 196 && bl > 196)) body.seaOnLand++;
          if (wy > wl + 1) body.belowOnLand++;
        }
        return ret;
      };
      // the hulls as drawn before the take — and every heeled-over draw of one after it
      const hullImg = new Set(), us = R.unitSprite;
      R.unitSprite = function (u) { const im = us.apply(this, arguments); if (u && u.owner === 'A' && Units.isNaval(u) && im) hullImg.add(im); return im; };
      const di = g.drawImage, seizedAt = {}, splashes = {}, ds = R.drawSplash;
      let tNow = 0;
      const nearHull = wx => hulls.find(h => Math.abs(h.x * TL - wx) < TL * 1.3);
      g.drawImage = function (img, ...rest) {
        if (hullImg.has(img)) {
          const Tm = this.getTransform();
          if (Math.abs(Tm.b) > 0.01) {
            const h = nearHull(Tm.e / (R.cam.z * dpr) + R.cam.x);
            if (h && !S.units.includes(h)) (seizedAt[h.id] = seizedAt[h.id] || []).push(tNow);
          }
        }
        return di.call(this, img, ...rest);
      };
      if (ds) R.drawSplash = function (gg, x, y, t) { const h = nearHull(x); if (h && t >= 0 && t < 0.8) (splashes[h.id] = splashes[h.id] || []).push(tNow); return ds.apply(this, arguments); };
      /* THE WATER IT THROWS IS DRAWN AT THE DEVICE'S OWN RESOLUTION (the
         operator's ruling, 2026-10-27): inside the deep's acts — the world's
         (R.drawKrakenAct, R.drawSplash) and the card's (its sky and its
         world draw) — no LIGHT is filled as a square cell: the foam, the
         spray, the rings rolling out and the whirl are smooth (R.fxFoam /
         R.fxDrop), never 2px dots. What is drawn in cells is the BEAST — its
         arm, the eye in its socket, the lids over the art's own eyes — and
         stays pixel art. */
      const lightC = c => {
        c = String(c); let m = /^#([0-9a-f]{6})$/i.exec(c), r, gg, bb;
        if (m) { const n = parseInt(m[1], 16); r = n >> 16; gg = (n >> 8) & 255; bb = n & 255; }
        else if ((m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c))) { r = +m[1]; gg = +m[2]; bb = +m[3]; }
        else return false;
        return 0.299 * r + 0.587 * gg + 0.114 * bb >= 150;
      };
      const water = { cells: 0, smooth: 0 }, wraps = [];
      let inAct = 0, inArt = 0;
      const wrapOn = (o, k, art) => {
        const f = o && o[k]; if (typeof f !== 'function') return;
        o[k] = function () { if (art) inArt++; else inAct++; try { return f.apply(this, arguments); } finally { if (art) inArt--; else inAct--; } };
        wraps.push(() => { o[k] = f; });
      };
      wrapOn(R, 'drawKrakenAct'); wrapOn(R, 'drawSplash'); wrapOn(KC.show || {}, 'draw'); wrapOn(KC, 'draw');
      wrapOn(KC, 'arm', true); wrapOn(KC, 'eye', true);
      for (const k of ['fxFoam', 'fxDrop']) { const f = R[k]; if (typeof f !== 'function') continue; R[k] = function () { if (inAct) water.smooth++; return f.apply(this, arguments); }; wraps.push(() => { R[k] = f; }); }
      const gfr = g.fillRect;
      g.fillRect = function (x, y, w, h) {
        if (inAct && !inArt) {
          const Tm = this.getTransform(), dw = Math.abs(w * Tm.a), dh = Math.abs(h * Tm.d);
          if (dw > 0 && Math.abs(dw - dh) < 0.01 && lightC(this.fillStyle)) water.cells++;
        }
        return gfr.apply(this, arguments);
      };
      wraps.push(() => { g.fillRect = gfr; });
      const zs = [], sky = [];
      try {
        Deck._add('krakens_call', 1);
        out.play = Deck.play('krakens_call');
        out.at = KC.skyAt ? KC.skyAt() : null;
        const B = Deck.view && Deck.view.band ? Deck.view.band() : null;
        out.band = B && { top: Math.round(B.top), bot: Math.round(B.bot) };
        for (let i = 0; i < 900; i++) {
          const dt = 1 / 30;
          tNow = i * dt;
          if (S.deck.kraken) Deck.krakenTick(dt);
          if (Deck.view && Deck.view.tick) Deck.view.tick(dt);
          probeOn = i % 4 === 2;
          R.draw(dt);
          const s = R.cardShows.find(z => z.id === 'krakens_call');
          if (tNow >= 1.3 && tNow <= 3.4) zs.push(R.cam.z);
          if (s && s.wlY != null && tNow >= 1.5 && tNow <= 3.2) sky.push(s.wlY / dpr);
          if (!S.deck.kraken && !(Deck.view && Deck.view.s) && !R.cardShows.length) break;
        }
        out.taken = hulls.filter(h => !S.units.includes(h)).map(h => h.id);
        out.seized = out.taken.map(id => (seizedAt[id] || []).length);
        out.splashed = out.taken.map(id => (splashes[id] || []).length);
        out.zMin = zs.length ? +Math.min(...zs).toFixed(3) : null;
        out.sky = sky.length ? { lo: Math.round(Math.min(...sky)), hi: Math.round(Math.max(...sky)) } : null;
        out.headOnWater = !!(out.at && out.at.wl != null && G.wetAt(out.at.x, out.at.wl - 0.15));
        out.back = Math.abs(R.cam.z - home.z) < 0.01 && Math.abs(R.cam.x - home.x) < 2 && Math.abs(R.cam.y - home.y) < 2;
        out.cardBody = { ...body };
        // THE WORLD'S KRAKEN over the same channel, rising and mid-thrash
        Object.assign(body, { calls: 0, px: 0, seaOnLand: 0, belowOnLand: 0 });
        R.cam.z = 1.4; R.centerOn(cx0 + 0.5, row); R.clampCam();
        S.kraken = S.kraken || {};
        probeOn = true;
        for (const [ph, t] of [['rise', 1.0], ['thrash', 0.5]]) {
          S.kraken.ev = { phase: ph, t, x: cx0 - 3.5, y: row + 0.5, boatId: -1, owner: 'P' };
          R.draw(0);
        }
        S.kraken.ev = null;
        out.worldBody = { ...body };
      } finally { for (const un of wraps.reverse()) un(); R.drawKrakenBody = dkb; R.unitSprite = us; g.drawImage = di; if (ds) R.drawSplash = ds; probeOn = false; if (S.kraken) S.kraken.ev = null; }
      out.water = water;
      // WATER, NOT ICE: the arm's blow frames, laid on the board one by one
      const world = () => g.setTransform(R.cam.z * dpr, 0, 0, R.cam.z * dpr, -R.cam.x * R.cam.z * dpr, -R.cam.y * R.cam.z * dpr);
      const pale = [];
      for (let f = 7; f <= 10; f++) {
        R.draw(0);
        g.save(); world();
        const a = g.getImageData(0, 0, CW, CH).data;
        R.drawTentacle(g, cx0 + 4.5, row - 2.5, f, 1);
        const z = g.getImageData(0, 0, CW, CH).data;
        g.restore();
        let n = 0;
        for (let i = 0; i < z.length; i += 4) if ((z[i] !== a[i] || z[i + 1] !== a[i + 1] || z[i + 2] !== a[i + 2]) && z[i] > 196 && z[i + 1] > 196 && z[i + 2] > 196) n++;
        pale.push(n);
      }
      out.pale = pale;
      // …and a blow on the sea throws the water's own colours
      {
        R.draw(0);
        g.save(); world();
        const a = g.getImageData(0, 0, CW, CH).data, WR = new Set(ART.PALETTE.water.map(h => h.toLowerCase()));
        let calls = 0;
        const ds2 = R.drawSplash;
        if (ds2) R.drawSplash = function () { calls++; return ds2.apply(this, arguments); };
        try { R.drawTentacle(g, cx0 + 0.5, row - 0.5, 8, 1, 0.12); } finally { if (ds2) R.drawSplash = ds2; }
        const z = g.getImageData(0, 0, CW, CH).data;
        g.restore();
        const hex = i => '#' + [z[i], z[i + 1], z[i + 2]].map(v => v.toString(16).padStart(2, '0')).join('');
        let ramp = 0;
        for (let i = 0; i < z.length; i += 4) if ((z[i] !== a[i] || z[i + 1] !== a[i + 1] || z[i + 2] !== a[i + 2]) && WR.has(hex(i))) ramp++;
        out.seaBlow = { calls, ramp };
      }
      G.freeVis = false;
      return out;
    });
    {
      const k = k10;
      ck('theKrakensSeaLiesOnTheSea', k.play && k.play.ok && k.cardBody.calls > 0 && k.cardBody.seaOnLand === 0 && k.worldBody.calls > 0 && k.worldBody.seaOnLand === 0,
        `the card's act: ${k.cardBody.seaOnLand} sea-coloured px on land of ${k.cardBody.px} (${k.cardBody.calls} draws); the world's: ${k.worldBody.seaOnLand} of ${k.worldBody.px}`);
      ck('andItRisesOutOfItsWaterlineNeverThroughTheLand', k.cardBody.belowOnLand === 0 && k.worldBody.belowOnLand === 0 && k.worldBody.px > 0,
        `below its waterline on land: the card's ${k.cardBody.belowOnLand}, the world's ${k.worldBody.belowOnLand}`);
      ck('theBlowThrowsWaterNeverIce', k.pale.every(n => n === 0) && k.seaBlow.calls === 1 && k.seaBlow.ramp > 0,
        `pale shard px on frames 7-10: ${k.pale.join('/')}; a blow on the sea: ${k.seaBlow.calls} splash, ${k.seaBlow.ramp} px in the water's ramp`);
      ck('everyHullTakenIsSeenSeizedAndGoesDownInASplash', k.taken.length === 3 && k.seized.every(n => n >= 3) && k.splashed.every(n => n >= 3),
        `taken ${k.taken.length}; heeling-over draws after the take ${k.seized.join('/')}; splash frames ${k.splashed.join('/')}`);
      ck('theWaterItThrowsIsDrawnAtTheDevicesOwnResolution', k.water.smooth > 0 && k.water.cells === 0,
        `${k.water.smooth} smooth foam and spray draws; ${k.water.cells} light cells filled in the deep's acts`);
      ck('theViewGoesInOnTheDeepAndIsHandedBack', k.knows && k.zMin != null && k.zMin >= 1.25 && k.back,
        `knows ${k.knows}; zoom through the sky's moment from 0.8: ${k.zMin}; handed back ${k.back}`);
      ck('theHeadComesUpOutOfRealWaterInTheOpenBand', k.headOnWater && k.sky && k.band && k.sky.lo >= k.band.top && k.sky.hi <= k.band.bot,
        `the head's waterline on water ${k.headOnWater}; on screen at ${JSON.stringify(k.sky)} css px, the open band ${JSON.stringify(k.band)}`);
    }
  } finally {
    await cx2.close();
    srv.close();
  }
  if (qerr.length) errs.push(...qerr.map(e => 'http page: ' + e));
}

await b.close();
for (const [k, v] of Object.entries(res)) console.log((v.startsWith('PASS') ? '  ' : '✗ ') + k + ': ' + v);
if (errs.length) console.log('page errors:', errs.slice(0, 5));
if (fails.length || errs.length) { console.log(`\n${fails.length} FAILURE(S)`); process.exit(1); }
console.log('\nall beast checks pass');
