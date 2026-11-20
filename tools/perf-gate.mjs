#!/usr/bin/env node
/* THE SMOOTHNESS GATE — a release candidate is played side by side with the
   REFERENCE build on a simulated slow phone, and held back if it plays
   noticeably worse (CLAUDE.md, "THE SMOOTHNESS GATE"; operator, build 207:
   "add that as a check before releases go out to ensure new features haven't
   caused game degradation").

   WHAT IT PLAYS. Each session is a fresh browser at 390x844@3 with the main
   thread slowed THROTTLE times (Chrome's own CPU throttling, the profile build
   207 was measured on), playing what the operator played:
     - the journey's first game, BEGIN pressed the moment it can be, its
       opening glide, then the villagers walking;
     - two random worlds back to back (two fixed seeds, two tunics): the trial,
       the origin draft, the keep, the opening, villagers walking, the camera
       panning out and back; then Menu → title → the next world.
   WHAT IT MEASURES, all from outside the game (a rAF probe, the page's own
   counters, Chrome's heap): how long a press takes to open the world, the
   blocky stand-in ground drawn while a world opens, the frame time while a
   world opens and while it is played, the slow frames (stutter), walkers that
   stand frozen mid-stride, the cost of drawing one frame of the town at full
   speed (the world pass), the unit art held after the second world, the heap,
   and any error.

   WHY SIDE BY SIDE. A frame time is a fact about the machine as much as the
   game, so the candidate is never judged against a number written down on
   another computer: the reference build (tools/perf-reference.json) is played
   on the SAME machine in the same run, sessions interleaved, and the verdict
   reads the ratio. In CI four runners each play one session of each build
   (half of them reference first), and a metric fails only when the MEDIAN of
   the four ratios is past its allowance — a noisy runner is outvoted.

   THE REFERENCE MOVES ONLY BY RULING. It is the last build the operator
   called smooth (build 207). Comparing against it, not against whatever
   shipped last, is what stops ten small slowdowns from adding up to one big
   one. A change that is knowingly heavier and accepted moves the reference
   (one line in tools/perf-reference.json, with the ruling in its `why`).

     node tools/perf-gate.mjs                      measure here and judge
         (candidate: this working tree; reference: tools/perf-reference.json;
          --rounds N interleaves N sessions of each, default 2)
     node tools/perf-gate.mjs measure --out F.json [--order rc|cr]
         one runner's sessions, written for `judge` (what CI's runners call)
     node tools/perf-gate.mjs judge A.json B.json …  [--summary F.md]
         the verdict over every runner's file; exit 1 on a regression
   Options: --cand DIR|REF (default the working tree), --ref REF (default the
   pinned reference), --throttle N (default 4), --rounds N, --keep-going. */
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';

const root = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'));
const argv = process.argv.slice(2);
const cmd = /^(measure|judge|run)$/.test(argv[0] || '') ? argv.shift() : 'run';
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const flag = (k) => argv.includes('--' + k);
const REF_FILE = join(root, 'tools/perf-reference.json');

// ─── what one session plays, and for how long ─────────────────────────────
const PLAY = {
  throttle: +opt('throttle', 4),
  viewport: { width: 390, height: 844 }, dpr: 3,
  openS: 5,          // the window after a world opens: the glide, the ground arriving
  walkS: 10,         // villagers walking out and back from the hall
  panS: 6,           // the camera carried out and back across the world
  panTiles: 10,
  worlds: [          // two fixed worlds, two tunics: the second has a new dye to install
    { seed: '20701', tunicSeed: 11 },
    { seed: '20702', tunicSeed: 23 },
  ],
  mode: 'moderate', size: 'medium',
  T: { boot: 180000, open: 150000, deal: 90000, title: 90000 },   // generous: a 4x-throttled 2-core runner
};

// ─── the allowances ───────────────────────────────────────────────────────
// `rel` is how much worse the candidate may be (a ratio over the reference),
// `abs` the least change that counts (so a 2 ms frame never fails on 10%).
// A metric fails only when the median ratio over the runners is past `rel`
// AND the median change is past `abs`. Calibrated on build 207 against
// itself (no false alarm) and build 206 against 207 (the stutter the
// operator reported must be caught): CLAUDE.md has the numbers.
const METRICS = [
  { key: 'openJourney', name: 'BEGIN to playing (the journey)', unit: 'ms', rel: 0.35, abs: 2000 },
  { key: 'openWorlds', name: 'keep to playing (two worlds)', unit: 'ms', rel: 0.25, abs: 1000 },
  { key: 'standIn', name: 'blocky ground while opening', unit: 'draws', rel: 0.5, abs: 15 },
  { key: 'openFrame', name: 'frame time while opening', unit: 'ms', rel: 0.20, abs: 12 },
  { key: 'playFrame', name: 'frame time while playing', unit: 'ms', rel: 0.15, abs: 8 },
  { key: 'playP95', name: 'slowest frames while playing (p95)', unit: 'ms', rel: 0.25, abs: 25 },
  { key: 'playP99', name: 'worst frames while playing (p99)', unit: 'ms', rel: 0.6, abs: 60 },
  { key: 'frozen', name: 'walkers frozen mid-stride', unit: '%', abs: 3 },
  { key: 'passMin', name: 'drawing one frame of the town, full speed', unit: 'ms', rel: 0.25, abs: 0.05 },
  { key: 'artMB', name: 'unit art held after two games', unit: 'MB', rel: 0.15, abs: 20 },
  { key: 'heapMB', name: 'JS heap after two games', unit: 'MB', rel: 0.20, abs: 15 },
];

const q = (a, f) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(f * s.length))]; };
const median = (a) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); if (!s.length) return NaN; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mean = (a) => { const s = a.filter(Number.isFinite); return s.length ? s.reduce((x, y) => x + y, 0) / s.length : NaN; };
const sh = (c) => execSync(c, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 26 }).toString().trim();

// ─── the builds ───────────────────────────────────────────────────────────
const buildOf = (dir) => {
  try { const m = readFileSync(join(dir, 'index.html'), 'utf8').match(/js\/[a-z0-9-]+\.js\?v=(\d+)/); return m ? +m[1] : null; }
  catch (e) { return null; }
};
// a directory is served as it stands; anything else is a git ref, extracted
// once into the temp dir (the tree is ~130 MB: archive, never a worktree)
const prepBuild = (spec, label) => {
  if (spec && existsSync(join(resolve(spec), 'index.html'))) {
    const dir = resolve(spec);
    let sha = null; try { if (dir === root) sha = sh('git rev-parse HEAD') + (sh('git status --porcelain --untracked-files=no') ? '+dirty' : ''); } catch (e) {}
    return { label, dir, sha, build: buildOf(dir) };
  }
  let sha;
  try { sha = sh(`git rev-parse --verify --quiet ${spec}^{commit}`); }
  catch (e) {
    // CI checks out one commit: fetch the reference by its id
    try { sh(`git fetch --no-tags --depth=1 origin ${spec}`); sha = sh(`git rev-parse --verify --quiet ${spec}^{commit}`); }
    catch (e2) { throw new Error(`cannot find build ${spec} (${label}) — fetch it, or pass a directory`); }
  }
  const dir = join(tmpdir(), 'clanfire-perf', sha);
  if (!existsSync(join(dir, 'index.html'))) {
    mkdirSync(dir, { recursive: true });
    sh(`git archive --format=tar ${sha} | tar -x -C ${JSON.stringify(dir)}`);
  }
  return { label, dir, sha, build: buildOf(dir) };
};
const reference = () => JSON.parse(readFileSync(REF_FILE, 'utf8'));

// ─── one static server per build, so each build is its own origin ─────────
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ico': 'image/x-icon' };
const serve = async (dir) => {
  const srv = createServer(async (rq, rs) => {
    try {
      const u = decodeURIComponent(rq.url.split('?')[0]);
      const f = join(dir, u === '/' ? 'index.html' : u.replace(/^\/+/, ''));
      if (!f.startsWith(dir)) { rs.writeHead(403); rs.end(); return; }
      const body = await readFile(f);
      rs.writeHead(200, { 'content-type': TYPES[f.slice(f.lastIndexOf('.'))] || 'application/octet-stream' });
      rs.end(body);
    } catch (e) { rs.writeHead(404); rs.end(); }
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  return { srv, base: 'http://127.0.0.1:' + srv.address().port + '/' };
};

// ─── the probe: a rAF loop of its own, read the same way on every build ───
const PROBE = () => {
  if (window.__pg) return;
  const P = window.__pg = { t: [], marks: [], walk: [], screens: [], last: null, lastS: null, scr: null, press: null };
  const si = () => { try { return (window.TerrainX && TerrainX.stats && TerrainX.stats.standIn) || 0; } catch (e) { return 0; } };
  P.mark = (name) => { P.marks.push([performance.now(), name, si()]); return performance.now(); };
  addEventListener('pointerdown', () => { P.press = performance.now(); P.pressSI = si(); }, true);
  const motion = (now) => {
    if (typeof S === 'undefined' || !S || !S.units || typeof Screens === 'undefined' || Screens.current !== 'playing' || S.paused || S.over) { P.last = null; return; }
    if (S !== P.lastS) { P.last = null; P.lastS = S; }
    const cur = new Map(); let walkN = 0, frozenN = 0;
    for (const u of S.units) {
      if (u.owner !== 'P') continue;
      let pose = ''; try { pose = R.unitPose(u); } catch (e) {}
      cur.set(u.id, [u.x, u.y, pose]);
      const o = P.last && P.last.get(u.id);
      if (o && o[2] === 'walk' && pose === 'walk') { walkN++; if (Math.abs(u.x - o[0]) + Math.abs(u.y - o[1]) < 1e-4) frozenN++; }
    }
    P.last = cur;
    if (walkN) P.walk.push([now, walkN, frozenN]);
  };
  const tick = () => {
    const now = performance.now();
    P.t.push(now);
    try {
      const c = typeof Screens !== 'undefined' ? Screens.current : null;
      if (c !== P.scr) { P.screens.push([now, c, si()]); P.scr = c; }
      motion(now);
    } catch (e) {}
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  // villagers walk out to a ring round the hall and back, a fresh order every 3.5 s
  P.walkers = (secs) => new Promise(res => {
    let k = 0;
    const go = () => {
      try {
        if (typeof S === 'undefined' || !S || S.over) return;
        const tc = S.buildings.find(b => b.key === 'tc' && b.owner === 'P'); if (!tc) return;
        const us = S.units.filter(u => u.owner === 'P' && !(Units.isNaval && Units.isNaval(u)));
        us.forEach((u, i) => {
          const a = (i / Math.max(1, us.length)) * 6.283 + (k % 2 ? 3.14 : 0);
          const x = Math.round(tc.x + 1 + Math.cos(a) * 5), y = Math.round(tc.y + 1 + Math.sin(a) * 5);
          if (Path.passable(x, y, 'P')) Units.moveTo(u, x, y);
        });
        k++;
      } catch (e) {}
    };
    go(); const iv = setInterval(go, 3500);
    setTimeout(() => { clearInterval(iv); res(); }, secs * 1000);
  });
  // the camera carried toward the middle of the world and back, eased
  P.pan = (tiles, ms) => new Promise(res => {
    try {
      const TL = CFG.TILE, world = CFG.W * TL, z = R.cam.z;
      const vw = R.viewW() / z, vh = R.viewH() / z;
      const x0 = R.cam.x, y0 = R.cam.y, cx = x0 + vw / 2, cy = y0 + vh / 2;
      let dx = world / 2 - cx, dy = world / 2 - cy; const d = Math.hypot(dx, dy) || 1;
      dx = dx / d * tiles * TL; dy = dy / d * tiles * TL;
      const t0 = performance.now();
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / ms), f = Math.sin(Math.PI * k);
        R.cam.x = x0 + dx * f; R.cam.y = y0 + dy * f;
        try { R.clampCam(); } catch (e) {}
        if (k < 1) requestAnimationFrame(step); else res();
      };
      requestAnimationFrame(step);
    } catch (e) { res(); }
  });
  P.artMB = () => {
    let px = 0, n = 0;
    try { for (const a of Object.values(Assets.unitArt)) for (const d of Object.values(a.dirs || {})) for (const fr of Object.values(d)) for (const c of fr) { n++; px += (c.width || 0) * (c.height || 0); } }
    catch (e) { return null; }
    return { frames: n, mb: px * 4 / 1e6 };
  };
};

// a seeded stand-in for Math.random while a world is founded, so each build
// founds the same world in the same tunic (the founding rolls the tunic and
// the rival's chief with Math.random; the URL's ?seed= pins the map)
const PIN_FOUNDING = () => {
  if (!window.Screens || !Screens.foundRun || Screens.foundRun.__pg) return;
  const real = Screens.foundRun;
  const w = function () {
    let s = (window.__pgSeed >>> 0) || 1;
    const rnd = Math.random;
    Math.random = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    try { return real.apply(this, arguments); } finally { Math.random = rnd; }
  };
  w.__pg = 1; Screens.foundRun = w;
};

// ─── one session: the journey's first game, then two worlds back to back ──
const session = async (pw, base, which) => {
  const out = { build: which, ok: true, step: '', errors: [], runErrs: [], journey: null, worlds: [], heapMB: null, art: [] };
  // the game's own tally of the faults it caught (Feedback.runErrs) is the
  // RUN's and starts again with each world, so it is read as each one ends
  const tally = async (p) => out.runErrs.push(await p.evaluate(() => window.Feedback && Number.isFinite(Feedback.runErrs) ? Feedback.runErrs : 0));
  const browser = await pw.chromium.launch({ args: ['--enable-precise-memory-info'] });
  const errs = (p) => {
    p.on('pageerror', e => out.errors.push('page: ' + String(e).slice(0, 300)));
  };
  const context = async () => {
    const ctx = await browser.newContext({ viewport: PLAY.viewport, deviceScaleFactor: PLAY.dpr });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());   // nothing leaves the machine
    await ctx.addInitScript(PROBE);
    return ctx;
  };
  const step = (s) => { out.step = s; };
  const read = async (p) => p.evaluate(() => {
    const P = window.__pg;
    return { t: P.t, marks: P.marks, walk: P.walk, screens: P.screens, runErrs: window.Feedback && Number.isFinite(Feedback.runErrs) ? Feedback.runErrs : null };
  });
  try {
    // ── the journey: a new device, BEGIN the moment it can be pressed
    {
      const ctx = await context();
      const p = await ctx.newPage(); errs(p);
      const cdp = await ctx.newCDPSession(p);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: PLAY.throttle });
      step('journey: boot to BEGIN');
      await p.goto(base + 'index.html?prologue=reset', { waitUntil: 'domcontentloaded', timeout: PLAY.T.boot });
      await p.waitForFunction(() => window.Screens && Screens.current === 'title' && !document.getElementById('splash') &&
        window.Prologue && Prologue.holding && Prologue.holding() && S.scenario === 'prologue_1' &&
        (() => { const b = document.getElementById('btnBegin'); return !!b && b.offsetWidth > 0; })(), null, { timeout: PLAY.T.boot, polling: 100 });
      step('journey: BEGIN to playing');
      await p.click('#btnBegin', { timeout: 30000 });
      await p.waitForFunction(() => Screens.current === 'playing' && S.scenario === 'prologue_1', null, { timeout: PLAY.T.open, polling: 100 });
      await p.waitForTimeout(PLAY.openS * 1000);
      step('journey: walking');
      await p.evaluate(() => __pg.mark('walk'));
      await p.evaluate((s) => __pg.walkers(s), PLAY.walkS);
      await p.evaluate(() => __pg.mark('walkEnd'));
      await tally(p);
      const r = await read(p);
      out.journey = { ...r, press: await p.evaluate(() => [__pg.press, __pg.pressSI]) };
      await ctx.close();
    }
    // ── two worlds back to back, as a returning player plays them
    {
      const ctx = await context();
      await ctx.addInitScript(() => {
        try {
          if (!sessionStorage.getItem('pg-seeded')) {
            for (const [k, v] of [['neo-tutorial-ask', '0'], ['neo-games', '9'], ['neo-draft-help', '1'], ['neo-cards-intro', '1'], ['neo-victory-seen', '1']]) localStorage.setItem(k, v);
            sessionStorage.setItem('pg-seeded', '1');
          }
        } catch (e) {}
      });
      const p = await ctx.newPage(); errs(p);
      const cdp = await ctx.newCDPSession(p);
      step('worlds: boot to title');
      await p.goto(base + 'index.html?prologue=0', { waitUntil: 'domcontentloaded', timeout: PLAY.T.boot });
      await p.waitForFunction(() => window.Screens && Screens.current === 'title' && !document.getElementById('splash') && window.Assets && Assets.ready, null, { timeout: PLAY.T.boot, polling: 100 });
      await p.waitForTimeout(1500);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: PLAY.throttle });
      for (let g = 0; g < PLAY.worlds.length; g++) {
        const W = PLAY.worlds[g];
        step(`world ${g + 1}: founding`);
        await p.evaluate(({ seed, tunicSeed, mode, size, pin }) => {
          window.__pgSeed = tunicSeed;
          eval('(' + pin + ')')();
          history.replaceState(null, '', location.pathname + `?prologue=0&seed=${seed}&size=${size}`);
          Screens.newPrefs.mode = mode;
          Screens.show('newgame');
          Screens.startNewGame();
        }, { ...W, mode: PLAY.mode, size: PLAY.size, pin: PIN_FOUNDING.toString() });
        step(`world ${g + 1}: the draft deals`);
        await p.waitForFunction(() => { const c = document.getElementById('draftCards'); return Screens.current === 'draft' && c && c.children[0] && c.children[0].classList.contains('flip'); }, null, { timeout: PLAY.T.deal, polling: 100 });
        step(`world ${g + 1}: keep to playing`);
        await p.evaluate(() => { const c = document.getElementById('draftCards').children[0]; __pg.mark('keep'); Screens.draftTap(0, c); Screens.draftTap(0, c); });
        await p.waitForFunction(() => Screens.current === 'playing' && typeof S !== 'undefined' && S && !S.paused && S.played !== false, null, { timeout: PLAY.T.open, polling: 100 });
        await p.waitForTimeout(PLAY.openS * 1000);
        step(`world ${g + 1}: walking`);
        await p.evaluate(() => __pg.mark('walk'));
        await p.evaluate((s) => __pg.walkers(s), PLAY.walkS);
        await p.evaluate(() => __pg.mark('pan'));
        await p.evaluate(({ t, s }) => __pg.pan(t, s * 1000), { t: PLAY.panTiles, s: PLAY.panS });
        await p.evaluate(() => __pg.mark('panEnd'));
        out.art.push(await p.evaluate(() => __pg.artMB()));
        await tally(p);
        out.worlds.push({ seed: W.seed, tunic: await p.evaluate(() => S.tunic && S.tunic.P), mapSeed: await p.evaluate(() => S.seed) });
        if (g < PLAY.worlds.length - 1) {
          step(`world ${g + 1}: menu to title`);
          await p.evaluate(() => { Screens._confirmQuit = true; Screens.quitToTitle(); });
          await p.waitForFunction(() => Screens.current === 'title', null, { timeout: PLAY.T.title, polling: 100 });
          await p.waitForTimeout(1000);
        }
      }
      /* THE WORLD PASS, on the machine's own time: the cost of drawing one
         frame of the town (R.draw alone: the sim is not stepped), the main
         thread at full speed — land.mjs's measurement, read here beside the
         reference instead of against a number written down on another
         computer. A live R.draw also does the frame's share of background
         work (ground arriving after the pan, a footing measured, a bake
         slice), so the view is settled first and the FASTEST of many
         batches is read: the draw itself, nothing queued behind it. Batches
         of 24 because the clock ticks in 0.1 ms. Measured in this session on
         this sandbox: build 207 against itself 0.238 / 0.233 ms, and a build
         with 0.3 ms added to every draw 0.221 → 0.537 ms (held); the median
         of a few batches had read one build 0.29 and 0.47. */
      step('worlds: the world pass');
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      await p.evaluate(() => {
        const tc = S.buildings.find(b => b.key === 'tc' && b.owner === 'P');
        R.cam.z = 1.5; if (tc) R.centerOn(tc.x + 0.5, tc.y + 0.5);
      });
      await p.waitForTimeout(4000);
      out.pass = await p.evaluate(() => {
        for (let k = 0; k < 60; k++) R.draw(0.016);
        const bm = [];
        for (let b = 0; b < 24; b++) { const t = performance.now(); for (let k = 0; k < 24; k++) R.draw(0.016); bm.push((performance.now() - t) / 24); }
        bm.sort((a, b) => a - b);
        return { min: bm[0], p25: bm[6], med: (bm[11] + bm[12]) / 2 };
      });
      step('worlds: heap');
      await cdp.send('HeapProfiler.enable');
      await cdp.send('HeapProfiler.collectGarbage');
      const h = await cdp.send('Runtime.getHeapUsage');
      out.heapMB = h.usedSize / 1e6;
      const r = await read(p);
      out.games = r;
      await ctx.close();
    }
  } catch (e) {
    out.ok = false;
    out.error = String(e && e.message || e).split('\n')[0].slice(0, 300);
  } finally {
    await browser.close().catch(() => {});
  }
  out.build = which;
  return out;
};

// ─── a session's numbers ──────────────────────────────────────────────────
const windowFrames = (t, a, b) => { const iv = []; let prev = null; for (const x of t) { if (x < a) { prev = x; continue; } if (x >= b) break; if (prev !== null && prev >= a) iv.push(x - prev); prev = x; } return iv; };
const scoreSession = (s) => {
  if (!s.ok) return null;
  const J = s.journey, G = s.games;
  const opens = [], openIv = [], playIv = [], standIn = [], walk = [0, 0];
  let openJourney = NaN; const openWorlds = [];
  // the journey: press (a real pointerdown) → the playing screen
  const jOpen = J.screens.find(x => x[1] === 'playing' && x[0] >= (J.press[0] || 0));
  if (jOpen && J.press[0]) {
    opens.push(jOpen[0] - J.press[0]);
    openJourney = jOpen[0] - J.press[0];
    const end = jOpen[0] + PLAY.openS * 1000;
    openIv.push(...windowFrames(J.t, jOpen[0], end));
    const m = J.marks.find(x => x[1] === 'walk');
    standIn.push((m ? m[2] : 0) - (J.press[1] || 0));
    const w0 = m ? m[0] : end, w1 = (J.marks.find(x => x[1] === 'walkEnd') || [w0])[0];
    playIv.push(...windowFrames(J.t, w0, w1));
    for (const r of J.walk) if (r[0] >= w0 && r[0] < w1) { walk[0] += r[1]; walk[1] += r[2]; }
  }
  // the worlds: each keep → the playing screen
  const keeps = G.marks.filter(x => x[1] === 'keep');
  for (const k of keeps) {
    const op = G.screens.find(x => x[1] === 'playing' && x[0] >= k[0]);
    if (!op) continue;
    opens.push(op[0] - k[0]);
    openWorlds.push(op[0] - k[0]);
    const end = op[0] + PLAY.openS * 1000;
    openIv.push(...windowFrames(G.t, op[0], end));
    const w = G.marks.find(x => x[1] === 'walk' && x[0] >= op[0]);
    const pe = G.marks.find(x => x[1] === 'panEnd' && x[0] >= op[0]);
    standIn.push((w ? w[2] : 0) - k[2]);
    if (w && pe) {
      playIv.push(...windowFrames(G.t, w[0], pe[0]));
      const pn = G.marks.find(x => x[1] === 'pan' && x[0] >= w[0]);
      for (const r of G.walk) if (r[0] >= w[0] && r[0] < (pn ? pn[0] : pe[0])) { walk[0] += r[1]; walk[1] += r[2]; }
    }
  }
  const typical = q(playIv, 0.5);
  const playS = playIv.reduce((x, y) => x + y, 0) / 1000;
  const art = s.art.length ? s.art[s.art.length - 1] : null;
  return {
    openJourney,
    openWorlds: openWorlds.length === PLAY.worlds.length ? mean(openWorlds) : NaN,
    standIn: standIn.reduce((x, y) => x + y, 0),
    openFrame: openIv.length ? openIv.reduce((x, y) => x + y, 0) / openIv.length : NaN,
    playFrame: playIv.length ? playIv.reduce((x, y) => x + y, 0) / playIv.length : NaN,
    playP95: q(playIv, 0.95),
    /* the worst 1% of the frames pooled over every play window: a stutter is
       a handful of frames a session (the day's tick, ground arriving under a
       pan), so counting them is a coin toss. Their tail is steadier but still
       the noisiest figure judged (one machine read 142 to 238 ms across four
       sessions of one build), so its allowance only catches a NEW hitch: the
       broad slowdowns are p95's and the means' to catch */
    playP99: q(playIv, 0.99),
    stutter: playS > 0 ? playIv.filter(x => x > 2.5 * typical).length / (playS / 60) : NaN,   // reported, never judged
    frozen: walk[0] ? 100 * walk[1] / walk[0] : 0,
    artMB: art ? art.mb : NaN,
    passMin: s.pass ? s.pass.min : NaN,
    passMed: s.pass ? s.pass.med : NaN,   // reported: the settled view's typical draw, background work and all
    heapMB: s.heapMB,
    errors: s.errors.length + (s.runErrs || []).reduce((x, y) => x + (y || 0), 0),
    _opens: opens.map(Math.round), _frames: playIv.length, _art: s.art,
  };
};

// ─── the verdict over every runner's file ─────────────────────────────────
const fmt = (v, unit) => !Number.isFinite(v) ? '—' : unit === 'ms' && Math.abs(v) < 1 ? v.toFixed(3) : unit === 'ms' && Math.abs(v) < 10 ? v.toFixed(2) : unit === 'ms' || unit === 'draws' ? String(Math.round(v)) : v.toFixed(1);
const judge = (files) => {
  const runs = files.map(f => JSON.parse(readFileSync(f, 'utf8')));
  const meta = runs[0].meta;
  const lines = [], fails = [];
  const notes = [];
  /* A CANDIDATE THAT CANNOT BE PLAYED IS HELD; A REFERENCE THAT CANNOT BE
     PLAYED IS A RUNNER LOST. The candidate's failure is the news (a hang, a
     world that never opens); the reference is a build the gate has played a
     hundred times, so its failure is the machine's, and that runner simply
     drops out of the vote — as long as enough runners are left to vote. */
  const perRunner = runs.map(r => {
    const by = { ref: [], cand: [] };
    for (const s of r.sessions) {
      const sc = scoreSession(s);
      if (!sc) {
        const msg = `${r.meta.runner}: the ${s.build === 'ref' ? 'reference' : 'candidate'} could not be played (${s.step}: ${s.error})`;
        (s.build === 'cand' ? fails : notes).push(msg);
        continue;
      }
      by[s.build].push(sc);
      if (s.build === 'cand' && sc.errors > 0) fails.push(`${r.meta.runner}: the candidate threw ${sc.errors} error(s): ${s.errors.slice(0, 2).join(' | ') || 'the game counted them (Feedback.runErrs)'}`);
    }
    return { runner: r.meta.runner, by };
  });
  const voters = perRunner.filter(pr => pr.by.ref.length && pr.by.cand.length).length;
  const minRunners = +opt('min-runners', 1);
  if (voters < minRunners) fails.push(`only ${voters} of ${runs.length} runner(s) played both builds (at least ${minRunners} must)`);
  const rows = [];
  for (const M of METRICS) {
    const refs = [], cands = [], ratios = [], diffs = [];
    for (const pr of perRunner) {
      const a = mean(pr.by.ref.map(x => x[M.key])), b = mean(pr.by.cand.map(x => x[M.key]));
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      refs.push(a); cands.push(b); diffs.push(b - a);
      ratios.push(a > 0 ? b / a : (b > 0 ? Infinity : 1));
    }
    const ref = median(refs), cand = median(cands), ratio = median(ratios), diff = median(diffs);
    let bad = false;
    if (!ratios.length) bad = true;
    else if (M.rel === undefined) bad = diff > M.abs;
    else bad = ratio > 1 + M.rel && diff > M.abs;
    rows.push({ M, ref, cand, ratio, diff, bad, n: ratios.length });
    if (bad) fails.push(ratios.length ? `${M.name}: ${fmt(ref, M.unit)} → ${fmt(cand, M.unit)} ${M.unit}` : `${M.name}: not measured on any runner`);
  }
  const pct = (r) => !Number.isFinite(r) ? '—' : (r >= 1 ? '+' : '') + Math.round((r - 1) * 100) + '%';
  lines.push(`## Smoothness gate — ${fails.length ? '**HELD**: the candidate plays worse than the reference' : 'pass'}`);
  lines.push('');
  lines.push(`Candidate ${meta.cand.label} (build ${meta.cand.build}${meta.cand.sha ? ', ' + String(meta.cand.sha).slice(0, 9) : ''}) against the reference build ${meta.ref.build} (${String(meta.ref.sha).slice(0, 9)}), ` +
    `${runs.length} runner(s), ${runs.reduce((n, r) => n + r.sessions.length, 0)} sessions, phone 390x844@3, main thread ${meta.throttle}x slower. ` +
    `Each figure is the median over the runners of that runner's sessions; a change counts only when it is past both allowances.`);
  lines.push('');
  lines.push('| | reference | candidate | change | allowed | |');
  lines.push('|---|---:|---:|---:|---:|---|');
  for (const r of rows) {
    const allowed = (r.M.rel !== undefined ? '+' + Math.round(r.M.rel * 100) + '% and ' : '') + '+' + r.M.abs + (r.M.unit === '%' ? ' pts' : ' ' + r.M.unit);
    const ch = r.M.rel === undefined ? (r.diff >= 0 ? '+' : '') + fmt(r.diff, r.M.unit) + (r.M.unit === '%' ? ' pts' : ' ' + r.M.unit) : pct(r.ratio);
    lines.push(`| ${r.M.name} (${r.M.unit}) | ${fmt(r.ref, r.M.unit)} | ${fmt(r.cand, r.M.unit)} | ${ch} | ${allowed} | ${r.bad ? '**worse**' : 'ok'} |`);
  }
  lines.push('');
  for (const pr of perRunner) {
    const d = (k, f) => ['ref', 'cand'].map(b => pr.by[b].map(x => f(x[k])).join(' ')).join(' / ');
    lines.push(`- ${pr.runner}: opens (ms) ${d('_opens', v => '[' + v.join(',') + ']')}; playing frames ${d('_frames', v => v)}; frame ms ${d('playFrame', v => Math.round(v))}; p95 ${d('playP95', v => Math.round(v))}; p99 ${d('playP99', v => Math.round(v))}; town frame ${d('passMin', v => v.toFixed(3))} (median ${d('passMed', v => v.toFixed(3))}); stutters/min ${d('stutter', v => v.toFixed(1))}`);
  }
  if (notes.length) { lines.push(''); for (const n of notes) lines.push('- note: ' + n); }
  if (fails.length) { lines.push(''); lines.push('Held because:'); for (const f of fails) lines.push('- ' + f); }
  return { ok: !fails.length, text: lines.join('\n'), rows, fails };
};

// ─── one runner: interleaved sessions of the two builds ───────────────────
const measure = async ({ order, rounds, out, runner }) => {
  let pw;
  try { pw = (await import('playwright')).default; }
  catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
  const ref = prepBuild(opt('ref', reference().commit), 'reference');
  const cand = prepBuild(opt('cand', root), opt('cand') ? 'build ' + opt('cand') : 'this tree');
  const srvR = await serve(ref.dir), srvC = await serve(cand.dir);
  const seq = [];
  for (let i = 0; i < rounds; i++) {
    const first = (order === 'cr') !== (i % 2 === 1) ? 'cand' : 'ref';   // ABBA: the order turns each round
    seq.push(first, first === 'ref' ? 'cand' : 'ref');
  }
  const sessions = [];
  console.log(`[perf-gate] ${runner}: reference build ${ref.build} (${String(ref.sha).slice(0, 9)}) vs candidate build ${cand.build} (${cand.label}), ${seq.join(' → ')}, throttle ${PLAY.throttle}x`);
  for (const which of seq) {
    const t0 = Date.now();
    const s = await session(pw, which === 'ref' ? srvR.base : srvC.base, which);
    const sc = scoreSession(s);
    console.log(`[perf-gate]   ${which.padEnd(4)} ${((Date.now() - t0) / 1000).toFixed(0)}s ` + (sc
      ? `open ${sc._opens.join('/')} ms, ground ${sc.standIn}, frame open ${sc.openFrame.toFixed(0)} play ${sc.playFrame.toFixed(0)} p95 ${sc.playP95.toFixed(0)} p99 ${sc.playP99.toFixed(0)}, stutter ${sc.stutter.toFixed(1)}/min, frozen ${sc.frozen.toFixed(1)}%, pass ${Number(sc.passMin).toFixed(3)}/${Number(sc.passMed).toFixed(3)} ms, art ${sc.artMB.toFixed(0)} MB, heap ${Number(sc.heapMB).toFixed(0)} MB, errors ${sc.errors}`
      : `FAILED at ${s.step}: ${s.error}`));
    sessions.push(s);
  }
  srvR.srv.close(); srvC.srv.close();
  const doc = { meta: { runner, throttle: PLAY.throttle, ref: { sha: ref.sha, build: ref.build, label: ref.label }, cand: { sha: cand.sha, build: cand.build, label: cand.label } }, sessions };
  writeFileSync(out, JSON.stringify(doc));
  return out;
};

if (cmd === 'judge') {
  const files = argv.filter(a => a.endsWith('.json'));
  if (!files.length) { console.error('judge: no result files'); process.exit(2); }
  const v = judge(files);
  console.log(v.text);
  const sum = opt('summary', process.env.GITHUB_STEP_SUMMARY || '');
  if (sum) appendFileSync(sum, v.text + '\n');
  process.exit(v.ok ? 0 : 1);
} else if (cmd === 'measure') {
  const out = opt('out', join(tmpdir(), 'perf-gate.json'));
  await measure({ order: opt('order', 'rc'), rounds: +opt('rounds', 1), out, runner: opt('runner', 'runner') });
  console.log('[perf-gate] wrote ' + out);
} else {
  const out = opt('out', join(tmpdir(), 'perf-gate-local.json'));
  await measure({ order: opt('order', 'rc'), rounds: +opt('rounds', 2), out, runner: 'here' });
  const v = judge([out]);
  console.log('\n' + v.text);
  process.exit(v.ok ? 0 : 1);
}
