/* THE GOLD RING ON THE GROUND — R.GRING, R.drawGRing / gringUnder / gringOver
   / drawGRingMotes / drawGRingBurst / gringTick / gringSel / gringGuide /
   drawGRingTile, Prologue.groundRings / _gSet, the perched bow's ring
   (Lookout.draw).

   Operator, build 188, on a phone shot of the journey's ring hanging over a
   villager: "it's pretty generic, it just kind of floats over the character …
   a ring around the character, but the ring is on the ground, and where the
   character is standing the ring goes behind the character … it should pulse
   … little sparkles going upwards toward the sky … a little narrower … once
   you click on there's a little tiny flurry of gold sparkles … branch it over
   to when you're normally playing, in any mode … visible, but not overwhelm
   the screen … high quality, high pixel".

   Served over HTTP (the world canvas is read). The frame loop is stood down
   and the clock frozen, so every frame below is drawn by the test, at a time
   it chose (and after a few draws at it: the water's surface is brought to a
   new moment over a few frames). Pinned:

     ON THE GROUND, ROUND HIS FEET   his soles stand in the ring's middle, and
                                     the ring is a little wider than he is
     BEHIND HIM                      where his legs stand on the ring's far arc
                                     the ring is hidden; its near arc, in front
                                     of his feet, is whole
     AT THE DEVICE'S PIXELS          many shades, a soft edge: never the art's
                                     grain
     GOLD, NOT OLIVE                 its bright band is gold over the meadow
     THE SNAP AND THE FLURRY         a unit taken in hand: its ring lands from
                                     wider and throws gold sparks up; a ring
                                     long held throws nothing; a crowd taken at
                                     once throws fewer each
     A FOE'S RING IS RUST            and throws nothing
     A BUILDING STANDS IN ITS RING   round the foot of its art, never a box on
                                     its roof
     A STILL FRAME, NO RNG           two draws at one clock are one picture,
                                     and a ring draws no Math.random
     NOTHING IN THE BLACK            a ring and its flurry at the board's edge
                                     stop at it (and the probe can see a leak)
     REDUCED MOTION                  the ring stays still: no snap, no flurry,
                                     no glint running round it
     CALM IN A CROWD, CHEAP          the glint runs round a lone man's ring (a
                                     few in hand), never a crowd's; a ring at
                                     rest is laid from its own picture, so
                                     thirty in hand cost a blit a man
     THE JOURNEY'S RING              a world target is ringed on the ground by
                                     the renderer while #proRing stands over it
                                     unseen (a tap at its centre lands on him);
                                     it breathes and motes rise off it; it fades
                                     in where the line points and out where it
                                     pointed; round a tree it runs behind the
                                     crowns (the wood laid back over it); a man
                                     up a tower keeps the element's ring

   …AND THE GOLD THAT SAYS "THIS ONE", AND "WELL DONE" (js/goldfx.js —
   operator, build 198: "the buildings … almost shimmering gold around them
   with the flakes … rising up into the sky … the ring should be tied around
   them … a little burst of gold … a nice little gold pop when they are
   finished"):

     THE GUIDE'S HALO HUGS ITS OWN   lit round a building's outline and over
     OUTLINE                         its roof, never out where a box would be;
                                     gold, not olive
     GOLD LEAF RISES OFF IT          into the sky, in several bands over the
                                     roof (and over a man's head)
     A SHEEN RUNS ACROSS IT          now and then, moving, never off its own
                                     picture
     A MAN IS WOUND ROUND WITH LIGHT  light crossing in front of him and passing
                                     behind him over one climb, swinging out
                                     round his waist
     TAKEN IN HAND A WORK BURSTS     gold round its foot, then nothing once it
     AND GIVES                       is long held; it springs and settles; a
                                     wall or a gate never springs; a crowd in
                                     hand neither gives nor flashes
     THE POPS                        a work finished flashes its picture gold
                                     and is done by 2 s; a man trained or risen
                                     a rank pops the same; a pop nobody saw is
                                     let go; never the rival's
     EVERY HOOK ASKS                 Bld.finish, Bld.finishUpgrade,
                                     Bld.releaseTrained, Units.rankUp — the
                                     player's alone
     A STILL FRAME, NO RNG           the gold at one clock is one picture
     ONE NEW SILHOUETTE A FRAME      a group taken at once is measured one
                                     picture a frame
     REDUCED MOTION                  the halo stands still; nothing bursts or
                                     pops

   Run after touching: R.GRING and its painters, the unit pass and the
   building pass in R.draw, R.drawUnitShadow, Lookout.draw's ring,
   Prologue._ringTo / _gSet / groundRings, #proRing's CSS; GoldFX.under /
   GoldFX.over / GoldFX.halo / GoldFX.rim / GoldFX.sheen / GoldFX.flakes /
   GoldFX.leaf / GoldFX.orbit / GoldFX.sparkles / GoldFX.burst /
   GoldFX.streak / GoldFX.popUnder / GoldFX.popOver / GoldFX.popOf /
   GoldFX.popBld / GoldFX.popUnit / GoldFX.popDrop / GoldFX.zoom /
   GoldFX.flash / GoldFX.sil / GoldFX.silOf / GoldFX._build /
   GoldFX.frameStart / GoldFX._inBoard, R.gringUnder / R.gringOver /
   R.gPicBld / R.gFixed, and the pop hooks in Bld.finish /
   Bld.finishUpgrade / Bld.releaseTrained / Units.rankUp. */
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
  const ctx = await b.newContext({ viewport: { width: 1000, height: 700 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());   // nothing leaves the machine
  await p.goto(base + (q || ''));
  await p.waitForFunction(() => window.Screens && Screens.current === 'title', null, { timeout: 60000 });
  return p;
};

/* the measuring kit, laid in the page once: the frame loop stood down, the
   clock frozen (window.__ms is the clock's offset), frames drawn by hand */
const KIT = `
  window.__ms = 0;
  if (!window.__T0) { window.__T0 = performance.now(); performance.now = () => window.__T0 + window.__ms; }
  window.requestAnimationFrame = () => 0;
  // no birds, butterflies or critters: their wings beat with the clock, over whatever ring is under them
  R.ambient = []; R.ambientT = 1e9;
  window.__RG = {
    z() { return R.cam.z * R.dpr; },
    dev(wx, wy) { const z = this.z(); return [(wx - R.cam.x) * z, (wy - R.cam.y) * z]; },
    // the clock moved: a few draws at it first (the water's surface is brought to a
    // new moment over a few frames), so every frame compared below is a settled one
    at(ms) { window.__ms = ms; for (let i = 0; i < 4; i++) R.draw(0); },
    draw() { R.draw(0); },
    shot(r) { return R.g.getImageData(r.x, r.y, r.w, r.h).data; },
    frame(r) { R.draw(0); return this.shot(r); },
    // the same frame with every gold ring left out
    bare(r) {
      const a = R.gringUnder, t = R.drawGRingTile;
      R.gringUnder = () => null; R.drawGRingTile = () => {};
      try { return this.frame(r); } finally { R.gringUnder = a; R.drawGRingTile = t; }
    },
    // …or with one unit's body drawn as nothing (its picture the same size)
    blank(id, fn) {
      const real = R.unitSprite, bl = new Map();
      R.unitSprite = function (v) {
        const img = real.call(R, v);
        if (v.id !== id || !img || !img.width) return img;
        const k = img.width + 'x' + img.height;
        if (!bl.has(k)) { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; bl.set(k, c); }
        return bl.get(k);
      };
      try { return fn(); } finally { R.unitSprite = real; }
    },
    diff(A, B) {
      const n = A.length >> 2, d = new Uint16Array(n);
      for (let i = 0; i < n; i++) d[i] = Math.abs(A[i * 4] - B[i * 4]) + Math.abs(A[i * 4 + 1] - B[i * 4 + 1]) + Math.abs(A[i * 4 + 2] - B[i * 4 + 2]);
      return d;
    },
    box(d, w, th) {
      let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, n = 0;
      for (let i = 0; i < d.length; i++) if (d[i] > th) { const x = i % w, y = (i / w) | 0; n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      return { n, x0, y0, x1, y1 };
    },
    hsv(r, g, b) {
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
      let h = 0;
      if (d) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
      return { h, s: mx ? d / mx : 0, v: mx / 255 };
    },
    // the colour of a ring: the mean hue of the saturated pixels of its band's CORE (where it
    // stands out from the ground most — its soft edge is half meadow), and its bright band's
    tone(F, d, th) {
      const px = [];
      let mx = 0; for (let i = 0; i < d.length; i++) if (d[i] > mx) mx = d[i];
      const core = [];
      for (let i = 0; i < d.length; i++) if (d[i] > th) { const c = [F[i * 4], F[i * 4 + 1], F[i * 4 + 2]]; px.push(c); if (d[i] >= 0.55 * mx) core.push(c); }
      const sat = core.map(c => this.hsv(c[0], c[1], c[2])).filter(h => h.s > 0.35 && h.v > 0.3);
      let sx = 0, sy = 0;
      for (const h of sat) { sx += Math.cos(h.h * Math.PI / 180); sy += Math.sin(h.h * Math.PI / 180); }
      let hue = Math.atan2(sy, sx) * 180 / Math.PI; if (hue < 0) hue += 360;
      px.sort((a, b) => (b[0] + b[1] + b[2]) - (a[0] + a[1] + a[2]));
      const top = px.slice(0, Math.max(1, px.length >> 2)), m = [0, 0, 0];
      for (const c of top) { m[0] += c[0]; m[1] += c[1]; m[2] += c[2]; }
      m[0] /= top.length; m[1] /= top.length; m[2] /= top.length;
      const mh = this.hsv(m[0], m[1], m[2]);
      return { hue: Math.round(hue), n: sat.length, bright: m.map(Math.round), bh: Math.round(mh.h), bs: Math.round(mh.s * 100) / 100 };
    },
  };
`;

/* an open meadow east of the player's hall: his villager, a rival soldier */
const SCENE = () => {
  G.newGame('ring-188', 'moderate', 'medium'); Screens._demo = false;
  const tc = S.buildings.find(o => o.key === 'tc' && o.owner === 'P');
  // twelve tiles of room beside the hall, on whichever side has them (the rim is off the board)
  const x0 = tc.x + 15 < CFG.W - 1 ? tc.x + 3 : tc.x - 13, y0 = Math.max(2, Math.min(CFG.H - 12, tc.y - 3));
  S.buildings = S.buildings.filter(o => o === tc || o.x + Bld.size(o) <= x0 - 1 || o.x > x0 + 12 || o.y + Bld.size(o) <= y0 - 1 || o.y > y0 + 10);
  S.units = []; S.garrison = []; if (S.corpses) S.corpses = [];
  for (let y = y0; y < y0 + 10; y++) for (let x = x0; x < x0 + 12; x++) {
    if (!MapGen.onBoard(x, y)) continue;
    const i = MapGen.idx(x, y);
    S.map.terrain[i] = S.map.seenTerrain[i] = T.GRASS; S.map.resAmount[i] = 0;
  }
  Bld._block = null; R.rebuildTerrain();
  Screens.show('playing'); G.freeVis = true; G.updateVisibility();
  for (const id of ['topbar', 'bottombar', 'miniWrap', 'miniToggle', 'toasts', 'panel', 'armyBar']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
  const vil = Units.spawn('villager', 'P', x0 + 3, y0 + 4); vil.female = false;
  const foe = Units.spawn('defender', 'A', x0 + 8, y0 + 4);
  for (const u of [vil, foe]) { u.task = null; u.path = null; u.tUnit = 0; u.tBld = 0; u.facing = 's'; }
  S.paused = true;
  R.cam.z = 2; R.centerOn(x0 + 5, y0 + 4);
  return { vil: vil.id, foe: foe.id, tc: tc.id, x0, y0 };
};

const p = await page('');
const sc = await p.evaluate(SCENE);
await p.waitForFunction(() => window.Assets && Assets.allArtReady && Assets.allArtReady(), null, { timeout: 90000 }).catch(() => {});
await p.waitForFunction(() => window.TerrainX && TerrainX.ready, null, { timeout: 60000 }).catch(() => {});
// the V4 ground took the world's water outline inside G.newGame, before the meadow was
// painted over it: build its world again from the ground as it now is
await p.evaluate(() => { if (window.TerrainX && TerrainX.on && TerrainX.ready && TerrainX.rebuildAll) TerrainX.rebuildAll(); });
await p.evaluate(() => new Promise(r => setTimeout(r, 1200)));
await p.evaluate(new Function(KIT));
// the ground under the view in: a few frames apart while its chunks land (after any move of the camera)
const settle = async (pg) => {
  for (let i = 0; i < 30; i++) {
    const done = await pg.evaluate(() => { R.draw(0); return !window.TerrainX || !TerrainX.on || !TerrainX.viewFrac || TerrainX.viewFrac() >= 0.999; });
    if (done && i >= 2) return;
    await pg.evaluate(() => new Promise(r => setTimeout(r, 250)));
  }
};
await settle(p);
await p.evaluate((ids) => { window.__ids = ids; }, sc);

/* ---- 1. ON THE GROUND, ROUND HIS FEET, BEHIND HIM ---- */
const A = await p.evaluate(() => {
  const RG = window.__RG, TL = CFG.TILE, u = S.units.find(v => v.id === window.__ids.vil);
  UI.sel = { type: 'unit', id: u.id };
  RG.at(0); RG.draw();                       // taken in hand…
  RG.at(5000);                                // …and long held: the ring at rest
  const q = R.gringOfUnit(u, u.x, u.y), z = RG.z(), [cx, cy] = RG.dev(q.cx, q.cy), hx = q.rx * z, hy = q.ry * z;
  const r = { x: Math.round(cx - 160), y: Math.round(cy - 240), w: 320, h: 320 };
  const Sx = RG.frame(r), N = RG.bare(r);
  const Gx = RG.blank(u.id, () => RG.frame(r)), E = RG.blank(u.id, () => RG.bare(r));
  const dS = RG.diff(Sx, N), dF = RG.diff(Gx, E), dB = RG.diff(N, E), W = r.w, lc = cx - r.x, lr = cy - r.y;
  const ring = RG.box(dF, W, 30), body = RG.box(dB, W, 30);
  let full = 0, hid = 0, hidN = 0, near = 0, nearSeen = 0, partial = 0, mx = 0;
  const cols = new Set();
  for (let i = 0; i < dF.length; i++) if (dF[i] > mx) mx = dF[i];
  for (let i = 0; i < dF.length; i++) {
    if (dF[i] <= 30) continue;
    full++;
    const y = (i / W) | 0;
    if (dS[i] <= 12) { hid++; if (y < lr) hidN++; }
    if (y > lr + 0.35 * hy) { near++; if (dS[i] > 30) nearSeen++; }
    if (dS[i] > 30) { cols.add((Sx[i * 4] << 16) | (Sx[i * 4 + 1] << 8) | Sx[i * 4 + 2]); if (dF[i] < 0.7 * mx) partial++; }
  }
  // his soles: the lowest row of his body, in the columns of his legs
  let soles = -1;
  for (let y = body.y1; y >= body.y0 && soles < 0; y--) {
    let k = 0;
    for (let x = body.x0; x <= body.x1; x++) if (dB[y * W + x] > 30) k++;
    if (k >= 3) soles = y;
  }
  const seen = full - hid;
  return { z, hx: Math.round(hx), hy: Math.round(hy), lc: Math.round(lc), lr: Math.round(lr), ring, body, soles, full, hid, hidN, near, nearSeen,
    shades: cols.size, partial, seen, tone: RG.tone(Sx, dS, 30), bodyW: body.x1 - body.x0 + 1, ringW: ring.x1 - ring.x0 + 1 };
});
{
  const mid = (A.ring.y0 + A.ring.y1) / 2, span = A.ring.y1 - A.ring.y0;
  ck('theRingLiesOnTheGroundRoundHisFeet', A.full > 300 && A.soles > A.ring.y0 && A.soles < A.ring.y1 && Math.abs(A.soles - mid) <= 0.35 * span
    && Math.abs((A.ring.x0 + A.ring.x1) / 2 - A.lc) <= 4,
    `the ring spans rows ${A.ring.y0}..${A.ring.y1} and columns ${A.ring.x0}..${A.ring.x1} (centre column ${A.lc}); his soles at row ${A.soles}`);
  ck('andItIsALittleWiderThanHeIs', A.bodyW > 10 && A.ringW / A.bodyW >= 1.05 && A.ringW / A.bodyW <= 2.4,
    `ring ${A.ringW} device px across, his body ${A.bodyW} (×${(A.ringW / Math.max(1, A.bodyW)).toFixed(2)})`);
  ck('andItRunsBehindHim', A.hid >= 0.06 * A.full && A.hidN >= 0.9 * A.hid,
    `${A.hid} of the ring's ${A.full} device px are hidden by his body, ${A.hidN} of them on its far (north) arc`);
  ck('andItsNearArcIsWholeInFrontOfHisFeet', A.near > 40 && A.nearSeen >= 0.95 * A.near,
    `${A.nearSeen} of the near arc's ${A.near} px are seen`);
  ck('itIsDrawnAtTheDevicesOwnPixels', A.shades >= 40 && A.partial >= 0.2 * A.seen,
    `${A.shades} shades among its ${A.seen} visible px, ${A.partial} of them a soft edge`);
  const t = A.tone, [r, g, bb] = t.bright;
  ck('andItIsGoldOverTheMeadow', t.hue >= 30 && t.hue <= 52 && r > g && g > bb && t.bs >= 0.3 && r >= 170,
    `its band's core: hue ${t.hue}° (${t.n} px); its bright band rgb(${t.bright}) — hue ${t.bh}°, saturation ${t.bs}`);
}

/* ---- 2. THE SNAP AND THE FLURRY ---- */
const Bq = await p.evaluate(() => {
  const RG = window.__RG, u = S.units.find(v => v.id === window.__ids.vil);
  UI.sel = null; RG.at(9000); RG.draw();     // let go…
  UI.sel = { type: 'unit', id: u.id };
  RG.at(10000); RG.draw();                   // …and taken again at 10 s
  const q = R.gringOfUnit(u, u.x, u.y), [cx, cy] = RG.dev(q.cx, q.cy), hy = q.ry * RG.z();
  const r = { x: Math.round(cx - 160), y: Math.round(cy - 260), w: 320, h: 340 }, line = Math.round(cy - hy - 10 - r.y);
  const above = ms => { RG.at(ms); const d = RG.diff(RG.frame(r), RG.bare(r)); let n = 0; for (let i = 0; i < line * r.w; i++) if (d[i] > 30) n++; return n; };
  const fly = above(10150), rest = above(14000);
  const snap = [0.05, 0.2, 0.36, 2].map(a => R.gringSel({ t0: 0, n: 14 }, a));
  // a crowd taken in hand at once throws fewer sparks each
  const ids = []; for (let i = 0; i < 10; i++) ids.push(900001 + i);
  R.gringTick(new Set(ids), null, 20);
  const crowd = R._gSel.get(900001).n;
  R.gringTick(new Set([900100]), null, 21);
  const one = R._gSel.get(900100).n;
  R.gringTick(new Set([u.id]), null, 22);    // the villager back in hand (the frames re-take him)
  return { fly, rest, snap: snap.map(s => ({ s: +s.s.toFixed(3), a: +s.a.toFixed(2), f: +s.flash.toFixed(2) })), crowd, one, max: R.GRING.burstMax };
});
ck('aUnitTakenInHandThrowsAFlurryOfGoldSparksUp', Bq.fly >= 40 && Bq.rest === 0,
  `${Bq.fly} device px lit above the ring 0.15 s after he is taken, ${Bq.rest} once it is long held`);
ck('andItsRingLandsFromWider', Bq.snap[0].s > 1.1 && Bq.snap[0].f > 0.5 && Math.abs(Bq.snap[2].s - 1) < 0.02 && Bq.snap[3].s === 1 && Bq.snap[3].a === 1 && Bq.snap[3].f === 0,
  JSON.stringify(Bq.snap));
ck('andACrowdTakenAtOnceThrowsFewerEach', Bq.one === 14 && Bq.crowd * 10 <= Bq.max && Bq.crowd >= 2,
  `one unit: ${Bq.one} sparks; each of ten at once: ${Bq.crowd} (about ${Bq.max} in all)`);

/* ---- 3. A FOE'S RING IS RUST, AND THROWS NOTHING ---- */
const C = await p.evaluate(() => {
  const RG = window.__RG, f = S.units.find(v => v.id === window.__ids.foe);
  UI.sel = { type: 'unit', id: f.id }; RG.at(30000); RG.draw();
  RG.at(30150);
  const q = R.gringOfUnit(f, f.x, f.y), [cx, cy] = RG.dev(q.cx, q.cy), hy = q.ry * RG.z();
  const r = { x: Math.round(cx - 160), y: Math.round(cy - 260), w: 320, h: 340 }, line = Math.round(cy - hy - 10 - r.y);
  const F = RG.frame(r), d = RG.diff(F, RG.bare(r));
  let up = 0, n = 0; for (let i = 0; i < d.length; i++) if (d[i] > 30) { n++; if (i < line * r.w) up++; }
  return { up, n, tone: RG.tone(F, d, 30) };
});
ck('aFoesRingIsRustAndThrowsNothing', C.n > 200 && C.up === 0 && (C.tone.hue <= 24 || C.tone.hue >= 350),
  `${C.n} ring px, ${C.up} above it 0.15 s after it is taken; its band's core: hue ${C.tone.hue}° (gold reads ${A.tone.hue}°)`);

/* ---- 4. A BUILDING STANDS IN ITS RING ---- */
await p.evaluate(() => { const b = S.buildings.find(o => o.id === window.__ids.tc); R.centerOn(b.x + 1, b.y + 1.5); });
await settle(p);
const D = await p.evaluate(() => {
  const RG = window.__RG, TL = CFG.TILE, b = S.buildings.find(o => o.id === window.__ids.tc);
  UI.sel = { type: 'bld', id: b.id }; RG.at(40000); RG.draw();
  RG.at(45000);
  const q = R.gringOfBld(b), z = RG.z(), [cx, cy] = RG.dev(q.cx, q.cy), hx = q.rx * z, hy = q.ry * z;
  const [, top] = RG.dev(0, b.y * TL), [, front] = RG.dev(0, (b.y + Bld.size(b)) * TL);
  const r = { x: Math.round(cx - hx - 60), y: Math.round(top - 120), w: Math.round(hx * 2 + 120), h: Math.round(cy + hy + 80 - (top - 120)) };
  const d = RG.diff(RG.frame(r), RG.bare(r)), bx = RG.box(d, r.w, 30);
  return { n: bx.n, w: bx.x1 - bx.x0 + 1, want: Math.round(hx * 2), y0: bx.y0 + r.y, y1: bx.y1 + r.y, top: Math.round(top), front: Math.round(front) };
});
ck('aBuildingInHandStandsInItsRingRoundTheFootOfItsArt', D.n > 300 && D.y1 > D.front && D.y0 > D.top + 4 && Math.abs(D.w - D.want) <= 0.15 * D.want,
  `${D.n} ring px from row ${D.y0} to ${D.y1} (its footprint's roof edge at ${D.top}, front at ${D.front}); ${D.w} px across (the ring's ${D.want})`);

/* ---- 5. A STILL FRAME, AND NO RNG ---- */
await p.evaluate(() => { const u = S.units.find(v => v.id === window.__ids.vil); R.centerOn(u.x, u.y); });
await settle(p);
const Ev = await p.evaluate(() => {
  const RG = window.__RG, u = S.units.find(v => v.id === window.__ids.vil);
  UI.sel = null; RG.at(49000); RG.draw();
  UI.sel = { type: 'unit', id: u.id }; RG.at(50000); RG.draw();   // taken…
  RG.at(50200);                                                     // …mid-flurry, mid-snap, the glint running
  const W = R.cv.width, H = R.cv.height, rng = S.rngState;
  const mr = Math.random; let calls = 0;
  Math.random = function () { calls++; return mr(); };
  let a, b, c1, c2, c3;
  try {
    RG.draw(); a = R.g.getImageData(0, 0, W, H).data;
    c1 = calls; RG.draw(); b = R.g.getImageData(0, 0, W, H).data;
    c2 = calls - c1; RG.bare({ x: 0, y: 0, w: 1, h: 1 });
    c3 = calls - c1 - c2;
  } finally { Math.random = mr; }
  let moved = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) moved++;
  return { moved, c2, c3, rngSame: S.rngState === rng };
});
ck('aFrozenFrameWithARingIsAStillFrame', Ev.moved === 0, Ev.moved + ' bytes moved between two draws at one clock, a ring mid-flurry');
ck('andARingDrawsNoRng', Ev.c2 === Ev.c3 && Ev.rngSame, `Math.random drawn ${Ev.c2} times a frame with the ring, ${Ev.c3} without; S.rngState ${Ev.rngSame ? 'untouched' : 'MOVED'}`);

/* ---- 6. NOTHING IN THE BLACK ---- */
await p.evaluate(() => {
  const u = S.units.find(v => v.id === window.__ids.vil);
  window.__keep = { x: u.x, y: u.y };
  u.x = 1.12; u.y = Math.round(CFG.H / 2) + 0.5;
  R.cam.z = 2; R.centerOn(3, u.y);
});
await settle(p);
const F = await p.evaluate(() => {
  const RG = window.__RG, TL = CFG.TILE, u = S.units.find(v => v.id === window.__ids.vil), keep = window.__keep;
  UI.sel = null; RG.at(59000); RG.draw();
  UI.sel = { type: 'unit', id: u.id }; RG.at(60000); RG.draw();
  RG.at(60150);
  const [ex] = RG.dev(R.boardPx().x0, 0), W = R.cv.width, H = R.cv.height;
  const r = { x: 0, y: 0, w: W, h: H };
  const leak = () => { const d = RG.diff(RG.frame(r), RG.bare(r)); let rim = 0, all = 0; for (let i = 0; i < d.length; i++) if (d[i] > 24) { all++; if (i % W < ex) rim++; } return { rim, all }; };
  const shipped = leak();
  const bp = R.boardPx;
  R.boardPx = () => ({ x0: 0, y0: 0, x1: CFG.W * TL, y1: CFG.H * TL });
  let ctl; try { ctl = leak(); } finally { R.boardPx = bp; }
  u.x = keep.x; u.y = keep.y;
  return { edge: Math.round(ex), shipped, ctl };
});
ck('aRingAtTheBoardsEdgeStopsAtIt', F.edge > 20 && F.shipped.all > 100 && F.shipped.rim === 0,
  `${F.shipped.rim} of its ${F.shipped.all} px left of the board's edge (device column ${F.edge})`);
ck('andTheProbeCanSeeALeak', F.ctl.rim > 20, `with the board widened over the black, ${F.ctl.rim} px land there`);

/* ---- 7. REDUCED MOTION: THE RING STAYS STILL ---- */
await p.emulateMedia({ reducedMotion: 'reduce' });
await p.evaluate(() => { const u = S.units.find(v => v.id === window.__ids.vil); R._gStillAt = null; R.cam.z = 2; R.centerOn(u.x, u.y); });
await settle(p);
const Gm = await p.evaluate(() => {
  const RG = window.__RG, u = S.units.find(v => v.id === window.__ids.vil);
  R._gStillAt = null;
  UI.sel = null; RG.at(69000); RG.draw();
  UI.sel = { type: 'unit', id: u.id }; RG.at(70000); RG.draw();
  const q = R.gringOfUnit(u, u.x, u.y), [cx, cy] = RG.dev(q.cx, q.cy), hy = q.ry * RG.z();
  const r = { x: Math.round(cx - 160), y: Math.round(cy - 260), w: 320, h: 340 }, line = Math.round(cy - hy - 10 - r.y);
  RG.at(70150); const d0 = RG.diff(RG.frame(r), RG.bare(r));
  let up = 0; for (let i = 0; i < line * r.w; i++) if (d0[i] > 30) up++;
  // the ring alone (his body drawn as nothing: an idle man breathes, the ring must not)
  RG.at(72000); const X = RG.blank(u.id, () => RG.frame(r)), dX = RG.diff(X, RG.blank(u.id, () => RG.bare(r)));
  RG.at(73300); const Y = RG.blank(u.id, () => RG.frame(r)), dY = RG.diff(Y, RG.blank(u.id, () => RG.bare(r)));
  // compared where it is ring in both frames, by the glint check's own measure below (the
  // meadow under the ring's soft ink edge is not the ring moving)
  let xor = 0, ring = 0, both = 0, same = 0;
  for (let i = 0; i < dX.length; i++) {
    const a = dX[i] > 30, b = dY[i] > 30;
    if (a) ring++;
    if (a !== b) xor++;
    else if (a) { both++; if (Math.abs(X[i * 4] - Y[i * 4]) + Math.abs(X[i * 4 + 1] - Y[i * 4 + 1]) + Math.abs(X[i * 4 + 2] - Y[i * 4 + 2]) <= 24) same++; }
  }
  return { still: R._gStill(), up, xor, ring, both, same, snap: R.gringSel({ t0: 0, n: 14 }, 0.05).s };
});
await p.emulateMedia({ reducedMotion: 'no-preference' });
await p.evaluate(() => { R._gStillAt = null; });
ck('underReducedMotionTheRingStaysStill', Gm.still && Gm.up === 0 && Gm.snap === 1 && Gm.ring > 200 && Gm.xor <= 0.01 * Gm.ring && Gm.same === Gm.both,
  `no flurry (${Gm.up} px above it), no snap (scale ${Gm.snap}); 1.3 s apart ${Gm.same} of the ${Gm.both} px that are ring both times are the same (${Gm.xor} of its ${Gm.ring} come and go)`);

/* ---- 7b. THE GLINT RUNS ROUND A LONE MAN'S RING, NEVER A CROWD'S ---- */
const Gl = await p.evaluate(() => {
  const RG = window.__RG, u = S.units.find(v => v.id === window.__ids.vil);
  R._gStillAt = null;
  const q = R.gringOfUnit(u, u.x, u.y), [cx, cy] = RG.dev(q.cx, q.cy);
  const r = { x: Math.round(cx - 160), y: Math.round(cy - 260), w: 320, h: 340 };
  const moved = (ms1, ms2) => {
    RG.at(ms1); const X = RG.blank(u.id, () => RG.frame(r)), dX = RG.diff(X, RG.blank(u.id, () => RG.bare(r)));
    RG.at(ms2); const Y = RG.blank(u.id, () => RG.frame(r)), dY = RG.diff(Y, RG.blank(u.id, () => RG.bare(r)));
    let both = 0, diff = 0;
    for (let i = 0; i < dX.length; i++) if (dX[i] > 30 && dY[i] > 30) { both++; if (Math.abs(X[i * 4] - Y[i * 4]) + Math.abs(X[i * 4 + 1] - Y[i * 4 + 1]) + Math.abs(X[i * 4 + 2] - Y[i * 4 + 2]) > 24) diff++; }
    return { both, diff };
  };
  UI.sel = null; RG.at(75000);
  UI.sel = { type: 'unit', id: u.id }; RG.at(76000);
  const lone = moved(78000, 79300);
  // the same man in a crowd of eight (the others far off the frame)
  const ids = [u.id]; for (let i = 0; i < 7; i++) ids.push(900200 + i);
  UI.sel = { type: 'group', ids }; RG.at(80000);
  const crowd = moved(82000, 83300);
  UI.sel = null; RG.at(84000);
  return { lone, crowd, max: R.GRING.glintMax };
});
ck('theGlintRunsRoundALoneMansRingNeverACrowds', Gl.lone.both > 200 && Gl.lone.diff >= 0.03 * Gl.lone.both && Gl.crowd.both > 200 && Gl.crowd.diff === 0,
  `alone, ${Gl.lone.diff} of ${Gl.lone.both} ring px change in 1.3 s (the glint on its lap); one of eight in hand: ${Gl.crowd.diff} of ${Gl.crowd.both} (more than ${Gl.max} in hand: calm)`);

/* ---- 8. A CROWD IN HAND COSTS LITTLE ----
   measured against a TWIN of what it replaced (CLAUDE.md, the land.mjs perf
   lesson: a reference that shares the work's operations, timed on the same
   page): a resting ring in a crowd is a blit of its picture, where it used
   to be five ellipse strokes at the device's pixels and two conic gradients
   — so it must cost well under five plain strokes of its size */
const Pt = await p.evaluate(() => {
  const g = R.g, real = Object.getPrototypeOf(performance).now.bind(performance), z = R.cam.z * R.dpr;
  const q = i => ({ cx: R.cam.x + 40 + (i % 10) * 30, cy: R.cam.y + 60 + ((i / 10) | 0) * 30, rx: 11.5, ry: 4.83 });
  const med = fn => {
    const t = [];
    for (let k = 0; k < 7; k++) {
      g.setTransform(z, 0, 0, z, -R.cam.x * z, -R.cam.y * z);
      const t0 = real();
      for (let i = 0; i < 60; i++) fn(i);
      g.getImageData(0, 0, 1, 1);
      t.push((real() - t0) / 60);
    }
    t.sort((a, b) => a - b); return t[3];
  };
  const keep = R._gSel, crowd = new Map(); for (let i = 0; i < 12; i++) crowd.set(910000 + i, { t0: 0, n: 3 });
  R._gSel = crowd;                                   // twelve in hand: no glint
  let ring, ref;
  try {
    const now = real() / 1000;
    ring = med(i => R.drawGRing(g, q(i), 'sel', { a: 1, t: now, seed: i }));
    ref = med(i => {
      const c = q(i), [x, y] = [(c.cx - R.cam.x) * z, (c.cy - R.cam.y) * z];
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.translate(x, y); g.scale(1, 0.72);
      for (let k = 0; k < 5; k++) { g.lineWidth = 3 - k * 0.4; g.strokeStyle = k % 2 ? '#f2c35a' : '#b9781f'; g.beginPath(); g.ellipse(0, 0, 11.5 * z, 4.83 * z / 0.72, 0, 0, Math.PI * 2); g.stroke(); }
      g.restore();
    });
  } finally { R._gSel = keep; }
  return { ring: +ring.toFixed(4), ref: +ref.toFixed(4) };
});
ck('aCrowdInHandCostsLittle', Pt.ring <= 0.5 * Pt.ref,
  `a resting ring in a crowd ${Pt.ring} ms, five plain strokes of its size ${Pt.ref} ms (×${(Pt.ring / Math.max(1e-6, Pt.ref)).toFixed(2)})`);

/* ---- 10. THE GOLD THAT SAYS "THIS ONE", AND "WELL DONE" (js/goldfx.js) ----
   a house raised in the meadow; the guide's chosen one named by the test
   (R.gringGuide answers window.__gg); a painter or two of GoldFX muted for a
   measure that wants one of them alone */
await p.evaluate(() => {
  const ids = window.__ids;
  const house = Bld.place('P', 'house', ids.x0 + 6, ids.y0 + 7, { free: true, instant: true });
  ids.house = house.id;
  UI.sel = null;
  const real = R.gringGuide;
  window.__gg = null;
  R.gringGuide = function (now) { return window.__gg ? window.__gg() : real.call(R, now); };
  window.__ggOn = (bid, uid) => () => ({ units: new Map(uid ? [[uid, { raw: { u: uid }, a: 1, s: 1 }]] : []),
    blds: new Map(bid ? [[bid, { raw: { x: 0, y: 0 }, a: 1, s: 1 }]] : []), tiles: [] });
  window.__mute = (names, fn) => {
    const keep = [];
    for (const k of names) {
      const o = k.startsWith('R.') ? R : GoldFX, m = k.replace(/^R\./, '');
      keep.push([o, m, o[m]]); o[m] = () => null;
    }
    try { return fn(); } finally { for (const [o, m, f] of keep) o[m] = f; }
  };
  // the device crop round a building's whole picture: `up` tiles of sky over it, `side` px either side, `down` tiles under its foot
  window.__bcrop = (b, up, side, down) => {
    const RG = window.__RG, TL = CFG.TILE, z = RG.z(), pic = R.gPicBld(b);
    const [ax0, ay0] = RG.dev(pic.x, pic.y), [ax1, ay1] = RG.dev(pic.x + pic.w, pic.y + pic.h);
    const x = Math.round(ax0 - side), y = Math.round(ay0 - up * TL * z);
    return { r: { x, y, w: Math.round(ax1 + side) - x, h: Math.round(ay1 + down * TL * z) - y }, pic, ax0, ay0, ax1, ay1, z };
  };
  // a picture's opaque pixels laid into a crop, and every pixel's distance from them (device px, chamfer)
  window.__mask = (k) => {
    const { r, pic, ax0, ay0, ax1, ay1 } = k, W = r.w, H = r.h;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
    x.drawImage(pic.img, ax0 - r.x, ay0 - r.y, ax1 - ax0, ay1 - ay0);
    const al = x.getImageData(0, 0, W, H).data, M = new Uint8Array(W * H), D = new Float32Array(W * H);
    let top = H;
    for (let i = 0; i < W * H; i++) { const o = al[i * 4 + 3] > 128; M[i] = o ? 1 : 0; D[i] = o ? 0 : 1e9; if (o) top = Math.min(top, (i / W) | 0); }
    const a = 1, d2 = 1.414;
    for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) {
      const i = y * W + xx; let v = D[i];
      if (xx > 0) v = Math.min(v, D[i - 1] + a);
      if (y > 0) { v = Math.min(v, D[i - W] + a); if (xx > 0) v = Math.min(v, D[i - W - 1] + d2); if (xx < W - 1) v = Math.min(v, D[i - W + 1] + d2); }
      D[i] = v;
    }
    for (let y = H - 1; y >= 0; y--) for (let xx = W - 1; xx >= 0; xx--) {
      const i = y * W + xx; let v = D[i];
      if (xx < W - 1) v = Math.min(v, D[i + 1] + a);
      if (y < H - 1) { v = Math.min(v, D[i + W] + a); if (xx < W - 1) v = Math.min(v, D[i + W + 1] + d2); if (xx > 0) v = Math.min(v, D[i + W - 1] + d2); }
      D[i] = v;
    }
    return { M, D, top, W, H };
  };
  R.cam.z = 2; R.centerOn(house.x + 0.5, house.y);
});
await settle(p);
await p.evaluate(() => { for (let i = 0; i < 8; i++) R.draw(0); });   // the house's footing measured and laid

/* 10a. THE GUIDE'S SHIMMER ON A BUILDING */
const GB = await p.evaluate(() => {
  const RG = window.__RG, TL = CFG.TILE, b = S.buildings.find(o => o.id === window.__ids.house), C = GoldFX.C;
  const k = window.__bcrop(b, 3, 160, 0.3), r = k.r, mk = window.__mask(k), z = k.z, on = window.__ggOn(b.id, null);
  const pair = (ms, mute) => {
    RG.at(ms);
    return window.__mute(mute.concat(['R.drawGRing']), () => { window.__gg = on; const A = RG.frame(r); window.__gg = null; const B = RG.frame(r); return { A, d: RG.diff(A, B) }; });
  };
  // the halo alone (its rim with it): round its own outline, over its roof, never a box
  const reachIn = C.haloB * z, reachOut = C.haloB * z * 2.6 + 8, lit = new Uint8Array(r.w * r.h);
  let tone = null;
  for (const ms of [100000, 100500, 101000, 101500]) {
    const { A, d } = pair(ms, ['flakes', 'sparkles', 'sheen']);
    for (let i = 0; i < d.length; i++) if (d[i] > 30) lit[i] = 1;
    if (ms === 100000) tone = RG.tone(A, d, 30);
  }
  let band = 0, near = 0, far = 0, farA = 0, roof = 0;
  for (let i = 0; i < lit.length; i++) {
    const D = mk.D[i], y = (i / r.w) | 0;
    if (D > 0 && D <= reachIn) { band++; if (lit[i]) near++; }
    if (D > reachOut) { farA++; if (lit[i]) far++; }
    if (y < mk.top && lit[i]) roof++;
  }
  // the gold leaf alone: tumbling up off its ring and its roof into the sky
  const bands = new Set(); let frames = 0, high = 0, leafTone = null;
  for (const ms of [102000, 102350, 102700, 103050, 103400, 103750]) {
    const { A, d } = pair(ms, ['halo', 'rim', 'sheen', 'sparkles']);
    let n = 0;
    for (let i = 0; i < d.length; i++) {
      if (d[i] <= 30) continue;
      const y = (i / r.w) | 0, above = mk.top - y;
      if (above > 0.7 * TL * z) { n++; bands.add(Math.floor(above / (0.5 * TL * z))); }
    }
    if (n > 0) frames++;
    high += n;
    if (!leafTone || n > 0) leafTone = leafTone || RG.tone(A, d, 30);
  }
  // the sheen alone: across its own picture now and then, never off it
  const sh = [];
  for (let k2 = 0; k2 < 40; k2++) {
    const { d } = pair(104000 + k2 * 65, ['halo', 'rim', 'flakes', 'sparkles']);
    let n = 0, sx = 0, out = 0;
    for (let i = 0; i < d.length; i++) {
      if (d[i] <= 30) continue;
      if (mk.M[i]) { n++; sx += i % r.w; } else if (mk.D[i] > 3) out++;
    }
    sh.push({ n, x: n ? sx / n : 0, out });
  }
  let moved = 0;
  for (let i = 1; i < sh.length; i++) if (sh[i].n > 80 && sh[i - 1].n > 80 && Math.abs(sh[i].x - sh[i - 1].x) >= 6) moved++;
  return { band, near, far, farA, roof, reachIn: Math.round(reachIn), reachOut: Math.round(reachOut), tone,
    frames, high, bands: bands.size, leafTone,
    shOn: sh.filter(s => s.n > 80).length, shOff: sh.filter(s => s.n === 0).length, shOut: Math.max(...sh.map(s => s.out)), moved, shN: sh.map(s => s.n) };
});
ck('theGuidesHaloHugsABuildingsOwnOutline', GB.near >= 0.4 * GB.band && GB.roof >= 40 && GB.far <= Math.max(6, 0.001 * GB.farA),
  `${GB.near} of the ${GB.band} px within ${GB.reachIn} px of its outline lit, ${GB.roof} above its roof; ${GB.far} of the ${GB.farA} px farther than ${GB.reachOut} px (a box would light them)`);
ck('andItIsGoldNotOlive', GB.tone.hue >= 30 && GB.tone.hue <= 55 && GB.tone.bright[0] >= GB.tone.bright[1] && GB.tone.bright[1] > GB.tone.bright[2],
  `the halo's core: hue ${GB.tone.hue}° (${GB.tone.n} px), its bright band rgb(${GB.tone.bright})`);
ck('andGoldLeafRisesOffItIntoTheSky', GB.frames >= 4 && GB.bands >= 3 && GB.leafTone && GB.leafTone.hue >= 28 && GB.leafTone.hue <= 55,
  `leaf more than 0.7 tile over its roof in ${GB.frames} of 6 frames (${GB.high} px), in ${GB.bands} half-tile bands of sky; hue ${GB.leafTone && GB.leafTone.hue}°`);
ck('andASheenRunsAcrossItsOwnPictureNowAndThen', GB.shOn >= 4 && GB.shOff >= 12 && GB.moved >= 2 && GB.shOut <= 4,
  `lit in ${GB.shOn} of 40 frames over a sheen's cycle, dark in ${GB.shOff}, moving across it in ${GB.moved}; ${GB.shOut} px off its picture at most — ${GB.shN.join('/')}`);

/* 10b. A MAN IN THE GUIDE IS TIED ROUND WITH LIGHT */
const GU = await p.evaluate(() => {
  const RG = window.__RG, TL = CFG.TILE, u = S.units.find(v => v.id === window.__ids.vil), on = window.__ggOn(null, u.id);
  const q = R.gringOfUnit(u, u.x, u.y), z = RG.z(), [cx, cy] = RG.dev(q.cx, q.cy);
  const r = { x: Math.round(cx - 170), y: Math.round(cy - 300), w: 340, h: 340 }, W = r.w;
  const rows = [];
  for (let k = 0; k < 22; k++) {
    RG.at(110000 + k * 100);
    const f = window.__mute(['halo', 'rim', 'flakes', 'sparkles', 'R.drawGRing'], () => {
      window.__gg = on; const F = RG.frame(r), FB = RG.blank(u.id, () => RG.frame(r));
      window.__gg = null; const N = RG.frame(r), NB = RG.blank(u.id, () => RG.frame(r));
      return { F, FB, N, NB };
    });
    window.__gg = null;
    const dB = RG.diff(f.N, f.NB), body = RG.box(dB, W, 30), d = RG.diff(f.F, f.N), dl = RG.diff(f.FB, f.NB);
    // his body's inside (three px in from its edge), above his soles
    const inside = i => {
      const x = i % W, y = (i / W) | 0;
      if (y > body.y1 - 6) return false;
      for (let yy = y - 3; yy <= y + 3; yy++) for (let xx = x - 3; xx <= x + 3; xx++) if (!(dB[yy * W + xx] > 30)) return false;
      return true;
    };
    let front = 0, hid = 0, out = 0;
    const mid = (body.x0 + body.x1) / 2, half = (body.x1 - body.x0) / 2, bh = body.y1 - body.y0;
    for (let i = 0; i < d.length; i++) {
      const x = i % W, y = (i / W) | 0;
      if (dB[i] > 30 && (d[i] > 40 || dl[i] > 40) && inside(i)) { if (d[i] > 40) front++; else if (dl[i] > 40 && d[i] <= 12) hid++; }
      if (y > body.y0 + 0.25 * bh && y < body.y1 - 0.15 * bh && Math.abs(x - mid) > half + 6 && d[i] > 30) out++;
    }
    rows.push({ front, hid, out });
  }
  // the leaf over his head (the leaf alone)
  RG.at(113000);
  let crown = 0;
  for (const ms of [113000, 113400, 113800, 114200]) {
    RG.at(ms);
    const d = window.__mute(['halo', 'rim', 'sparkles', 'orbit'], () => { window.__gg = on; const A = RG.frame(r); window.__gg = null; return RG.diff(A, RG.frame(r)); });
    const dB = RG.diff(RG.frame(r), RG.blank(u.id, () => RG.frame(r))), body = RG.box(dB, W, 30);
    for (let i = 0; i < d.length; i++) if (d[i] > 30 && ((i / W) | 0) < body.y0 - 0.25 * TL * z) crown++;
  }
  return { front: rows.filter(o => o.front > 0).length, hid: rows.filter(o => o.hid > 0).length, out: rows.filter(o => o.out > 0).length,
    fpx: rows.map(o => o.front).join('/'), hpx: rows.map(o => o.hid).join('/'), crown };
});
ck('aManInTheGuideIsWoundRoundWithLight', GU.front >= 2 && GU.hid >= 2 && GU.out >= 12,
  `over one climb (22 frames): light crosses in front of him in ${GU.front}, passes behind him in ${GU.hid}, swings out round his waist in ${GU.out} — front ${GU.fpx}; behind ${GU.hpx}`);
ck('andGoldLeafRisesOverHisHead', GU.crown >= 20, `${GU.crown} px of leaf over his crown across four frames`);

/* 10c. TAKEN IN HAND, A BUILDING GIVES AND BURSTS GOLD AT ITS FOOT, THEN SETTLES */
const TB = await p.evaluate(() => {
  const RG = window.__RG, b = S.buildings.find(o => o.id === window.__ids.house);
  const k = window.__bcrop(b, 2.5, 220, 0.6), r = k.r;
  const above = () => { const d = RG.diff(window.__mute(['R.drawGRing'], () => RG.frame(r)), RG.bare(r)); let n = 0; for (let i = 0; i < d.length; i++) if (d[i] > 30) n++; return n; };
  // the give alone: the picture sprung, against the same frame with the spring held
  const give = () => window.__mute(['flash', 'under', 'over'], () => { const A = RG.frame(r), B = window.__mute(['zoom'], () => RG.frame(r)); const d = RG.diff(A, B); let n = 0; for (let i = 0; i < d.length; i++) if (d[i] > 30) n++; return n; });
  UI.sel = null; RG.at(120000);
  UI.sel = { type: 'bld', id: b.id }; RG.at(121000);
  RG.at(121030); const g0 = give();
  RG.at(121150); const up = above();
  RG.at(121700); const g1 = give();
  RG.at(123000); const rest = above();
  UI.sel = null; RG.at(124000);
  const fixed = { wall: R.gFixed({ key: 'wall', x: 1, y: 1 }), gate: R.gFixed({ key: 'gate', x: 1, y: 1 }), house: R.gFixed(b) };
  // a crowd taken in hand neither gives nor flashes (more than glintMax in hand is calm)
  const keep = R._gSel, crowd = new Map(); for (let i = 0; i < R.GRING.glintMax + 2; i++) crowd.set(930000 + i, { t0: 0, n: 3 });
  const rec = { kind: 'u', sl: { s: 1 }, selAge: 0.05, pic: { img: null, x: 0, y: 0, w: 1, h: 1 } };
  let calm;
  R._gSel = crowd; try { calm = { zoom: GoldFX.zoom(rec, 0), flash: GoldFX._flashA(rec) }; } finally { R._gSel = keep; }
  return { g0, up, g1, rest, fixed, calm };
});
ck('aBuildingTakenInHandBurstsGoldAtItsFoot', TB.up >= 400 && TB.rest === 0,
  `${TB.up} device px round it are the taking's 0.15 s after it is taken (its ring left out), ${TB.rest} once it is long held`);
ck('andItGivesThenSettles', TB.g0 >= 200 && TB.g1 === 0 && TB.fixed.wall && TB.fixed.gate && !TB.fixed.house && TB.calm.zoom === null && TB.calm.flash === 0,
  `the spring moves ${TB.g0} px of its picture 0.03 s after it is taken, ${TB.g1} at 0.7 s; a wall ${TB.fixed.wall ? 'never springs' : 'SPRINGS'}, a gate ${TB.fixed.gate ? 'never springs' : 'SPRINGS'}; a crowd in hand: zoom ${TB.calm.zoom}, flash ${TB.calm.flash}`);

/* 10d. THE POPS: a work finished, a man out of the yard, a man risen a rank */
const PB = await p.evaluate(() => {
  const RG = window.__RG, TL = CFG.TILE, b = S.buildings.find(o => o.id === window.__ids.house), u = S.units.find(v => v.id === window.__ids.vil);
  const k = window.__bcrop(b, 2.5, 240, 0.9), rb = k.r;
  const q = R.gringOfUnit(u, u.x, u.y), [cx, cy] = RG.dev(q.cx, q.cy), ru = { x: Math.round(cx - 200), y: Math.round(cy - 320), w: 400, h: 400 };
  const pop = r => { const A = RG.frame(r), B = window.__mute(['popOf'], () => RG.frame(r)), d = RG.diff(A, B); let n = 0; for (let i = 0; i < d.length; i++) if (d[i] > 30) n++; return { n, A, B }; };
  GoldFX.forget(); UI.sel = null;
  RG.at(130000); GoldFX.popBld(b, 'build'); RG.at(130000);
  RG.at(130100); const w = pop(rb);
  // its own picture's pixels, how bright: flashed gold, against the same frame with no pop
  const kk = window.__bcrop(b, 0.2, 40, 0.1), mkk = window.__mask(kk);
  const lum = F => { let s = 0, n = 0; for (let i = 0; i < mkk.M.length; i++) if (mkk.M[i]) { s += F[i * 4] + F[i * 4 + 1] + F[i * 4 + 2]; n++; } return n ? s / n / 3 : 0; };
  const lumA = lum(RG.frame(kk.r)), lumB = window.__mute(['popOf'], () => lum(RG.frame(kk.r)));
  RG.at(132000); const w2 = pop(rb);
  RG.at(140000); GoldFX.popUnit(u, 'train'); RG.at(140000);
  RG.at(140080); const t = pop(ru);
  RG.at(141500); const t2 = pop(ru);
  RG.at(150000); GoldFX.popUnit(u, 'rank'); RG.at(150000);
  RG.at(150120); const k1 = pop(ru);
  RG.at(152000); const k2 = pop(ru);
  // a pop nobody saw is let go (a work finished off the view is news, not a pop)
  GoldFX.popBld(b, 'up'); RG.at(160000 + GoldFX.C.popWait * 1000 + 600);
  const late = GoldFX._pops.has('b' + b.id);
  // never the rival's
  const foe = S.units.find(v => v.id === window.__ids.foe), ra = S.buildings.find(o => o.owner === 'A');
  GoldFX.popUnit(foe, 'train'); GoldFX.popBld(ra, 'build');
  const rival = GoldFX._pops.size;
  GoldFX.forget();
  return { w: w.n, w2: w2.n, lumA: Math.round(lumA), lumB: Math.round(lumB), t: t.n, t2: t2.n, k1: k1.n, k2: k2.n, late, rival };
});
ck('aWorkFinishedPopsIntoItsPlaceInGold', PB.w >= 1500 && PB.lumA >= PB.lumB + 25 && PB.w2 === 0,
  `0.1 s in, ${PB.w} device px are the pop's (its picture ${PB.lumB} → ${PB.lumA} bright, flashed gold); ${PB.w2} at 2 s`);
ck('aManOutOfTheYardOrRisenARankPopsInGold', PB.t >= 400 && PB.t2 === 0 && PB.k1 >= 400 && PB.k2 === 0,
  `trained: ${PB.t} px at 0.08 s, ${PB.t2} at 1.5 s; risen a rank: ${PB.k1} px at 0.12 s, ${PB.k2} at 2 s`);
ck('andAPopNobodySawIsLetGoAndTheRivalHasNone', !PB.late && PB.rival === 0,
  `a pop first drawn past its wait: ${PB.late ? 'STILL WAITING' : 'let go'}; the rival's pops: ${PB.rival}`);

/* 10e. EVERY HOOK ASKS FOR ITS POP: Bld.finish, Bld.finishUpgrade, Bld.releaseTrained, Units.rankUp — the player's alone */
const WI = await p.evaluate(() => {
  const ids = window.__ids, made = new Set(), units = new Set(), out = {};
  const typeOf = k => (GoldFX._pops.get(k) || {}).type || null;
  GoldFX.forget();
  const site = Bld.place('P', 'house', ids.x0 + 1, ids.y0 + 9, { free: true }); made.add(site.id);
  Bld.finish(site); out.build = typeOf('b' + site.id);
  site.upgrading = 1; Bld.finishUpgrade(site); out.up = typeOf('b' + site.id);
  const tc = S.buildings.find(o => o.id === ids.tc);
  const nu = Bld.releaseTrained(tc, 'villager', { x: ids.x0 + 2.5, y: ids.y0 + 9.5 }, false); units.add(nu.id);
  out.train = typeOf('u' + nu.id);
  const yard = Bld.place('P', 'barracks', ids.x0 + 10, ids.y0 + 1, { free: true, instant: true }); made.add(yard.id);
  yard.level = 3;
  const keep = Object.assign({}, S.res); for (const r in S.res) S.res[r] = 9999;
  const d = Units.spawn('defender', 'P', ids.x0 + 10.5, ids.y0 + 3.5); units.add(d.id);
  const c = Units.rankUp(d); out.rank = c && c.ok ? typeOf('u' + d.id) : 'refused: ' + (c && c.why);
  Object.assign(S.res, keep);
  const rs = Bld.place('A', 'house', ids.x0 + 1, ids.y0 + 1, { free: true }); made.add(rs.id);
  const n0 = GoldFX._pops.size;
  Bld.finish(rs); rs.upgrading = 1; Bld.finishUpgrade(rs);
  const rtc = S.buildings.find(o => o.owner === 'A' && o.key === 'tc');
  const ru = rtc ? Bld.releaseTrained(rtc, 'villager', { x: ids.x0 + 1.5, y: ids.y0 + 2.5 }, false) : null;
  if (ru) units.add(ru.id);
  out.rival = GoldFX._pops.size - n0;
  S.buildings = S.buildings.filter(o => !made.has(o.id)); S.units = S.units.filter(o => !units.has(o.id));
  Bld._block = null; GoldFX.forget();
  return out;
});
ck('everyFinishAndRiseAsksForItsPopThePlayersAlone', WI.build === 'build' && WI.up === 'up' && WI.train === 'train' && WI.rank === 'rank' && WI.rival === 0,
  JSON.stringify(WI));

/* 10f. A STILL FRAME, NO RNG — the guide on a building and a man, a pop playing, a man just taken */
const SF = await p.evaluate(() => {
  const RG = window.__RG, b = S.buildings.find(o => o.id === window.__ids.house), u = S.units.find(v => v.id === window.__ids.vil);
  const both = window.__ggOn(b.id, u.id);
  window.__gg = both; UI.sel = null; RG.at(170000);
  GoldFX.popBld(b, 'build'); UI.sel = { type: 'unit', id: u.id }; RG.at(170500);
  RG.at(170650);
  const W = R.cv.width, H = R.cv.height, rng = S.rngState, mr = Math.random;
  let calls = 0; Math.random = function () { calls++; return mr(); };
  let a, c, c1, c2;
  try {
    RG.draw(); a = R.g.getImageData(0, 0, W, H).data; c1 = calls;
    RG.draw(); c = R.g.getImageData(0, 0, W, H).data;
    c2 = calls - c1;
    const gg = window.__gg; window.__gg = null;
    window.__mute(['popOf'], () => RG.bare({ x: 0, y: 0, w: 1, h: 1 }));
    window.__gg = gg;
  } finally { Math.random = mr; }
  const c3 = calls - c1 - c2;
  let moved = 0; for (let i = 0; i < a.length; i++) if (a[i] !== c[i]) moved++;
  window.__gg = null; UI.sel = null; GoldFX.forget(); RG.at(171000);
  return { moved, c2, c3, rngSame: S.rngState === rng };
});
ck('andTheGoldIsAStillFrameThatDrawsNoRng', SF.moved === 0 && SF.c2 === SF.c3 && SF.rngSame,
  `${SF.moved} bytes moved between two draws at one clock (a guide on a work and a man, a pop, a taking); Math.random ${SF.c2} times a frame with the gold, ${SF.c3} without; S.rngState ${SF.rngSame ? 'untouched' : 'MOVED'}`);

/* 10h. A GROUP TAKEN IN HAND MEASURES ONE NEW SILHOUETTE A FRAME (a picture read back costs a few ms on a phone) */
const SB = await p.evaluate(() => {
  const RG = window.__RG, ids = window.__ids, made = [];
  ['villager', 'defender', 'archer', 'axeman'].forEach((kd, i) => { const v = Units.spawn(kd, 'P', ids.x0 + 0.5 + i, ids.y0 + 2.5); v.task = null; v.path = null; v.female = false; made.push(v); });
  UI.sel = null; RG.at(190000);
  GoldFX._silC = new Map();                  // nothing measured yet
  const real = GoldFX._build; let n = 0, per = [];
  GoldFX._build = function () { n++; return real.apply(GoldFX, arguments); };
  try {
    UI.sel = { type: 'group', ids: made.map(v => v.id) }; window.__ms = 191000;
    for (let f = 0; f < 6; f++) { const n0 = n; R.draw(0); per.push(n - n0); }
  } finally { GoldFX._build = real; }
  UI.sel = null; S.units = S.units.filter(v => !made.includes(v)); RG.at(192000);
  return { per, imgs: new Set(made.map(v => R.unitSprite(v))).size };
});
ck('aGroupTakenInHandMeasuresOneNewSilhouetteAFrame', SB.imgs >= 3 && SB.per.slice(0, SB.imgs).every(x => x === 1) && SB.per.slice(SB.imgs).every(x => x === 0),
  `four men of four kinds taken at once (${SB.imgs} pictures): ${SB.per.join('/')} silhouettes measured in the frames after`);

/* 10g. REDUCED MOTION: the halo stands still, nothing bursts or pops */
await p.emulateMedia({ reducedMotion: 'reduce' });
const RMo = await p.evaluate(() => {
  const RG = window.__RG, b = S.buildings.find(o => o.id === window.__ids.house), k = window.__bcrop(b, 2.5, 160, 0.3), r = k.r;
  R._gStillAt = null;
  const on = window.__ggOn(b.id, null), smoke = R.drawHearthSmoke;
  R.drawHearthSmoke = () => {};
  let X, Y, N;
  try {
    window.__gg = on; RG.at(180000); X = RG.frame(r);
    RG.at(181300); Y = RG.frame(r);
    window.__gg = null; N = RG.frame(r);
  } finally { R.drawHearthSmoke = smoke; }
  let moved = 0, lit = 0;
  for (let i = 0; i < X.length; i += 4) { if (Math.abs(X[i] - Y[i]) + Math.abs(X[i + 1] - Y[i + 1]) + Math.abs(X[i + 2] - Y[i + 2]) > 6) moved++; if (Math.abs(Y[i] - N[i]) + Math.abs(Y[i + 1] - N[i + 1]) + Math.abs(Y[i + 2] - N[i + 2]) > 30) lit++; }
  GoldFX.popBld(b, 'build'); RG.at(182000);
  const pop = GoldFX._pops.has('b' + b.id);
  UI.sel = { type: 'bld', id: b.id }; RG.at(183000); RG.at(183100);
  const d = RG.diff(window.__mute(['R.drawGRing'], () => RG.frame(r)), RG.bare(r)); let up = 0; for (let i = 0; i < d.length; i++) if (d[i] > 30) up++;
  UI.sel = null; RG.at(184000);
  return { moved, lit, pop, up };
});
await p.emulateMedia({ reducedMotion: 'no-preference' });
await p.evaluate(() => { R._gStillAt = null; });
ck('underReducedMotionTheGoldStandsStill', RMo.lit >= 200 && RMo.moved === 0 && !RMo.pop && RMo.up === 0,
  `the guide's still halo: ${RMo.lit} px lit, ${RMo.moved} moved in 1.3 s; a pop ${RMo.pop ? 'PLAYS' : 'is let go'}; taking a work throws ${RMo.up} px`);
await p.context().close();

/* ---- 9. THE JOURNEY'S RING ---- */
{
  const q = await page('?prologue=reset');
  await q.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 30000 }).catch(() => {});
  await q.waitForTimeout(500);
  await q.click('#btnBegin');
  await q.waitForFunction(() => Screens.current === 'playing' && S.scenario === 'prologue_1', null, { timeout: 60000 });
  const ok = await q.waitForFunction(() => window.Prologue && Prologue._gr && Prologue._gr.raw && Prologue._gr.raw.u !== undefined
    && Prologue._el && Prologue._el.ring.style.display !== 'none', null, { timeout: 40000 }).then(() => true, () => false);
  await q.waitForTimeout(1500);                // the glide in, the first line
  const H1 = await q.evaluate(() => {
    const P = Prologue, el = P._el.ring, cs = getComputedStyle(el), now = performance.now() / 1000;
    const rings = P.groundRings(now), gg = R.gringGuide(now), id = P._gr && P._gr.raw && P._gr.raw.u;
    return { cls: el.className, display: cs.display, border: cs.borderTopColor, shadow: cs.boxShadow, anim: cs.animationName,
      n: rings.length, id, hasU: !!(gg && gg.units.has(id)) };
  });
  ck('theJourneyRingsHerTargetOnTheGround', ok && / ground/.test(' ' + H1.cls) && H1.display !== 'none' && /rgba\(0, 0, 0, 0\)|transparent/.test(H1.border)
    && H1.shadow === 'none' && H1.anim === 'none' && H1.n >= 1 && H1.hasU,
    `#proRing "${H1.cls}" (${H1.display}, border ${H1.border}, shadow ${H1.shadow}); ${H1.n} ring(s) on the ground, round unit ${H1.id}: ${H1.hasU}`);
  await q.evaluate(new Function(KIT));
  await q.evaluate(() => new Promise(r => setTimeout(r, 200)));
  const H2 = await q.evaluate(() => {
    const RG = window.__RG, P = Prologue, u = S.units.find(o => o.id === P._gr.raw.u), TL = CFG.TILE;
    const gq = R.gringOfUnit(u, u.x, u.y), z = RG.z(), [cx, cy] = RG.dev(gq.cx, gq.cy), hy = gq.ry * z;
    const r = { x: Math.round(cx - 170), y: Math.round(cy - 280), w: 340, h: 360 }, line = Math.round(cy - hy - 12 - r.y);
    const real = P.groundRings, off = () => { P.groundRings = () => []; try { return RG.frame(r); } finally { P.groundRings = real; } };
    const shots = [];
    for (const ms of [0, 400, 800, 1200]) {
      RG.at(5000 + ms);
      const d = RG.diff(RG.frame(r), off()), bx = RG.box(d, r.w, 30);
      let up = 0; for (let i = 0; i < line * r.w; i++) if (d[i] > 30) up++;
      shots.push({ d, n: bx.n, up, cx: (bx.x0 + bx.x1) / 2 + r.x });
    }
    let breath = 0; for (let i = 0; i < shots[0].d.length; i++) if ((shots[0].d[i] > 30) !== (shots[2].d[i] > 30)) breath++;
    // a tap at the element's centre lands on him (the element is where the ring is)
    const er = P._el.ring.getBoundingClientRect(), cv = R.cv.getBoundingClientRect(), Z = R.cam.z;
    const tx = (er.left + er.width / 2 - cv.left) / Z + R.cam.x, ty = (er.top + er.height / 2 - cv.top) / Z + R.cam.y;
    const hit = R.unitHit(u, tx / TL, ty / TL), domX = (er.left + er.width / 2 - cv.left) * R.dpr;
    return { n: shots.map(s => s.n), up: shots.map(s => s.up), breath, hit: +hit.toFixed(2), off: Math.round(Math.abs(domX - cx)) };
  });
  ck('andItBreathesWithMotesRisingOffIt', Math.min(...H2.n) > 300 && H2.breath > 50 && H2.up.filter(n => n > 0).length >= 2,
    `ring px ${H2.n.join('/')} across a breath, ${H2.breath} px moved half a breath apart; px above it ${H2.up.join('/')}`);
  ck('andATapAtTheElementsCentreLandsOnHim', H2.hit <= 0.55 && H2.off <= 10,
    `R.unitHit at #proRing's centre: ${H2.hit} tiles; it stands ${H2.off} device px off the middle of the ring drawn on the ground`);
  const H3 = await q.evaluate(() => {
    const RG = window.__RG, P = Prologue, TL = CFG.TILE, u = S.units.find(o => o.id === P._gr.raw.u), was = P._gr.raw;
    // a stand of wood near him, a tree north of the ringed one
    let best = null;
    for (let y = 2; y < CFG.H - 2; y++) for (let x = 2; x < CFG.W - 2; x++) {
      const t = S.map.terrain;
      if (t[MapGen.idx(x, y)] !== T.FOREST || t[MapGen.idx(x, y - 1)] !== T.FOREST) continue;
      const d = Math.hypot(x + 0.5 - u.x, y + 0.5 - u.y);
      if (!best || d < best.d) best = { x, y, d };
    }
    if (!best) return { err: 'no wood' };
    RG.at(9000);
    const t0 = performance.now() / 1000;
    P._gSet({ x: best.x + 0.5, y: best.y + 0.5, r: 0.8 });
    const mid = P.groundRings(t0 + 0.1), late = P.groundRings(t0 + 0.6);
    window.__fade = { mid: mid.map(o => ({ k: o.raw.u !== undefined ? 'u' : 't', a: +o.a.toFixed(2) })), late: late.map(o => ({ k: o.raw.u !== undefined ? 'u' : 't', a: +o.a.toFixed(2) })) };
    window.__wood = best; window.__was = was;
    RG.at(9000 + 800);
    R.centerOn(best.x + 0.5, best.y + 0.5);
    return { ok: true };
  });
  if (!H3.err) await settle(q);
  const H4 = H3.err ? H3 : await q.evaluate(() => {
    const RG = window.__RG, P = Prologue, best = window.__wood, was = window.__was, fade = window.__fade;
    // round a tree: the crowns stand over its far arc
    const gq = R.gringOfTile(best.x + 0.5, best.y + 0.5, 0.8), z = RG.z(), [cx, cy] = RG.dev(gq.cx, gq.cy), hx = gq.rx * z;
    const r = { x: Math.round(cx - hx - 40), y: Math.round(cy - 200), w: Math.round(hx * 2 + 80), h: 300 };
    const TX = window.TerrainX, v4 = !!(TX && TX.on && TX._painted);
    const real = P.groundRings, none = () => { P.groundRings = () => []; try { return RG.frame(r); } finally { P.groundRings = real; } };
    const seen = RG.frame(r), base = none();
    let all = seen;
    if (TX) { const pt = TX._painted; TX._painted = false; try { all = RG.frame(r); } finally { TX._painted = pt; } }
    const dSeen = RG.diff(seen, base), dAll = RG.diff(all, base);
    let ring = 0, hid = 0, hidN = 0;
    const lr = cy - r.y;
    for (let i = 0; i < dAll.length; i++) if (dAll[i] > 30) { ring++; if (dSeen[i] <= 12) { hid++; if (((i / r.w) | 0) < lr) hidN++; } }
    P._gSet(was);
    return { fade, v4, ring, hid, hidN, tile: [best.x, best.y] };
  });
  const midT = H4.fade && H4.fade.mid.find(o => o.k === 't'), midU = H4.fade && H4.fade.mid.find(o => o.k === 'u');
  ck('andItFadesInWhereTheLinePointsAndOutWhereItPointed', !!(H4.fade && midT && midU && midT.a > 0.2 && midT.a < 0.95 && midU.a > 0.2 && midU.a < 0.95
    && H4.fade.late.length === 1 && H4.fade.late[0].k === 't' && H4.fade.late[0].a === 1), JSON.stringify(H4.fade || H4));
  ck('andRoundATreeItRunsBehindTheCrowns', H4.v4 && H4.ring > 200 && H4.hid >= 20 && H4.hidN >= 20,
    `round the wood at ${H4.tile}: ${H4.hid} of its ${H4.ring} px under the trees (${H4.hidN} on its far side; V4 layer ${H4.v4})`);
  // a man up a tower stands on no ground the renderer rings: his ring stays the element's
  const H5 = await q.evaluate(() => {
    const P = Prologue, E = P._el, raw = P._gr && P._gr.raw && P._gr.raw.u !== undefined ? P._gr.raw : window.__was;
    const u = S.units.find(o => o.id === raw.u), t = P._resolve(raw);
    if (!u || !t) return { err: 'no target' };
    u.perch = 987654;
    P._ringTo(E, t, raw);
    const up = { ground: E.ring.classList.contains('ground'), gr: !!P._gr, shown: E.ring.style.display !== 'none' };
    delete u.perch;
    P._ringTo(E, t, raw);
    const down = { ground: E.ring.classList.contains('ground'), gr: !!(P._gr && P._gr.raw.u === raw.u) };
    return { up, down };
  });
  ck('aManUpATowerKeepsTheElementsRing', !!(H5.up && !H5.up.ground && !H5.up.gr && H5.up.shown && H5.down.ground && H5.down.gr), JSON.stringify(H5));
  await q.context().close();
}

await b.close(); srv.close();
ck('noPageErrors', errs.length === 0, errs.slice(0, 3).join(' | '));
for (const [k, v] of Object.entries(res)) console.log((v.startsWith('PASS') ? '  ok  ' : '  XX  ') + k + ': ' + v);
if (fails.length) { console.log(`\n${fails.length} FAILURE(S) — ${fails.join(', ')}`); process.exit(1); }
console.log(`\nall ${Object.keys(res).length} ground-ring checks pass`);
