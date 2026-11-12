#!/usr/bin/env node
/* tools/ai-harness.mjs — THE RIVAL-AI MEASUREMENT HARNESS.

   Plays whole games of Clanfire headlessly — the real game, in Chromium, the
   way tests/*.mjs load it — against a scripted player, across a matrix of
   worlds x sizes x modes x player styles, and measures what the rival chief
   (owner 'A') actually DID, from ground truth the harness computes itself.

   The matrix is DERIVED from the game's own tables, so a new landform
   variant, mode, size, building, unit or AI method is picked up with no edit
   here: worlds = MapGen.VARIANTS, modes = CFG.MODES, sizes = CFG.SIZES, the
   call table = every function on the AI object.

     node tools/ai-harness.mjs --quick
     node tools/ai-harness.mjs --days 300 --seeds 2 --worlds all --modes moderate,hard \
          --styles passive,turtle,aggressive --sizes medium --lanes 3 --out base.json --label baseline
     node tools/ai-harness.mjs --worlds islands:archipelago --styles passive --trace --out isl.json
     node tools/ai-harness.mjs --coverage --quick --out cov.json
     node tools/ai-harness.mjs --compare base.json after.json
     node tools/ai-harness.mjs --list

   Flags
     --days N            game days per run (default 300)
     --seeds N           seeds per world/size/mode (default 1)
     --worlds LIST|all   landform:variant, comma separated (default all); a bare landform takes its four faces
     --modes LIST        default moderate
     --styles LIST       passive,turtle,aggressive (default all three)
     --sizes LIST        default medium
     --persona KEY       force the rival's origin card / classic persona (G.newGame's 4th argument)
     --lanes K           parallel browsers (default min(3, cpus - 1))
     --out FILE          write the JSON there (and FILE.coverage.json / FILE.<run>.trace.txt)
     --label TEXT        stamped in meta
     --date TEXT         stamped in meta (default: now)
     --coverage          V8 block coverage of js/ai.js (+ totals for combat.js / units.js)
     --trace             one decision line per game day per run
     --quick             4 worlds x moderate x passive+aggressive x 120 days
     --base N            first integer seed tried (default 1000)
     --step S            sim step in seconds (default 0.05, as tests/rival-strength.mjs)
     --dockday N         the "dock by day N" column (default 120)
     --rng N             Math.random's LCG seed (default 777)
     --art               let the page fetch pictures (default: image/media/font requests are refused)
     --bake              keep the terrain cache painted (default: no picture is kept)
     --geo any|split|joined  only seeds whose two halls stand on different / the same land mass (default any;
                         split is where a dock is the only road — the hunt lays each candidate map to look)
     --keepalive         mend the player's hall every morning so no run ends early (an instrument, not fair play)
     --compare A B       print before/after deltas of two result files
     --list              print the tables and the seeds the matrix would use, run nothing

   Exported: runMatrix(opts) -> { meta, runs, summary }  (opts = the flags, camelCase). */

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import os from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const PAGE_JS = join(HERE, 'ai-harness-page.js');

async function playwright() {
  try { return (await import('playwright')).default; }
  catch { return (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
}

/* ---------------- arguments ---------------- */
export function parseArgs(argv) {
  const o = { days: 300, seeds: 1, worlds: 'all', modes: 'moderate', styles: 'passive,turtle,aggressive', sizes: 'medium',
    persona: null, lanes: Math.max(1, Math.min(3, os.cpus().length - 1)), out: null, label: '', date: null,
    coverage: false, trace: false, quick: false, base: 1000, step: 0.05, dockday: 120, rng: 777, art: false, bake: false,
    compare: null, list: false, chunk: 10, quiet: false, keepalive: false, geo: 'any' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const k = a.slice(2);
    if (k === 'compare') { o.compare = [argv[++i], argv[++i]]; continue; }
    if (typeof o[k] === 'boolean') { o[k] = true; continue; }
    if (!(k in o)) throw new Error('unknown flag ' + a);
    const v = argv[++i];
    o[k] = typeof o[k] === 'number' ? Number(v) : v;
  }
  if (o.quick) {
    if (!argv.includes('--worlds')) o.worlds = 'valley:classic,lakeland:greatlake,highlands:highpasses,islands:archipelago';
    if (!argv.includes('--styles')) o.styles = 'passive,aggressive';
    if (!argv.includes('--days')) o.days = 120;
    if (!argv.includes('--modes')) o.modes = 'moderate';
  }
  return o;
}
const list = s => String(s).split(',').map(x => x.trim()).filter(Boolean);

/* ---------------- one page ---------------- */
async function openPage(browser, opts) {
  const ctx = await browser.newContext({ viewport: { width: 500, height: 700 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 300)));
  if (!opts.art) {
    // the pictures are not part of the sim: refusing them saves the decode
    // (every painter stands down for art that is not there — CLAUDE.md)
    await page.route('**/*', r => {
      const t = r.request().resourceType();
      return (t === 'image' || t === 'media' || t === 'font') ? r.abort() : r.continue();
    });
  }
  if (opts.coverage) await page.coverage.startJSCoverage({ resetOnNavigation: false });
  await page.goto(pathToFileURL(join(ROOT, 'index.html')).href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof Screens !== 'undefined' && Screens.current === 'title' && typeof S !== 'undefined' && !!S, null, { timeout: 60000 });
  await page.addScriptTag({ path: PAGE_JS });
  // the page's own loop is stopped, and two frames are let go by so the one
  // already in flight has run; any G.simStep from outside the harness after
  // this is refused and counted (errors.foreignSteps must read 0)
  await page.evaluate(() => { AIH.freeze(); });
  await page.evaluate(() => Promise.race([
    new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(1)))),
    new Promise(r => setTimeout(() => r(0), 400)),
  ]));
  return { ctx, page, errs };
}

async function runOne(browser, job, opts) {
  const t0 = Date.now();
  const { ctx, page, errs } = await openPage(browser, opts);
  let res = null, cov = null;
  try {
    await page.evaluate(cfg => AIH.start(cfg), {
      seed: job.seed, mode: job.mode, size: job.size, style: job.style, persona: opts.persona || null,
      step: opts.step, rngSeed: opts.rng, trace: !!opts.trace, bake: !!opts.bake, keepalive: !!opts.keepalive });
    let day = 1;
    while (day < opts.days + 1) {
      const n = Math.min(opts.chunk, opts.days + 1 - day);
      const r = await page.evaluate(d => AIH.advance(d), n);
      day = r.day;
      if (r.over) break;
    }
    res = await page.evaluate(() => AIH.finish());
    if (opts.coverage) cov = await page.coverage.stopJSCoverage();
  } catch (e) {
    res = res || { failed: String(e && e.stack || e).slice(0, 600) };
  } finally {
    await ctx.close().catch(() => {});
  }
  res.job = job;
  res.nodeErrors = errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e)).slice(0, 8);
  res.secs = +((Date.now() - t0) / 1000).toFixed(1);
  return { res, cov };
}

/* ---------------- coverage ---------------- */
function covInit() { return new Map(); }   // url tail -> { source, hit: Uint8Array, fns: Map(start -> {name, end, count}) }
function covAdd(agg, entries) {
  for (const e of entries || []) {
    const m = /\/js\/([a-z0-9-]+\.js)/.exec(e.url || '');
    if (!m || !e.source) continue;
    const name = m[1];
    if (!['ai.js', 'combat.js', 'units.js', 'buildings.js'].includes(name)) continue;
    let a = agg.get(name);
    if (!a) { a = { source: e.source, hit: new Uint8Array(e.source.length), fns: new Map() }; agg.set(name, a); }
    if (a.source.length !== e.source.length) continue;
    // this run's own picture first: ranges nest, the innermost count wins
    const run = new Int32Array(e.source.length).fill(-1);
    const all = [];
    for (const f of e.functions) {
      const r0 = f.ranges[0];
      if (r0 && f.functionName !== '') {
        const k = r0.startOffset, cur = a.fns.get(k);
        if (!cur) a.fns.set(k, { name: f.functionName, end: r0.endOffset, count: r0.count });
        else cur.count += r0.count;
      }
      for (const r of f.ranges) all.push(r);
    }
    all.sort((x, y) => (y.endOffset - y.startOffset) - (x.endOffset - x.startOffset));
    for (const r of all) run.fill(r.count, r.startOffset, r.endOffset);
    for (let i = 0; i < run.length; i++) if (run[i] > 0) a.hit[i] = 1;
  }
}
function covReport(agg) {
  const out = {};
  for (const [name, a] of agg) {
    const src = a.source, lineAt = [];
    { let ln = 1; for (let i = 0; i < src.length; i++) { lineAt.push(ln); if (src[i] === '\n') ln++; } }
    const fns = [...a.fns.entries()].map(([start, f]) => ({ start, end: f.end, name: f.name, count: f.count, line: lineAt[start] }))
      .sort((x, y) => x.start - y.start);
    const never = fns.filter(f => f.count === 0);
    let code = 0, hit = 0;
    for (let i = 0; i < src.length; i++) { if (/\s/.test(src[i])) continue; code++; if (a.hit[i]) hit++; }
    const rep = { functions: fns.length, neverCalled: never.map(f => ({ name: f.name, line: f.line })), charsCovered: +(hit / code).toFixed(4) };
    if (name === 'ai.js') {
      // zero-count blocks inside CALLED functions
      const inNever = new Uint8Array(src.length);
      for (const f of never) inNever.fill(1, f.start, f.end);
      const inFn = new Uint8Array(src.length);
      for (const f of fns) if (f.count > 0) inFn.fill(1, f.start, f.end);
      const blocks = [];
      let i = 0;
      while (i < src.length) {
        if (a.hit[i] || inNever[i] || !inFn[i]) { i++; continue; }
        let j = i; while (j < src.length && !a.hit[j] && !inNever[j] && inFn[j]) j++;
        const text = src.slice(i, j), solid = text.replace(/\s+/g, '').length;
        // comments are not code: a run that is only a comment is not a dead block
        const stripped = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').replace(/\s+/g, '');
        if (solid >= 40 && stripped.length >= 40) {
          const owner = fns.filter(f => f.count > 0 && f.start <= i && f.end >= j).pop();
          const firstLine = text.split('\n').map(s => s.trim()).find(s => s && !s.startsWith('//') && !s.startsWith('/*') && !s.startsWith('*')) || text.trim().split('\n')[0];
          blocks.push({ line: lineAt[i], endLine: lineAt[j - 1], chars: stripped.length, fn: owner ? owner.name : '?', first: firstLine.slice(0, 140) });
        }
        i = j;
      }
      rep.zeroBlocks = blocks;
    }
    out[name] = rep;
  }
  return out;
}

/* ---------------- the summary ---------------- */
const num = v => (typeof v === 'number' && isFinite(v)) ? v : 0;
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const median = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[(s.length - 1) >> 1]; };
const pct = (a, f) => a.length ? Math.round(100 * a.filter(f).length / a.length) : 0;
const sumObj = o => Object.values(o || {}).reduce((x, y) => x + num(y), 0);

export function summarize(runs, opts) {
  const dockDay = (opts && opts.dockday) || 120;
  const ok = runs.filter(r => r && !r.failed && r.world);
  const groups = new Map();
  for (const r of ok) {
    const k = r.world.landform + ':' + r.world.variant + ' | ' + r.world.style;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const row = (key, rs) => {
    const l3 = rs.map(r => r.growth.hallL3).filter(v => v != null);
    const wallDays = rs.reduce((n, r) => n + num(r.walls.wallDays), 0), wasted = rs.reduce((n, r) => n + num(r.walls.wastedWallDays), 0);
    return {
      key, runs: rs.length,
      trapped: +mean(rs.map(r => r.trapped.trappedUnitDays)).toFixed(1),
      sealedDays: +mean(rs.map(r => r.trapped.sealedDays)).toFixed(1),
      corkedDays: +mean(rs.map(r => r.trapped.corkedDays)).toFixed(1),
      stuck: +mean(rs.map(r => r.trapped.stuckUnitDays)).toFixed(1),
      pacing: +mean(rs.map(r => r.trapped.pacingUnitDays)).toFixed(1),
      idleArmyDays: +mean(rs.map(r => r.trapped.idleArmyDays)).toFixed(1),
      ringClosedPct: pct(rs, r => r.walls.closedDays > 0),
      wallsMean: +mean(rs.map(r => r.walls.walls)).toFixed(1),
      wastedWallShare: wallDays ? +(wasted / wallDays).toFixed(2) : null,
      dockByDayPct: pct(rs, r => r.sea.firstDockDoneDay != null && r.sea.firstDockDoneDay <= dockDay),
      dockEverPct: pct(rs, r => r.sea.firstDockDay != null),
      hulls: +mean(rs.map(r => sumObj(r.sea.hulls) - sumObj(r.sea.hullsFromStart))).toFixed(1),
      landings: +mean(rs.map(r => r.sea.landingsAbroad)).toFixed(1),
      bridges: +mean(rs.map(r => r.eng.bridgesEver)).toFixed(1),
      engines: +mean(rs.map(r => sumObj(r.war.engines))).toFixed(1),
      razes: +mean(rs.map(r => num(r.war.pRazedBy.A))).toFixed(1),
      raids: +mean(rs.map(r => r.posture.raidLaunches)).toFixed(1),
      closest: +mean(rs.map(r => r.war.closestToPHall == null ? 99 : r.war.closestToPHall)).toFixed(1),
      rivalWins: rs.filter(r => r.outcome.state === 'rival_win').length,
      playerWins: rs.filter(r => r.outcome.state === 'player_win').length,
      running: rs.filter(r => r.outcome.state === 'running').length,
      hallL3Median: median(l3), hallL3Reached: l3.length,
      foodZeroDays: +mean(rs.map(r => r.growth.foodZeroDays)).toFixed(1),
      aiDailyP95: +Math.max(0, ...rs.map(r => r.cost.aiDaily.p95)).toFixed(1),
      errors: rs.reduce((n, r) => n + num(r.errors.safeTotal) + (r.errors.page || []).length + (r.nodeErrors || []).length, 0),
      secs: +mean(rs.map(r => r.secs)).toFixed(0),
    };
  };
  const rows = [...groups.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1).map(([k, rs]) => row(k, rs));
  const total = ok.length ? row('ALL', ok) : null;
  // AI functions no run ever reached, and the decision points' totals
  const calls = {};
  for (const r of ok) for (const k in r.calls) calls[k] = (calls[k] || 0) + r.calls[k];
  const never = Object.keys(calls).filter(k => !calls[k]).sort();
  const decisions = {};
  for (const r of ok) for (const k in (r.callsByDecision || {})) decisions[k] = (decisions[k] || 0) + r.callsByDecision[k];
  const errors = {};
  for (const r of ok) for (const k in (r.errors.safe || {})) errors[k] = (errors[k] || 0) + r.errors.safe[k];
  const camps = {}, lanes = {}, postures = {}, personas = {};
  for (const r of ok) {
    for (const k in r.posture.camps) camps[k] = (camps[k] || 0) + r.posture.camps[k];
    for (const k in r.posture.raidLanes) lanes[k] = (lanes[k] || 0) + r.posture.raidLanes[k];
    for (const k in r.posture.days) postures[k] = (postures[k] || 0) + r.posture.days[k];
    if (r.rival) personas[r.rival.persona + '/' + r.rival.card] = (personas[r.rival.persona + '/' + r.rival.card] || 0) + 1;
  }
  return { dockDay, rows, total, aiFunctions: Object.keys(calls).length, neverCalled: never, decisions, calls, errors,
    campaignDays: camps, raidLanes: lanes, postureDays: postures, personas, failed: runs.filter(r => !r || r.failed).length };
}

const COLS = [
  ['key', 'world | style'], ['runs', 'n'], ['trapped', 'trapped'], ['sealedDays', 'sealed d'], ['corkedDays', 'corked d'],
  ['stuck', 'stuck'], ['pacing', 'pacing'], ['idleArmyDays', 'idle army d'], ['ringClosedPct', 'ring %'], ['wastedWallShare', 'wasted wall'],
  ['dockByDayPct', 'dock≤N %'], ['hulls', 'hulls'], ['landings', 'landings'], ['bridges', 'bridges'], ['engines', 'engines'],
  ['raids', 'raids'], ['razes', 'razes'], ['outcome', 'A/P/run'], ['hallL3Median', 'L3 day'], ['foodZeroDays', 'food0 d'], ['aiDailyP95', 'AI p95 ms'], ['errors', 'err'],
];
export function markdown(summary) {
  const cell = (r, k) => k === 'outcome' ? r.rivalWins + '/' + r.playerWins + '/' + r.running
    : k === 'hallL3Median' ? (r.hallL3Median == null ? '—' : r.hallL3Median + ' (' + r.hallL3Reached + '/' + r.runs + ')')
    : r[k] == null ? '—' : String(r[k]);
  const head = COLS.map(c => c[1].replace('N', String(summary.dockDay)));
  const lines = ['| ' + head.join(' | ') + ' |', '|' + head.map(() => '---').join('|') + '|'];
  for (const r of summary.rows.concat(summary.total ? [summary.total] : [])) lines.push('| ' + COLS.map(c => cell(r, c[0])).join(' | ') + ' |');
  lines.push('');
  lines.push('per-run means. trapped = unit-days a rival unit was pocketed, embedded or walled out by its own works; sealed/corked/idle-army = days; stuck/pacing = soldier unit-days; ' +
    'ring % = runs whose ring ever closed; wasted wall = wall-days with no outside to face / wall-days; hulls = trained (start gifts excluded); ' +
    'A/P/run = rival wins / player wins / still running; L3 day = median (runs that reached it).');
  return lines.join('\n');
}

export function compare(a, b) {
  const A = new Map(a.summary.rows.concat(a.summary.total ? [a.summary.total] : []).map(r => [r.key, r]));
  const B = new Map(b.summary.rows.concat(b.summary.total ? [b.summary.total] : []).map(r => [r.key, r]));
  const keys = ['trapped', 'sealedDays', 'corkedDays', 'stuck', 'pacing', 'idleArmyDays', 'ringClosedPct', 'wastedWallShare', 'dockByDayPct', 'hulls',
    'landings', 'bridges', 'engines', 'raids', 'razes', 'rivalWins', 'playerWins', 'hallL3Median', 'foodZeroDays', 'aiDailyP95', 'errors'];
  const lines = ['| world | style | ' + keys.join(' | ') + ' |', '|' + new Array(keys.length + 1).fill('---').join('|') + '|'];
  const f = v => v == null ? '—' : String(v);
  for (const k of [...new Set([...A.keys(), ...B.keys()])].sort()) {
    const x = A.get(k), y = B.get(k);
    lines.push('| ' + k + ' | ' + keys.map(m => {
      const p = x ? x[m] : null, q = y ? y[m] : null;
      if (p == null && q == null) return '—';
      const d = (typeof p === 'number' && typeof q === 'number') ? q - p : null;
      return f(p) + ' → ' + f(q) + (d ? ' (' + (d > 0 ? '+' : '') + (+d.toFixed(2)) + ')' : '');
    }).join(' | ') + ' |');
  }
  const na = new Set(a.summary.neverCalled || []), nb = new Set(b.summary.neverCalled || []);
  lines.push('', 'AI functions never called: ' + na.size + ' → ' + nb.size,
    '  now reached: ' + ([...na].filter(k => !nb.has(k)).join(', ') || '—'),
    '  no longer reached: ' + ([...nb].filter(k => !na.has(k)).join(', ') || '—'));
  return lines.join('\n');
}

/* ---------------- the matrix ---------------- */
function gitSha() {
  try {
    const sha = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim();
    const dirty = execSync('git status --porcelain js', { cwd: ROOT }).toString().trim() ? '-dirty' : '';
    return sha + dirty;
  } catch { return 'unknown'; }
}

export async function runMatrix(input) {
  const opts = Object.assign(parseArgs([]), input || {});
  const log = opts.quiet ? () => {} : (s => console.log(s));
  const pw = await playwright();
  const launch = () => pw.chromium.launch({ args: ['--allow-file-access-from-files',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });

  // the tables, and the seeds, from the game itself
  const b0 = await launch();
  const p0 = await openPage(b0, { art: false });
  const tables = await p0.page.evaluate(() => AIH.tables());
  let worlds = [];
  for (const w of (opts.worlds === 'all' ? tables.worlds : list(opts.worlds))) {
    if (w.includes(':')) worlds.push(w);
    else worlds.push(...tables.worlds.filter(x => x.startsWith(w + ':')));
  }
  worlds = [...new Set(worlds)];
  const bad = worlds.filter(w => !tables.worlds.includes(w));
  const modes = list(opts.modes), sizes = list(opts.sizes), styles = list(opts.styles);
  for (const m of modes) if (!tables.modes.includes(m)) bad.push('mode ' + m);
  for (const s of sizes) if (!tables.sizes.includes(s)) bad.push('size ' + s);
  for (const s of styles) if (!['passive', 'turtle', 'aggressive'].includes(s)) bad.push('style ' + s);
  if (bad.length) { await b0.close(); throw new Error('not in the game\'s tables: ' + bad.join(', ') + '\nworlds: ' + tables.worlds.join(' ')); }
  const seeds = await p0.page.evaluate(o => AIH.findSeeds(o), { worlds, sizes, modes, n: opts.seeds, base: opts.base, geo: opts.geo, cap: opts.geo === 'any' ? 6000 : 1500 });
  await b0.close();

  const jobs = [];
  for (const size of sizes) for (const mode of modes) for (const world of worlds) {
    const got = seeds[size + '|' + mode + '|' + world] || [];
    if (got.length < opts.seeds) log('!! only ' + got.length + ' seed(s) found for ' + world + ' ' + size + ' ' + mode);
    for (const seed of got) for (const style of styles) jobs.push({ world, size, mode, seed, style });
  }
  jobs.forEach((j, i) => { j.id = i + 1; });
  if (opts.list) return { tables, seeds, jobs };

  const meta = { label: opts.label || '', date: opts.date || new Date().toISOString(), git: gitSha(),
    args: { days: opts.days, seeds: opts.seeds, worlds, modes, styles, sizes, persona: opts.persona, lanes: opts.lanes, base: opts.base,
      step: opts.step, rng: opts.rng, coverage: !!opts.coverage, trace: !!opts.trace, art: !!opts.art, bake: !!opts.bake, keepalive: !!opts.keepalive, geo: opts.geo, dockday: opts.dockday },
    tables: { worlds: tables.worlds.length, modes: tables.modes, sizes: tables.sizes, buildings: tables.buildings.length,
      units: tables.units.length, aiFunctions: tables.aiFunctions, dayMs: tables.dayMs }, cpus: os.cpus().length };
  log('ai-harness: ' + jobs.length + ' runs (' + worlds.length + ' worlds x ' + sizes.length + ' sizes x ' + modes.length + ' modes x ' +
    opts.seeds + ' seeds x ' + styles.length + ' styles), ' + opts.days + ' days, ' + opts.lanes + ' lanes, git ' + meta.git);

  const runs = new Array(jobs.length), agg = covInit();
  let next = 0, done = 0;
  const t0 = Date.now();
  const lane = async () => {
    const browser = await launch();
    try {
      while (next < jobs.length) {
        const i = next++, job = jobs[i];
        let out;
        try { out = await runOne(browser, job, opts); }
        catch (e) { out = { res: { failed: String(e && e.stack || e).slice(0, 600), job } }; }
        const r = out.res; runs[i] = r; done++;
        if (out.cov) covAdd(agg, out.cov);
        if (r.failed) { log('[' + done + '/' + jobs.length + '] ' + job.world + ' ' + job.size + ' ' + job.mode + ' ' + job.style + ' seed ' + job.seed + ' FAILED ' + r.failed.split('\n')[0]); continue; }
        const T = r.trapped, o = r.outcome;
        log('[' + done + '/' + jobs.length + '] ' + job.world + ' ' + job.size + ' ' + job.mode + ' ' + job.style + ' seed ' + job.seed +
          ' (' + r.rival.persona + '/' + r.rival.card + ') -> ' + o.state + (o.cause ? ':' + o.cause : '') + ' d' + o.day +
          ' | hall L' + r.growth.final.hall + ' v' + r.growth.final.villagers + ' s' + r.growth.final.soldiers + ' b' + r.growth.final.buildings +
          ' | sealed ' + T.sealedDays + ' cork ' + T.corkedDays + ' trap ' + T.trappedUnitDays + ' stuck ' + T.stuckUnitDays + ' idleA ' + T.idleArmyDays +
          ' | w' + r.walls.walls + '/g' + r.walls.gates + (r.walls.closedDays ? ' closed' : '') + ' wasted ' + r.walls.wasted +
          ' | dock ' + (r.sea.firstDockDoneDay == null ? '-' : 'd' + r.sea.firstDockDoneDay) + ' hulls ' + sumObj(r.sea.hulls) + ' land ' + r.sea.landingsAbroad +
          ' | raids ' + r.posture.raidLaunches + ' razes ' + num(r.war.pRazedBy.A) + ' eng ' + sumObj(r.war.engines) +
          ' | P b' + r.player.buildingCount + ' a' + r.player.army + ' atk' + r.player.attacks +
          ' | err ' + (num(r.errors.safeTotal) + r.errors.page.length + r.nodeErrors.length) + ' | ' + r.secs + 's');
      }
    } finally { await browser.close().catch(() => {}); }
  };
  await Promise.all(new Array(Math.max(1, Math.min(opts.lanes, jobs.length))).fill(0).map(lane));
  meta.wallSecs = +((Date.now() - t0) / 1000).toFixed(1);
  const summary = summarize(runs, opts);
  const result = { meta, runs, summary };
  if (opts.coverage) result.coverage = covReport(agg);
  return result;
}

/* ---------------- the command line ---------------- */
async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.compare) {
    const [a, b] = opts.compare.map(f => JSON.parse(readFileSync(resolve(f), 'utf8')));
    console.log('before: ' + (a.meta.label || opts.compare[0]) + ' (' + a.meta.git + ', ' + a.runs.length + ' runs)   after: ' +
      (b.meta.label || opts.compare[1]) + ' (' + b.meta.git + ', ' + b.runs.length + ' runs)\n');
    console.log(compare(a, b));
    return 0;
  }
  const out = await runMatrix(opts);
  if (opts.list) {
    console.log(JSON.stringify(out.tables, null, 1));
    for (const j of out.jobs) console.log(j.id + '\t' + j.world + '\t' + j.size + '\t' + j.mode + '\t' + j.style + '\tseed ' + j.seed);
    return 0;
  }
  const s = out.summary;
  console.log('\n## ' + (out.meta.label || 'ai-harness') + ' — ' + out.runs.length + ' runs, ' + out.meta.args.days + ' days, git ' + out.meta.git + ', ' + out.meta.wallSecs + 's wall\n');
  console.log(markdown(s));
  console.log('\nposture days: ' + JSON.stringify(s.postureDays));
  console.log('campaign days: ' + JSON.stringify(s.campaignDays) + '   raid lanes: ' + JSON.stringify(s.raidLanes));
  console.log('rival personas/cards: ' + JSON.stringify(s.personas));
  console.log('decision calls: ' + Object.entries(s.decisions).map(([k, v]) => k + ' ' + v).join(', '));
  console.log('AI functions never called in any run (' + s.neverCalled.length + '/' + s.aiFunctions + '): ' + (s.neverCalled.join(', ') || '—'));
  if (Object.keys(s.errors).length) console.log('recovered faults (G._safe): ' + JSON.stringify(s.errors, null, 1));
  if (s.failed) console.log('FAILED RUNS: ' + s.failed);
  if (out.coverage) {
    for (const [f, c] of Object.entries(out.coverage)) {
      console.log('\ncoverage js/' + f + ': ' + (100 * c.charsCovered).toFixed(1) + '% of code characters, ' + c.neverCalled.length + '/' + c.functions + ' functions never called');
      if (f === 'ai.js') {
        console.log('  never called: ' + (c.neverCalled.map(n => n.name + ':' + n.line).join(', ') || '—'));
        console.log('  zero-count blocks >= 40 chars in called functions: ' + c.zeroBlocks.length + ' (full list in the coverage file)');
        for (const b of c.zeroBlocks.slice().sort((x, y) => y.chars - x.chars).slice(0, 25)) console.log('    L' + b.line + '-' + b.endLine + ' ' + b.fn + ' (' + b.chars + ' ch): ' + b.first);
      }
    }
  }
  if (opts.out) {
    const file = resolve(opts.out);
    mkdirSync(dirname(file), { recursive: true });
    if (opts.trace) {
      for (const r of out.runs) {
        if (!r || !r.trace || !r.trace.length) continue;
        const tf = file.replace(/\.json$/, '') + '.' + r.job.id + '-' + r.job.world.replace(':', '_') + '-' + r.job.style + '.trace.txt';
        writeFileSync(tf, r.trace.join('\n') + '\n\n' + (r.asciiEnd || '') + '\n');
        r.traceFile = tf; r.trace = undefined;
      }
    }
    if (out.coverage) { writeFileSync(file.replace(/\.json$/, '') + '.coverage.json', JSON.stringify(out.coverage, null, 1)); }
    const slim = Object.assign({}, out); delete slim.coverage;
    writeFileSync(file, JSON.stringify(slim));
    console.log('\nwrote ' + file + (out.coverage ? ' (+ .coverage.json)' : '') + (opts.trace ? ' (+ .trace.txt per run)' : ''));
  } else if (opts.trace && out.runs.length === 1 && out.runs[0].trace) {
    console.log('\n' + out.runs[0].trace.join('\n') + '\n\n' + (out.runs[0].asciiEnd || ''));
  } else console.log('\n(no --out given: nothing written)');
  return (s.failed || !out.runs.length) ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(code => process.exit(code), e => { console.error(e); process.exit(2); });
}
