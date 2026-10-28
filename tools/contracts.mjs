#!/usr/bin/env node
/* CONTRACTS — the one runner for tests/*.mjs (CLAUDE.md, "TESTING AND
   RELEASING"). Every contract is judged by its EXIT CODE, never by grepping
   its output (the suites do not share a failure vocabulary).

     node tools/contracts.mjs affected [base] [--list]
         the suites a change can break — picked from the diff against `base`
         (default origin/main, working tree included) — plus the SMOKE set,
         and runs them (--list only prints them). Minutes, not an hour.
     node tools/contracts.mjs all [--lanes N]
         every suite, N at a time (default 2) — the full sweep, locally
     node tools/contracts.mjs shard I N
         shard I of N, balanced by tools/contract-times.json — what the
         GitHub Actions run (.github/workflows/contracts.yml) calls
     node tools/contracts.mjs run a.mjs b.mjs …
         the named suites

   Options: --lanes N (parallel suites), --logs DIR (keep every log there).

   A SUITE THAT FAILS IS RUN ONCE MORE, ALONE, before it counts as red: the
   wall-clock checks (land.mjs's repaint ratios, deck-ui's 1.2 s budget) are
   measurements, and CLAUDE.md's standing rule is to rerun a perf failure on
   a quiet machine before believing it. One that passes alone is reported as
   FLAKY, never silently green, so a check that keeps flaking gets seen.

   HOW `affected` PICKS. Every game script is a classic script that hangs
   one or more globals on the page (ai.js → AI, buildings.js → Bld, …), and
   every contract boots the whole game, so "which test imports this file" has
   no answer. Instead, for each changed js/ file the picker finds the MEMBERS
   the diff touches (the method or config key each changed line sits in) and
   takes every suite that names one of them — `AI.maybeWonder`, `G.loadJSON`,
   `CFG.CARDS`. A change outside any member falls back to every suite that
   uses the file's globals at all, which for game.js and config.js is nearly
   all of them: those ARE the core. Other paths go by the table in PATHS;
   a changed suite runs itself; docs alone run nothing. It is a fast first
   answer, never the last one — the full sweep in CI is what guards main. */
import { readdirSync, readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TESTS = join(root, 'tests');
const ALL = readdirSync(TESTS).filter(f => f.endsWith('.mjs')).sort();
const src = Object.fromEntries(ALL.map(f => [f, readFileSync(join(TESTS, f), 'utf8')]));

// fast, and between them they boot the game, take a tap, place a building
// and check the version/patch-note rule every push to main must keep
const SMOKE = ['boot.mjs', 'tap-audit.mjs', 'placement.mjs', 'patch-notes.mjs'];

// non-script paths → the suites that read them
const PATHS = [
  [/^index\.html$/, ['boot.mjs', 'title.mjs', 'desktop-layout.mjs', 'settings.mjs', 'card-intro.mjs', 'calm-peace.mjs', 'art-pipeline.mjs']],
  [/^analytics\.html$/, ['analytics.mjs', 'telemetry.mjs']],
  [/^supabase\//, ['analytics.mjs', 'telemetry.mjs', 'deck-sync.mjs', 'deck-core.mjs']],
  [/^assets\/ui\//, ['boot.mjs', 'title.mjs', 'settings.mjs', 'art-pipeline.mjs']],
  [/^assets\/cards\//, ['deck-ui.mjs', 'deck-screens.mjs', 'card-intro.mjs', 'art-pipeline.mjs']],
  [/^assets\/endgame\//, ['deck-screens.mjs', 'art-pipeline.mjs']],
  [/^assets\//, ['art-pipeline.mjs', 'animal-art.mjs', 'build-stages.mjs', 'fort-states.mjs', 'land.mjs', 'mountain.mjs']],
  [/^tools\//, ['patch-notes.mjs']],
  [/^\.github\//, []],
];
const DOCS = /(\.md|\.txt)$/i;

// the globals each game script defines (the scripts that define none — the
// deck's effect groups — are tested by the suite named after them)
const fileGlobals = (s) => {
  const out = new Set();
  for (const m of s.matchAll(/^(?:const|var|let)\s+([A-Z][A-Za-z0-9_]*)\s*=|^window\.([A-Z][A-Za-z0-9_]*)\s*=/gm)) out.add(m[1] || m[2]);
  return [...out];
};
const NO_GLOBALS = { 'js/deckfx.js': ['deck-fx.mjs'], 'js/deckfx-army.js': ['deck-army.mjs'],
  'js/deckfx-growth.js': ['deck-growth.mjs'], 'js/deckfx-rival.js': ['deck-rival.mjs'],
  'js/deckfx-town.js': ['deck-town.mjs'], 'js/dev.js': ['art-pipeline.mjs'] };

// the member each changed line sits in: the nearest method or key above it
// at the object literal's own indentation (two spaces — the house style)
const memberAt = (lines, i) => {
  for (let k = i; k >= 0; k--) {
    const l = lines[k];
    let m = l.match(/^ {2}(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/) || l.match(/^ {2}([A-Za-z_$][\w$]*)\s*:/);
    if (m) return m[1];
    if (/^\S/.test(l) && k < i) return null;   // left the object literal: top-level code
  }
  return null;
};

const sh = (args) => { try { return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 }); } catch (e) { return ''; } };

// `base` against the working tree, or a commit range `A..B` (B's own files)
function affected(base) {
  const [A, B] = base.includes('..') ? base.split('..') : [base, null];
  const range = B ? [A, B] : [A];
  const names = sh(['diff', '--name-only', ...range]).split('\n').filter(Boolean);
  // a new file nobody has added yet is a change too (the working tree only)
  if (!B) for (const n of sh(['ls-files', '--others', '--exclude-standard']).split('\n')) if (n && !names.includes(n)) names.push(n);
  const read = (n) => B ? sh(['show', B + ':' + n]) : readFileSync(join(root, n), 'utf8');
  const exists = (n) => B ? sh(['cat-file', '-e', B + ':' + n]) !== '' || sh(['ls-tree', B, '--', n]) !== '' : existsSync(join(root, n));
  const picked = new Set(), why = {};
  const take = (f, reason) => { if (src[f] != null && !picked.has(f)) { picked.add(f); why[f] = reason; } };
  const code = names.filter(n => !DOCS.test(n));
  if (!code.length) return { names, picked: [], why, docsOnly: true };
  for (const f of SMOKE) take(f, 'smoke');
  for (const n of code) {
    if (n.startsWith('tests/') && n.endsWith('.mjs')) { take(basename(n), 'changed'); continue; }
    if (/^js\/.+\.js$/.test(n) && exists(n)) {
      const globals = fileGlobals(read(n));
      if (!globals.length) { for (const f of NO_GLOBALS[n] || []) take(f, n); continue; }
      // the changed lines of this file, in the new version
      const lines = read(n).split('\n');
      const members = new Set();
      let topLevel = false;
      for (const h of sh(['diff', '-U0', ...range, '--', n]).matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
        const start = +h[1] - 1, len = h[2] == null ? 1 : +h[2];
        for (let i = start; i < start + Math.max(1, len); i++) {
          const m = memberAt(lines, Math.min(i, lines.length - 1));
          if (m) members.add(m); else topLevel = true;
        }
      }
      let hit = false;
      for (const f of ALL) {
        const s = src[f];
        for (const g of globals) for (const m of members) {
          if (s.includes(g + '.' + m)) { take(f, n + ' ' + g + '.' + m); hit = true; }
        }
      }
      // outside any member, or a member nobody names: every suite of the file's globals
      if (topLevel || !hit) for (const f of ALL) {
        if (globals.some(g => new RegExp('\\b' + g + '\\.').test(src[f]))) take(f, n + (topLevel ? ' (top level)' : ' (globals)'));
      }
      continue;
    }
    for (const [re, list] of PATHS) if (re.test(n)) { for (const f of list) take(f, n); break; }
  }
  return { names, picked: [...picked].sort(), why };
}

// ---------------------------------------------------------------- running
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const LOGS = arg('--logs', join(tmpdir(), 'clanfire-contracts', String(Date.now())));
mkdirSync(LOGS, { recursive: true });

const runOne = (f) => new Promise(res => {
  const t0 = Date.now();
  const p = spawn(process.execPath, [join('tests', f)], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  p.stdout.on('data', d => { log += d; }); p.stderr.on('data', d => { log += d; });
  const kill = setTimeout(() => { log += '\n[contracts] TIMED OUT after 30 minutes'; p.kill('SIGKILL'); }, 30 * 60 * 1000);
  p.on('close', code => {
    clearTimeout(kill);
    writeFileSync(join(LOGS, f + '.log'), log);
    res({ f, ok: code === 0, s: Math.round((Date.now() - t0) / 1000) });
  });
});

async function runAll(list, lanes) {
  const out = [], queue = list.slice();
  const lane = async () => { while (queue.length) { const f = queue.shift(); const r = await runOne(f); out.push(r); console.log((r.ok ? 'PASS ' : 'FAIL ') + f + ' ' + r.s + 's'); } };
  await Promise.all(Array.from({ length: Math.max(1, lanes) }, lane));
  // the rerun-alone rule: a failure is measured again with the machine to itself
  const red = out.filter(r => !r.ok);
  for (const r of red) {
    const again = await runOne(r.f);
    r.rerun = again.ok;
    console.log((again.ok ? 'FLAKY ' : 'FAIL ') + r.f + (again.ok ? ' (failed in the crowd, passed alone)' : ' (failed again, alone)'));
  }
  const failed = out.filter(r => !r.ok && !r.rerun), flaky = out.filter(r => !r.ok && r.rerun);
  console.log(`\n${out.length - failed.length - flaky.length} passed, ${flaky.length} flaky, ${failed.length} failed — logs in ${LOGS}`);
  if (flaky.length) console.log('FLAKY: ' + flaky.map(r => r.f).join(', '));
  if (failed.length) console.log('FAILED: ' + failed.map(r => r.f).join(', '));
  return failed.length ? 1 : 0;
}

// shard I of N: longest-first into the lightest shard, by the measured times
function shard(i, n) {
  let times = {};
  try { times = JSON.parse(readFileSync(join(root, 'tools/contract-times.json'), 'utf8')); } catch (e) {}
  const t = f => times[f] || 30;
  const bins = Array.from({ length: n }, () => ({ s: 0, list: [] }));
  for (const f of ALL.slice().sort((a, b) => t(b) - t(a) || a.localeCompare(b))) {
    const b = bins.reduce((x, y) => (y.s < x.s ? y : x));
    b.list.push(f); b.s += t(f);
  }
  return bins[i - 1].list.sort();
}

const VALUED = new Set(['--lanes', '--logs']);   // the flags that take a value
const [cmd, ...rest] = process.argv.slice(2).filter((a, k, all) => !(a.startsWith('--') || (k > 0 && VALUED.has(all[k - 1]))));
const lanes = +arg('--lanes', 2);
let code = 0;
if (cmd === 'affected') {
  const base = rest[0] || 'origin/main';
  const r = affected(base);
  if (r.docsOnly) { console.log('Only docs changed against ' + base + ' — nothing to run.'); process.exit(0); }
  console.log(`${r.picked.length} of ${ALL.length} suites for ${r.names.length} changed file(s) against ${base}:`);
  for (const f of r.picked) console.log('  ' + f.padEnd(28) + ' ← ' + r.why[f]);
  if (r.picked.length > ALL.length * 0.6) console.log('This change reaches the core — the full sweep (CI) is the real answer.');
  if (!process.argv.includes('--list')) code = await runAll(r.picked, lanes);
} else if (cmd === 'all') {
  code = await runAll(ALL, lanes);
} else if (cmd === 'shard') {
  const [i, n] = rest.map(Number);
  if (!(i >= 1 && i <= n)) { console.log('usage: contracts.mjs shard I N'); process.exit(2); }
  const list = shard(i, n);
  console.log(`shard ${i} of ${n}: ${list.join(' ')}`);
  code = await runAll(list, lanes);
} else if (cmd === 'run') {
  const list = rest.map(f => basename(f).endsWith('.mjs') ? basename(f) : basename(f) + '.mjs').filter(f => src[f] != null);
  code = await runAll(list, lanes);
} else {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n/, ''));
  code = 2;
}
process.exit(code);
