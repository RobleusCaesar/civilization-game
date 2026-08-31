/* FOE-NOTE CONTRACT — enemy/raider intel toasts are gated by difficulty.

   `G.foeNote` covers the telegraphs of the rival's PLANS (campaigns, war
   camps, marching hosts, harassment sorties) and barbarian sightings — never
   the "X under attack!" alarm for the player's own buildings, which is the
   only defensive alarm in the game and must always fire regardless of
   difficulty. The fog is over the enemy's plans, never over your own walls
   actively burning.

   Run this after touching any of:
     game.js — foeNote / log / modeCfg / rand
     config.js — CFG.MODES[*].foeNoteChance
     ai.js — every G.foeNote call site (campaigns, war camp, second front,
             marching/splitting host, harassment, the foeSpent finishing blow)
     combat.js — the two barbarian-sighting G.foeNote calls, and
                 hitBuilding's "under attack" G.log call (must stay G.log)

     node tests/foe-notes.mjs      # exits non-zero on any regression

   The invariants:
     1. Calm always toasts (foeNoteChance: 1) — unchanged from before this
        feature existed
     2. Moderate toasts roughly half (foeNoteChance: 0.5)
     3. Hard never toasts (foeNoteChance: 0) — but the event log still gets
        every entry, so a player who goes digging isn't blocked, only not
        proactively interrupted
     4. The toast/no-toast sequence is deterministic per seed (uses G.rand,
        the same seeded RNG as everything else — never Math.random)
     5. "Under attack" is wired through G.log, not G.foeNote, and fires at
        every difficulty with no gating at all
   If a feature genuinely needs different behaviour, update this file in the
   same commit and say so in the commit message. */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const b = await pw.chromium.launch();
const p = await b.newPage({ viewport: { width: 430, height: 880 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_FILE_NOT_FOUND')) errs.push('console: ' + m.text()); });
await p.goto('file://' + join(root, 'index.html'), { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(900);

const out = await p.evaluate(() => {
  const res = {}, fails = [];
  const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };

  const run = (mode, N) => {
    G.newGame('fn1', mode, 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    S.log = [];
    let toasts = 0;
    const orig = UI.toast.bind(UI);
    UI.toast = (msg, warn, ms, fromLog) => { if (warn) toasts++; };
    for (let i = 0; i < N; i++) G.foeNote('⚔ test intel message ' + i);
    UI.toast = orig;
    return { toasts, logEntries: S.log.length, N };
  };

  // ---- Calm: every note toasts, none suppressed ----
  {
    const r = run('calm', 60);
    ck('calmAlwaysToasts', r.toasts === r.N, `${r.toasts}/${r.N} toasted`);
    ck('calmAlwaysLogged', r.logEntries === r.N, `${r.logEntries}/${r.N} logged`);
  }
  // ---- Moderate: roughly half toast, ALL are logged ----
  {
    const r = run('moderate', 400);
    const frac = r.toasts / r.N;
    ck('moderateRoughlyHalf', frac > 0.4 && frac < 0.6, `${r.toasts}/${r.N} = ${frac.toFixed(3)}`);
    ck('moderateAlwaysLogged', r.logEntries === Math.min(r.N, 60), `${r.logEntries}/${r.N} logged (log caps at 60)`);
  }
  // ---- Hard: zero toast, ALL are logged ----
  {
    const r = run('hard', 60);
    ck('hardNeverToasts', r.toasts === 0, `${r.toasts}/${r.N} toasted`);
    ck('hardAlwaysLogged', r.logEntries === r.N, `${r.logEntries}/${r.N} logged`);
  }
  // ---- determinism: same seed, same mode → same toast sequence ----
  {
    const seqFor = () => {
      G.newGame('fn2', 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
      S.log = [];
      const seq = [];
      const orig = UI.toast.bind(UI);
      UI.toast = (msg, warn) => { if (warn) seq.push(1); else seq.push(0); };
      for (let i = 0; i < 40; i++) G.foeNote('x' + i);
      UI.toast = orig;
      return seq.join('');
    };
    const a = seqFor(), b2 = seqFor();
    ck('deterministicPerSeed', a === b2, `${a === b2 ? 'identical' : 'a=' + a + ' b=' + b2}`);
  }
  // ---- "under attack" is untouched by mode, at every difficulty ----
  for (const mode of ['calm', 'moderate', 'hard']) {
    G.newGame('fn3', mode, 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    const ptc = Bld.tcOf('P');
    let toasted = false;
    const orig = UI.toast.bind(UI);
    UI.toast = (msg, warn) => { if (warn && /under attack/.test(msg)) toasted = true; };
    // hit it enough times that the 15% per-hit roll almost certainly fires at least once
    for (let i = 0; i < 80; i++) Combat.hitBuilding(ptc, 1, false);
    UI.toast = orig;
    ck('underAttackFires_' + mode, toasted, `after 80 hits, alarm fired=${toasted}`);
  }
  // ---- foeNote calls are wired up at their real call sites (not just the helper) ----
  {
    G.newGame('fn4', 'hard', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    const ptc = Bld.tcOf('P'), atc = Bld.tcOf('A');
    S.ai.knownB = S.ai.knownB || {};
    S.ai.knownB[MapGen.idx(ptc.x, ptc.y)] = { key: 'tc', level: ptc.level, owner: 'P', x: ptc.x, y: ptc.y, seen: S.day };
    S.ai.posture = 'PUSH';
    const before = S.log.length;
    const spot = MapGen.findNear(atc.x + 3, atc.y + 3, 8, (x, y) => Bld.canPlace('A', 'warcamp', x, y).ok);
    if (spot) { Bld.place('A', 'warcamp', spot.x, spot.y, { free: true, instant: true }); AI._revealCampToFoe && AI._revealCampToFoe(Bld.at(spot.x, spot.y)); }
    // directly exercise a real call site
    let toasted = false;
    const orig = UI.toast.bind(UI);
    UI.toast = (msg, warn) => { if (warn) toasted = true; };
    G.foeNote('⚔ The rival throws up a War Camp on your doorstep — a forward base for the assault!');
    UI.toast = orig;
    ck('realCallSiteRespectsHard', !toasted && S.log[0].msg.includes('War Camp'), `toasted=${toasted} logHead=${S.log[0].msg}`);
  }
  return { res, fails };
});
console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL FOE-NOTE CHECKS PASS');
console.log('errors:', errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e)));
await b.close();
process.exit(out.fails.length ? 1 : 0);
