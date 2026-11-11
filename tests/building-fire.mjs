/* THE BUILDING FIRE CONTRACT — every building burns in its own art, and a
   house comes down onto its own ruin (R.FIRE_ART / fireDef / fireArt /
   firePic / fireBurning / startFireFall / drawFireFall / drawFireSmoke in
   js/render.js, Assets.wantFireArt in js/assets.js, Ruins.PIN in js/ruins.js).

   Operator, build 165, after the hall's own fire (build 164): "Yes please.
   With the most effort put into the most common buildings."

     THE TABLE IS THE ART  Every kind and level in R.FIRE_ART names the
                           finished picture its fire was drawn from (w × h, the
                           shipped PNG's own size) and its strips are on disk:
                           three loops of eight square frames of f px (a
                           house's fall as well), frame 0 of every loop its
                           still in assets/masters/fire, pixel for pixel, and
                           no loop flashing paper-white where its still has
                           fire.
     NOTHING AT BOOT       No fire strip is asked for by the boot or the
                           title's demo world; a building asks for its own
                           kind and level's strips the first time it is HURT,
                           once.
     ITS OWN ART           The burn phase picks the state; the frame lands on
                           the finished picture at every kind and level; every
                           caller draws the one scratch; no flame sprite is
                           laid over it; a work site, an upgrade and a picture
                           redrawn under the same name keep the old look.
     THE SMOKE             Drawn on its own stream (never the page's
                           Math.random, never S), there, and capped across a
                           burning town; never in the black.
     A HOUSE FALLS         onto its OWN ruin: the fall is drawn in the
                           building pass in its own place, the footing stands
                           down, the ash and the remains wait for it, the
                           ruin is pinned to the one the fall lands on, and
                           the fall's last frame IS that ruin where the ruins
                           pass draws it. Without its fall art a house goes as
                           every building used to.

   Served over HTTP: the registration and the black are read off pixels, and a
   page from disk taints every canvas a PNG touches.

     node tests/building-fire.mjs      # exits non-zero on any regression */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import zlib from 'node:zlib';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const results = {}, fails = [];
const ck = (n, ok, i) => { results[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };

// ---- a small PNG reader: 8-bit RGBA, RGB or palette (+tRNS), to RGBA ----
function readPng(path) {
  const buf = readFileSync(path);
  let o = 8, w = 0, h = 0, depth = 0, ctype = 0, plte = null, trns = null;
  const idat = [];
  while (o < buf.length) {
    const len = buf.readUInt32BE(o), type = buf.toString('ascii', o + 4, o + 8), d = buf.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); depth = d[8]; ctype = d[9]; }
    else if (type === 'PLTE') plte = d;
    else if (type === 'tRNS') trns = d;
    else if (type === 'IDAT') idat.push(d);
    o += 12 + len;
  }
  if (depth !== 8) throw new Error(path + ': bit depth ' + depth);
  const ch = { 6: 4, 2: 3, 3: 1, 0: 1, 4: 2 }[ctype], stride = w * ch;
  const raw = zlib.inflateSync(Buffer.concat(idat)), px = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? px[y * stride + x - ch] : 0, b = y ? px[(y - 1) * stride + x] : 0, c = (x >= ch && y) ? px[(y - 1) * stride + x - ch] : 0;
      let v = src[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += (pa <= pb && pa <= pc) ? a : pb <= pc ? b : c; }
      px[y * stride + x] = v & 255;
    }
  }
  const out = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    if (ctype === 6) { px.copy(out, i * 4, i * 4, i * 4 + 4); }
    else if (ctype === 2) { out[i * 4] = px[i * 3]; out[i * 4 + 1] = px[i * 3 + 1]; out[i * 4 + 2] = px[i * 3 + 2]; out[i * 4 + 3] = 255; }
    else if (ctype === 3) { const k = px[i]; out[i * 4] = plte[k * 3]; out[i * 4 + 1] = plte[k * 3 + 1]; out[i * 4 + 2] = plte[k * 3 + 2]; out[i * 4 + 3] = trns && k < trns.length ? trns[k] : 255; }
    else if (ctype === 0) { out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = px[i]; out[i * 4 + 3] = 255; }
    else { out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = px[i * 2]; out[i * 4 + 3] = px[i * 2 + 1]; }
  }
  return { w, h, d: out };
}

// ---- the page ----
const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg' };
const fireReq = [];
const srv = createServer(async (rq, rs) => {
  try {
    const u = decodeURIComponent(rq.url.split('?')[0]);
    if (/^\/assets\/fire\//.test(u)) fireReq.push(u.split('/').pop());
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
await p.waitForTimeout(2500);   // the title's demo world runs a while: it must ask for nothing

// ---- the table, against the disk ----
const TABLE = await p.evaluate(() => JSON.parse(JSON.stringify({ art: R.FIRE_ART, states: R.FIRE_STATES })));
const rows = [];
for (const [key, e] of Object.entries(TABLE.art))
  e.lv.forEach((d, i) => rows.push({ key, lv: i + 1, d, fall: !!e.fall }));
{
  const bad = [];
  for (const r of rows) {
    const f = join(root, `assets/buildings/${r.key}-l${r.lv}.png`);
    if (!existsSync(f)) { bad.push(`${r.key}-l${r.lv}: no shipped picture`); continue; }
    const im = readPng(f);
    if (im.w !== r.d.w || im.h !== r.d.h) bad.push(`${r.key}-l${r.lv}: shipped ${im.w}x${im.h}, table ${r.d.w}x${r.d.h}`);
  }
  ck('theTableNamesEveryShippedPicture', !bad.length && rows.length >= 37, bad.join('; ') || rows.length + ' kinds and levels');
}
{
  const want = ['house', 'farm', 'lumber', 'quarry', 'mine', 'barracks', 'range', 'lodge', 'stable', 'siege', 'sapper', 'trade', 'warcamp'];
  const missing = want.filter(k => !TABLE.art[k]);
  ck('everyBurnableKindBurnsInItsOwnArt', !missing.length && TABLE.art.house.fall === true,
    missing.length ? 'missing ' + missing.join(', ') : want.length + ' kinds; the house falls');
}
const STRIPS = {};
{
  const bad = [], still = [], flash = [];
  const nw = (d, q) => d[q + 3] > 200 && Math.min(d[q], d[q + 1], d[q + 2]) >= 222;
  for (const r of rows) {
    const states = TABLE.states.concat(r.fall ? ['fall'] : []);
    for (const st of states) {
      const name = `${r.key}-l${r.lv}-${st}`, f = join(root, `assets/fire/${name}.png`);
      if (!existsSync(f)) { bad.push(name + ' missing'); continue; }
      const im = readPng(f), F = im.h, n = im.w / F;
      STRIPS[name] = n;
      if (F !== r.d.f || n !== Math.floor(n) || (st === 'fall' ? n < 8 : n !== 8)) { bad.push(`${name} ${im.w}x${im.h} (frame ${r.d.f})`); continue; }
      // a white flash the first frame never had (a fall's is fire, warmed)
      let fl = 0;
      for (let k = 1; k < n; k++) for (let y = 0; y < F; y++) for (let x = 0; x < F; x++) {
        const q = (y * im.w + k * F + x) * 4, q0 = (y * im.w + x) * 4;
        if (nw(im.d, q) && !nw(im.d, q0)) fl++;
      }
      if (fl) flash.push(`${name}: ${fl}`);
      if (st === 'fall') continue;
      // frame 0 of a loop is its still
      const sf = join(root, `assets/masters/fire/${name}.png`);
      if (!existsSync(sf)) { still.push(name + ': no still'); continue; }
      const s = readPng(sf);
      if (s.w !== F || s.h !== F) { still.push(`${name}: still ${s.w}x${s.h}`); continue; }
      let diff = 0;
      for (let y = 0; y < F; y++) for (let x = 0; x < F; x++) {
        const q = (y * im.w + x) * 4, q0 = (y * F + x) * 4;
        const oa = im.d[q + 3] >= 128, ob = s.d[q0 + 3] >= 128;
        if (oa !== ob || (oa && (im.d[q] !== s.d[q0] || im.d[q + 1] !== s.d[q0 + 1] || im.d[q + 2] !== s.d[q0 + 2]))) diff++;
      }
      if (diff) still.push(`${name}: ${diff} px off its still`);
    }
  }
  ck('everyStripIsOnDiskAtItsSize', !bad.length, bad.slice(0, 6).join('; ') || Object.keys(STRIPS).length + ' strips');
  ck('andEveryLoopStartsOnItsStill', !still.length, still.slice(0, 6).join('; '));
  ck('andNoFrameFlashesPaperWhite', !flash.length, flash.slice(0, 6).join('; '));
}

// ---- nothing at boot ----
ck('nothingIsAskedForAtBoot', fireReq.length === 0, fireReq.length + ' fire strips asked for by the boot and the demo');
{
  const v = await p.evaluate(() => {
    const fake = { id: 99901, key: 'house', level: 1, owner: 'P', x: 3, y: 3, hp: 2, maxhp: 10, construction: 0, upgrading: 0 };
    return { demo: !!Screens._demo, art: R.fireArt(fake) === null, asked: Object.keys(Assets._fireAsked).filter(k => !/^tc-/.test(k)).length };
  });
  ck('theDemoWorldsBuildingsAskForNothing', v.demo && v.art && v.asked === 0, JSON.stringify(v));
}

// ---- a world of our own: one of every kind and level on open ground ----
await p.evaluate((KINDS) => {
  G.newGame('bfire1', 'moderate', 'large');
  Screens._demo = false; Screens.show('playing'); if (window.Boot && Boot.force) Boot.force();
  S.paused = true;
  const tc = Bld.tcOf('P');
  const ox = tc.x - 4, oy = tc.y + 4, H = KINDS.length * 3 + 2;
  for (let dy = -2; dy <= H; dy++) for (let dx = -2; dx <= 12; dx++) {
    const x = ox + dx, y = oy + dy;
    if (!MapGen.onBoard(x, y)) continue;
    const o = Bld.at(x, y); if (o && o.key !== 'tc') S.buildings = S.buildings.filter(q => q !== o);
    if (!Bld.at(x, y)) S.map.terrain[MapGen.idx(x, y)] = T.GRASS;
  }
  S.units = S.units.filter(u => u.y < oy - 2 || u.y > oy + H);
  Bld._block = null;
  window.__b = {};
  KINDS.forEach((k, r) => {
    for (let lv = 1; lv <= 3; lv++) {
      const d = Bld.def(k); if (!d.levels[lv - 1]) continue;
      const bb = Bld.place('P', k, ox + (lv - 1) * 4, oy + r * 3, { free: true, instant: true });
      if (!bb) continue;
      bb.level = lv; bb.maxhp = d.levels[lv - 1].hp || bb.maxhp; bb.hp = bb.maxhp;
      __b[k + lv] = bb;
    }
  });
  Bld._block = null; R.rebuildTerrain();
  G.freeVis = true; G.updateVisibility();
  R.cam.z = 1.4; R.centerOn(ox + 5, oy + 6);
}, Object.keys(TABLE.art));
{
  const v = await p.evaluate(() => {
    for (let i = 0; i < 6; i++) R.draw(1 / 60);
    return { placed: Object.keys(__b).length, asked: Object.keys(Assets._fireAsked).filter(k => !/^tc-/.test(k)) };
  });
  ck('aWholeTownAsksForNothing', v.asked.length === 0 && fireReq.length === 0 && v.placed >= 37,
    v.placed + ' buildings whole; asked ' + v.asked.join(',') + ' / ' + fireReq.length + ' requests');
}
{
  await p.evaluate(() => { __b.house1.hp = __b.house1.maxhp * 0.8; __b.farm1.hp = __b.farm1.maxhp * 0.8; for (let i = 0; i < 4; i++) R.draw(1 / 60); });
  await p.waitForFunction(() => ['catch', 'blaze', 'gutted', 'fall'].every(st => Assets.fireStrip('house', 1, st)) &&
    ['catch', 'blaze', 'gutted'].every(st => Assets.fireStrip('farm', 1, st)), null, { timeout: 30000 }).catch(() => {});
  await p.evaluate(() => { for (let i = 0; i < 4; i++) R.draw(1 / 60); });
  const got = fireReq.slice().sort();
  const want = ['farm-l1-blaze.png', 'farm-l1-catch.png', 'farm-l1-gutted.png',
    'house-l1-blaze.png', 'house-l1-catch.png', 'house-l1-fall.png', 'house-l1-gutted.png'];
  ck('aHurtBuildingAsksForItsOwnStripsOnce', JSON.stringify(got) === JSON.stringify(want), got.join(', '));
}
{
  const v = await p.evaluate(() => {
    const h = __b.house1, name = (a) => a ? (['catch', 'blaze', 'gutted'].find(st => Assets.fireStrip('house', 1, st) === a) || '?') : null;
    const at = f => { h.hp = h.maxhp * f; return name(R.fireArt(h)); };
    const out = { whole: at(1), scratch: at(0.99), catch: at(0.8), blaze: at(0.5), gutted: at(0.05) };
    h.hp = h.maxhp * 0.5;
    h.construction = 3; out.site = R.fireArt(h); h.construction = 0;
    h.upgrading = 2; out.upgrade = R.fireArt(h); h.upgrading = 0;
    const keep = R.FIRE_ART.house.lv[0].w; R.FIRE_ART.house.lv[0].w = keep + 1;
    out.redrawn = R.fireArt(h); R.FIRE_ART.house.lv[0].w = keep;
    R.BFIRE.on = false; out.off = R.fireArt(h); R.BFIRE.on = true;
    h.hp = h.maxhp * 0.8;
    return out;
  });
  ck('theBurnPhasePicksTheState',
    v.whole === null && v.scratch === null && v.catch === 'catch' && v.blaze === 'blaze' && v.gutted === 'gutted',
    JSON.stringify({ whole: v.whole, scratch: v.scratch, catch: v.catch, blaze: v.blaze, gutted: v.gutted }));
  ck('aSiteAnUpgradeAndARedrawnPictureKeepTheOldLook', v.site === null && v.upgrade === null && v.redrawn === null && v.off === null, '');
}

// ---- every kind and level: it lands on the finished picture ----
// (the building pass culls to the camera, so a hurt building off the screen asks
// for nothing — every one is asked here, as each would be when the player looks)
await p.evaluate(() => { for (const bb of Object.values(__b)) { bb.hp = bb.maxhp * 0.8; R.fireArt(bb); } for (let i = 0; i < 3; i++) R.draw(1 / 60); });
await p.waitForFunction(() => Object.values(__b).every(bb => {
  const f = R.fireDef(bb); return !f || ['catch', 'blaze', 'gutted'].every(st => Assets.fireStrip(bb.key, f.lv, st));
}), null, { timeout: 60000 }).catch(() => {});
{
  const v = await p.evaluate(() => {
    const out = [];
    const mask = (draw) => {
      const c = document.createElement('canvas'); c.width = c.height = 420;
      const g = c.getContext('2d'); g.translate(110, 210); draw(g);
      const d = g.getImageData(0, 0, 420, 420).data, m = new Uint8Array(420 * 420);
      for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] >= 128 ? 1 : 0;
      return m;
    };
    for (const bb of Object.values(__b)) {
      const f = R.fireDef(bb); if (!f) continue;
      const hp = bb.hp; bb.hp = bb.maxhp;
      const fin = R.bldSprite(bb); bb.hp = hp;
      const strip = Assets.fireStrip(bb.key, f.lv, 'catch');
      if (!fin || !strip) { out.push({ id: bb.key + f.lv, missing: true }); continue; }
      const A = mask(g => R.blitBld(g, fin, 0, 0, 200, 200));
      const fr = R._fireFrame({ id: -77 }, strip, 0, f.d);
      const B = mask(g => R.blitBld(g, fr, 0, 0, 200, 200));
      R._hallScr.delete(-77);
      let both = 0, a = 0, fa = -1, fb = -1, sxa = 0, sxb = 0, nb = 0;
      for (let i = 0; i < A.length; i++) {
        const y = (i / 420) | 0, x = i % 420;
        if (A[i]) { a++; sxa += x; if (B[i]) both++; fa = Math.max(fa, y); }
        if (B[i]) { nb++; sxb += x; fb = Math.max(fb, y); }
      }
      out.push({ id: bb.key + f.lv, cover: +(both / Math.max(1, a)).toFixed(3), foot: fb - fa,
        cx: +((sxb / Math.max(1, nb)) - (sxa / Math.max(1, a))).toFixed(1) });
    }
    return out;
  });
  const bad = v.filter(r => r.missing || r.cover < 0.9 || Math.abs(r.foot) > 3 || Math.abs(r.cx) > 4);
  const worst = v.filter(r => !r.missing).sort((x, y) => x.cover - y.cover)[0];
  ck('itLandsOnTheFinishedPictureAtEveryKindAndLevel', !bad.length && v.length >= 37,
    bad.length ? JSON.stringify(bad.slice(0, 4)) : v.length + ' pictures; least covered ' + JSON.stringify(worst));
}

// ---- every caller draws the one picture; no flame sprite over it ----
{
  const v = await p.evaluate(() => {
    const h = __b.house2, br = __b.barracks2;
    h.hp = h.maxhp * 0.5; br.hp = br.maxhp * 0.5;
    const seen = [], flames = [];
    const oB = R.blitBld, oS = Assets.drawSprite;
    R.blitBld = function (g, spr, ...r) { seen.push(spr); return oB.call(this, g, spr, ...r); };
    Assets.drawSprite = function (g, key, ...r) { flames.push(key); return oS.call(this, g, key, ...r); };
    try {
      R.draw(1 / 60);
      const sh = R._hallScr.get(h.id), sb = R._hallScr.get(br.id);
      const out = { house: R.wornSprite(h) === sh && seen.includes(sh), barracks: R.wornSprite(br) === sb && seen.includes(sb),
        flames: flames.filter(k => /flame/.test(k)).length };
      R.BFIRE.on = false; flames.length = 0;
      R.draw(1 / 60);
      out.flameOld = flames.filter(k => /flame/.test(k)).length;
      return out;
    } finally { R.blitBld = oB; Assets.drawSprite = oS; R.BFIRE.on = true; }
  });
  ck('everyCallerDrawsTheOnePicture', v.house && v.barracks, JSON.stringify(v));
  ck('noFlameSpriteIsLaidOverItsOwnFire', v.flames === 0 && v.flameOld > 0, 'own fire ' + v.flames + ' flame sprites; old look ' + v.flameOld);
}
{
  const v = await p.evaluate(() => {
    const h = __b.house1; h.owner = 'A'; h.hp = h.maxhp * 0.5;
    const a = R.fireArt(h); h.owner = 'P';
    return { rival: !!a };
  });
  ck('theRivalsBuildingsBurnInTheirOwnArtToo', v.rival, '');
}

// ---- the smoke: its own stream, nothing written, there, capped ----
{
  const v = await p.evaluate(async () => {
    for (const bb of Object.values(__b)) bb.hp = bb.maxhp * 0.05;
    const rng0 = S.rngState, bl0 = JSON.stringify(S.buildings.map(q => [q.id, q.hp, q.x, q.y, q.level]));
    let calls = 0, maxP = 0, maxE = 0;
    const oD = R.drawFireSmoke;
    R.drawFireSmoke = function (...a) { const m = Math.random; Math.random = () => { calls++; return m(); }; try { return oD.apply(this, a); } finally { Math.random = m; } };
    try {
      for (let i = 0; i < 90; i++) {
        R.draw(1 / 30); await new Promise(r => setTimeout(r, 33));
        let pz = 0, ez = 0;
        for (const bb of Object.values(__b)) { const fx = R._hallFx.get(bb.id); if (fx) { pz += fx.puffs.length; ez += fx.embers.length; } }
        maxP = Math.max(maxP, pz); maxE = Math.max(maxE, ez);
      }
    } finally { R.drawFireSmoke = oD; }
    return { calls, rng: S.rngState === rng0, same: JSON.stringify(S.buildings.map(q => [q.id, q.hp, q.x, q.y, q.level])) === bl0,
      maxP, maxE, capP: R.BFIRE.puffMax, capE: R.BFIRE.emberMax };
  });
  ck('theSmokeAndEmbersDrawNoRng', v.calls === 0 && v.rng, JSON.stringify(v));
  ck('andWriteNothing', v.same, '');
  ck('andAWholeTownOnFireIsCapped', v.maxP > 60 && v.maxP <= v.capP && v.maxE > 40 && v.maxE <= v.capE,
    v.maxP + ' puffs (cap ' + v.capP + '), ' + v.maxE + ' embers (cap ' + v.capE + ')');
}
{
  const v = await p.evaluate(async () => {
    const h = __b.house3, ox = h.x, oy = h.y;
    for (const bb of Object.values(__b)) if (bb !== h) bb.hp = bb.maxhp;
    h.y = 1; Bld._block = null; G.updateVisibility();
    R.cam.z = 2; R.centerOn(h.x + 0.5, 1.5);
    h.hp = h.maxhp * 0.05;
    for (let i = 0; i < 70; i++) { R.draw(1 / 30); await new Promise(r => setTimeout(r, 33)); }
    // the old hearth puffs: a house on fire breathes its fire's smoke, never its
    // hearth's (every roll let through), and a puff already over the black is cut
    // at the board's edge
    const mr = Math.random;
    let hearth = -1;
    try {
      Math.random = () => 0; R.smoke = []; R.smokeT = 0; R.draw(1 / 60);
      hearth = R.smoke.filter(q => Math.abs(q.x - (h.x + 0.5)) < 0.2 && Math.abs(q.y - (h.y + 0.18)) < 0.2).length;
    } finally { Math.random = mr; }
    R.smoke.push({ x: h.x + 0.5, y: 0.4, t: 0, ttl: 9, a: 0.3, probe: 1 });
    R.draw(1 / 60);
    R.smoke = R.smoke.filter(q => !q.probe);
    const bp = R.boardPx(), z = R.cam.z * R.dpr;
    const top = Math.floor((bp.y0 - R.cam.y) * z) - 2;
    let lit = 0, n = 0;
    if (top > 4) {
      const d = R.cv.getContext('2d').getImageData(0, 0, R.cv.width, top).data;
      for (let i = 0; i < d.length; i += 4) { n++; if (Math.abs(d[i] - 13) > 6 || Math.abs(d[i + 1] - 11) > 6 || Math.abs(d[i + 2] - 8) > 6) lit++; }
    }
    const fx = R._hallFx.get(h.id);
    const over = fx ? fx.puffs.filter(q => q.y - CFG.TILE * 0.95 * q.t < bp.y0).length + fx.embers.filter(e => e.y < bp.y0).length : 0;
    h.x = ox; h.y = oy; Bld._block = null; G.updateVisibility();
    return { top, n, lit, over, hearth };
  });
  ck('nothingIsDrawnInTheBlack', v.top > 4 && v.n > 0 && v.lit === 0, JSON.stringify(v));
  ck('andTheProbeIsUnderTheSmoke', v.over > 0, v.over + ' puffs and sparks past the board\'s edge');
  ck('aBurningHouseBreathesNoHearthSmoke', v.hearth === 0, v.hearth + ' hearth puffs from the burning house');
}

// ---- a house falls onto its own ruin ----
{
  // the ruin a house will wear is asked the moment it comes down (Ruins.note),
  // never when its fall ends — on a stone house whose ground would class as
  // rubble, the pinned stone house must be the picture asked
  const v = await p.evaluate(() => {
    let x = 2; while (x < 60 && Ruins.hash(x, 3, 7) < 0.5) x++;
    const keep = Ruins._img, saved = S.ruins.slice();
    Ruins._img = {};
    Ruins.note({ id: -5, key: 'house', owner: 'P', level: 3, x, y: 3, sz: 1, hp: 0, maxhp: 1 });
    const asked = Object.keys(Ruins._img), cls = Ruins.classOf({ key: 'house', level: 3, x, y: 3 });
    Ruins._img = Object.assign(keep, Ruins._img); S.ruins = saved;
    return { asked, cls };
  });
  ck('aFallingHouseAsksForItsOwnRuinAtOnce', v.cls === 'rubble' && v.asked.length === 1 && v.asked[0] === 'stonehouse-1', JSON.stringify(v));
}
await p.evaluate(() => { for (const [c, v] of Ruins.PIN.house) Ruins.want(c, v); });
await p.waitForFunction(() => Ruins.PIN.house.every(([c, v]) => Ruins.img(c, v)), null, { timeout: 30000 }).catch(() => {});
for (const lv of [1, 2, 3]) {
  await p.evaluate((lv) => {
    const h = __b['house' + lv]; h.hp = h.maxhp * 0.05; R.draw(1 / 60);
  }, lv);
  await p.waitForFunction((lv) => Assets.fireStrip('house', lv, 'fall'), lv, { timeout: 30000 }).catch(() => {});
  const v = await p.evaluate((lv) => {
    const h = __b['house' + lv];
    R.cam.z = 2; R.centerOn(h.x + 0.5, h.y + 0.5);
    S.paused = false;
    Bld.damage(h, 1e9);
    const c = R.collapses.find(z => z.fire && z.x === h.x && z.y === h.y);
    const seen = [];
    const oB = R.blitBld;
    R.blitBld = function (g, spr, ...r) { seen.push(spr); return oB.call(this, g, spr, ...r); };
    try { R.draw(1 / 60); } finally { R.blitBld = oB; }
    const scr = R._hallScr.get(h.id);
    const rec = (S.ruins || []).find(r => r.x === h.x && r.y === h.y);
    const pin = Ruins.PIN.house[lv - 1];
    const out = {
      fall: !!c, drawn: !!scr && seen.includes(scr), footing: c ? Footing.look(c.pseudo) : null,
      waits: !!R.collapseAt(h.x, h.y), pinned: !!rec && rec.c === pin[0] && rec.v === pin[1] && rec.m === 0,
      gone: !S.buildings.includes(h),
    };
    // the fall's last frame against the ruin where the ruins pass draws it
    if (c) {
      const fall = Assets.fireStrip('house', lv, 'fall'), n = (fall.width / fall.height) | 0;
      const im = Ruins.img(pin[0], pin[1]);
      out.ruinImg = !!im;
      if (im) {
        const TL = CFG.TILE, W = 300;
        const paint = (draw) => { const cv = document.createElement('canvas'); cv.width = cv.height = W; const g = cv.getContext('2d'); g.imageSmoothingEnabled = false; draw(g); return g.getImageData(0, 0, W, W).data; };
        const fr = R._fireFrame({ id: -78 }, fall, n - 1, c.fire.d);
        const A = paint(g => R.blitBld(g, fr, 100, 150, TL * 2, TL * 2));
        R._hallScr.delete(-78);
        const B = paint(g => { const dw = TL * 2, dh = dw * im.height / im.width; g.imageSmoothingEnabled = true; g.drawImage(im, 100, 150 + TL * 2 - dh, dw, dh); });
        let inter = 0, uni = 0, dc = 0, nc = 0;
        for (let i = 0; i < A.length; i += 4) {
          const a = A[i + 3] >= 128, bq = B[i + 3] >= 128;
          if (a || bq) uni++;
          if (a && bq) { inter++; dc += Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]); nc++; }
        }
        out.iou = +(inter / Math.max(1, uni)).toFixed(3); out.dcol = +(dc / Math.max(1, nc) / 3).toFixed(1);
      }
    }
    return out;
  }, lv);
  ck('aHouseFallsInItsOwnPlace_l' + lv, v.fall && v.drawn && v.gone, JSON.stringify({ fall: v.fall, drawn: v.drawn }));
  ck('andTheFootingAndTheRemainsWait_l' + lv, v.footing === 'none' && v.waits, JSON.stringify({ footing: v.footing, waits: v.waits }));
  ck('ontoItsOwnPinnedRuin_l' + lv, v.pinned && v.ruinImg && v.iou >= 0.9 && v.dcol <= 14, JSON.stringify({ pinned: v.pinned, iou: v.iou, dcol: v.dcol }));
}
{
  const v = await p.evaluate(() => {
    // run every fall to its end: the ruins pass takes over, the collapse is gone
    for (let i = 0; i < 400; i++) R.drawCollapses(R.g, 1 / 30);
    const left = R.collapses.filter(z => z.fire).length;
    const rec = (S.ruins || []).filter(r => Object.values(__b).some(bb => bb.key === 'house' && bb.x === r.x && bb.y === r.y));
    return { left, ruins: rec.length, live: rec.every(r => Ruins.live(r)) };
  });
  ck('whenItIsDownItsRuinStands', v.left === 0 && v.ruins === 3 && v.live, JSON.stringify(v));
}
{
  const v = await p.evaluate(() => {
    const r0 = { key: 'barracks', level: 1, x: 2, y: 2 };
    return { classed: Ruins.classOf(r0), pinned: !!Ruins.PIN.barracks };
  });
  ck('onlyTheHouseIsPinned', v.classed === 'yard' && !v.pinned, JSON.stringify(v));
}
{
  const v = await p.evaluate(() => {
    G.newGame('bfire2', 'moderate', 'medium');
    Screens._demo = false; Screens.show('playing'); S.paused = false;
    G.freeVis = true; G.updateVisibility();
    const tc = Bld.tcOf('P');
    let h = null;
    for (let r = 3; r < 9 && !h; r++) for (let dy = -r; dy <= r && !h; dy++) for (let dx = -r; dx <= r && !h; dx++)
      if (Bld.canPlace('P', 'house', tc.x + dx, tc.y + dy, { noCost: true }).ok) h = Bld.place('P', 'house', tc.x + dx, tc.y + dy, { free: true, instant: true });
    if (!h) return { none: true };
    h.hp = h.maxhp * 0.05; R.draw(1 / 60);
    const keep = Assets.hallFire['house-l1-fall'];
    delete Assets.hallFire['house-l1-fall'];
    let c = null;
    try { Bld.damage(h, 1e9); c = R.collapses.find(z => z.fire); } finally { if (keep) Assets.hallFire['house-l1-fall'] = keep; }
    return { fall: !!c, gone: !S.buildings.includes(h) };
  });
  ck('withoutItsFallArtAHouseGoesAsEveryBuildingUsedTo', !v.none && !v.fall && v.gone, JSON.stringify(v));
}

await b.close(); srv.close();
const realErrs = errs.filter(e => !/Failed to fetch|NetworkError|ERR_|supabase/i.test(e));
ck('noPageErrors', realErrs.length === 0, realErrs.slice(0, 3).join(' | '));
for (const [k, v] of Object.entries(results)) console.log((v.startsWith('PASS') ? '  ok   ' : '  FAIL ') + k + (v.includes(' — ') ? v.slice(4) : ''));
if (fails.length) { console.log(`\n${fails.length} FAILURE(S) — ${fails.join(', ')}`); process.exit(1); }
console.log('\nall building-fire contract checks passed');
