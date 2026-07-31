/* ORE IS FINITE CONTRACT — what grows back, and what never does.

   LIVING land recovers. A felled forest (STUMPS) grows back to FOREST and
   spent orchard/berry soil (BARREN) recovers to FERTILE, both at a lean
   CFG.REGROW_FRACTION stock, so a starved player can always grind wood and
   food back — just slowly.

   ORE DOES NOT. A quarried seam (PEBBLES) is gone for good: the scar stays
   on the map forever, which makes STONE the one genuinely finite resource
   and leaves the late game leaning on the Trading Post for it.

   CFG.REGROW_TO is the single source of truth — G.scheduleRevert refuses to
   even schedule a tile that isn't on it (ruins excepted: rubble fading to
   grass is cleanup, not regrowth), and G.dayTick turns back only what is.
   The rule is invisible for 120+ in-game days, so it can only be caught
   here, never by playing.

   Run this after touching any of:
     config.js — REGROW_TO / REGROW_MULT / DEPLETED / RUIN_DECAY_DAYS
     game.js — scheduleRevert, the decay block in dayTick

     node tests/ore-finite.mjs      # exits non-zero on any regression */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const b = await pw.chromium.launch();
const p = await b.newPage({ viewport: { width: 430, height: 880 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await p.goto('file://' + join(root, 'index.html'), { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(900);

const out = await p.evaluate(() => {
  const res = {}, fails = [];
  const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };
  const idx = MapGen.idx;

  // ---- 1. the table itself: living things only ----
  {
    const T2 = CFG.REGROW_TO;
    ck('regrowTableIsLivingThingsOnly',
      T2[T.STUMPS] === T.FOREST && T2[T.BARREN] === T.FERTILE &&
      T2[T.PEBBLES] === undefined && Object.keys(T2).length === 2,
      'STUMPS→FOREST, BARREN→FERTILE, and nothing else');
    // the depleted table still turns worked-out hills into pebbles — the two
    // tables together are what make ore one-way
    ck('minedHillsBecomePebblesAndStopThere',
      CFG.DEPLETED[T.HILLS] === T.PEBBLES && !CFG.REGROW_TO[T.PEBBLES], '');
    ck('noRegrowClockForOre', CFG.REGROW_MULT[T.PEBBLES] === undefined, '');
  }

  // ---- 2. scheduling: ore is never even put on the clock ----
  {
    G.newGame('ore-a', 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    const spend = (x, y, t) => { S.map.terrain[idx(x, y)] = t; S.map.resAmount[idx(x, y)] = 0; G.scheduleRevert(idx(x, y)); };
    spend(20, 20, T.PEBBLES); spend(21, 20, T.STUMPS); spend(22, 20, T.BARREN); spend(23, 20, T.RUIN);
    ck('oreIsNeverScheduled', S.map.decay[idx(20, 20)] === undefined, '');
    ck('woodSoilAndRuinsAreScheduled',
      S.map.decay[idx(21, 20)] !== undefined && S.map.decay[idx(22, 20)] !== undefined &&
      S.map.decay[idx(23, 20)] !== undefined, '');

    // ---- 3. and after a long time, ore is still a scar ----
    for (let i = 0; i < 400; i++) G.dayTick();
    ck('oreNeverComesBack', S.map.terrain[idx(20, 20)] === T.PEBBLES, 'still PEBBLES after 400 days');
    ck('forestStillGrowsBack', S.map.terrain[idx(21, 20)] === T.FOREST, '');
    ck('orchardSoilStillRecovers', S.map.terrain[idx(22, 20)] === T.FERTILE, '');
    ck('ruinsStillFadeToGrass', S.map.terrain[idx(23, 20)] === T.GRASS, '');
    // what does grow back comes back LEAN, not full
    const fresh = CFG.RES_AMOUNT[T.FOREST];
    const got = S.map.resAmount[idx(21, 20)];
    ck('regrowthIsStillLean', got > 0 && got < fresh[1],
      got + ' vs a fresh ' + fresh[0] + '–' + fresh[1]);
  }

  // ---- 4. legacy saves: an old pending ore entry must not fire ----
  {
    G.newGame('ore-b', 'moderate', 'large'); S.paused = true;
    S.map.terrain[idx(25, 25)] = T.PEBBLES;
    S.map.decay[idx(25, 25)] = S.day + 1;        // written by a build that still regrew ore
    G.dayTick(); G.dayTick();
    ck('legacyOreEntryIsDroppedNotHonoured',
      S.map.terrain[idx(25, 25)] === T.PEBBLES && S.map.decay[idx(25, 25)] === undefined,
      'the scar stays and the stale entry is cleared');
  }

  return { res, fails };
});
console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL ORE-FINITE CHECKS PASS');
console.log('errors:', errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e)));
await b.close();
process.exit(out.fails.length ? 1 : 0);
