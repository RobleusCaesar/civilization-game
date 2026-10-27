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
     THE JAWS          the breath is drawn from the dragon's jaws to the line
                       of fire the act lays: the jaws hang just behind it,
                       facing either way
     OPEN WATER        the kraken comes up where the water is, not on the
                       shore it reaches across, and within a tentacle's reach
                       of its prey
     THEY ARE HEARD    a roar, a breath, the deep's groan and the slam
     THE ART IS THERE  on a phone's wire with a cold cache, a run founded
                       through the real entry holding both beast cards plays
                       them a beat after entering and both acts open on the
                       DRAWN beasts — never the procedural stand-in. The held
                       cards ask at HIGH priority (Deck.wantArt, G.warmFx),
                       and the play's landing waits for strips that are
                       merely late (DeckUI.ART_WAIT_MS), never longer

   Run after touching: js/beasts.js, the dragon/kraken blocks of R.draw,
   Assets.FX_SETS / wantFx / whenFx, Deck.wantArt, DeckUI._run's landing,
   G.warmFx, G.dragonTick / G.krakenTick's phases.

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

// ---------------- 3. the jaws hang over the line of fire ----------------
{
  const r = await p.evaluate(() => {
    const C = Beasts.DRAGON, TL = CFG.TILE, out = [];
    for (const dir of [1, -1]) {
      // the drawing's own arithmetic at the bottom of the dive (alt = altLow, scale = scaleLow)
      const x = 20, back = (C.reach - C.lead) * TL - C.mouth[0] * C.scaleLow;
      const jaws = (x * TL + dir * back + dir * C.mouth[0] * C.scaleLow) / TL;
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
