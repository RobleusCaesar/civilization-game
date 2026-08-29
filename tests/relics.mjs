/* WILDERNESS RELICS CONTRACT (js/relics.js) — one hidden antiquity per map,
   found by exploring, purely additive:

   1. THE MAP IS UNTOUCHED: tile data is bit-identical with relics on and
      off, and placement itself writes nothing — pinned the same way the
      formation tracer is.
   2. DETERMINISTIC: the same seed hides the same relic in the same place,
      and placement draws NOTHING from the run's RNG (cards deal the same).
   3. DISCOVERY grants exactly once — rolled in the reward table's range
      (gold on its own smaller scale), granted at the first honest fog
      reveal, never under the dev x-ray (G.freeVis), never in the title
      demo, and never again after a save/reload round-trip.
   4. THE AI IS BLIND: its world-model reads (land reach, assault probe) are
      identical with the relic present and absent.
   5. MANNERS: deep wilderness, off the edge margin, never on or beside a
      resource node, base terrain per def.
   6. A 404 falls back to the procedural placeholder; the relic draws only
      once explored, and marks the minimap only once found.

   Run after touching js/relics.js, G.newGame's relic call, the
   updateVisibility discovery hook, Assets.setRelicArt, or the ?dev=1
   relic routing.

     node tests/relics.mjs      # exits non-zero on any regression */
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

  // ---- 1. the map is untouched ----
  {
    Screens._demo = false;
    G.newGame('rq1', 'moderate', 'large');
    const withRelic = S.map.terrain.slice();
    const cardsWith = JSON.stringify(S.draft && S.draft.player && S.draft.player.cards);
    Relics.MAX_PER_MAP = 0;
    G.newGame('rq1', 'moderate', 'large');
    const withoutRelic = S.map.terrain.slice();
    const cardsWithout = JSON.stringify(S.draft && S.draft.player && S.draft.player.cards);
    Relics.MAX_PER_MAP = 1;
    let same = withRelic.length === withoutRelic.length;
    for (let i = 0; same && i < withRelic.length; i++) if (withRelic[i] !== withoutRelic[i]) same = false;
    ck('tileDataIsBitIdenticalOnAndOff', same, withRelic.length + ' tiles compared');
    ck('andNoRelicExistsWhenTunedOff', true, '');   // (asserted properly below — MAX 0 leaves S.relic null)
    ck('theRunsOwnRngIsUntouched', cardsWith === cardsWithout,
      'the card deal is the canary for a stray draw');
    // placement itself writes nothing: re-run it on the standing map
    const before = S.map.terrain.slice();
    Relics.place();
    let same2 = true;
    for (let i = 0; i < before.length; i++) if (before[i] !== S.map.terrain[i]) { same2 = false; break; }
    ck('placementWritesNothing', same2, '');
  }

  // ---- 2. deterministic from the seed ----
  {
    G.newGame('rq2', 'moderate', 'large');
    const a = S.relic && `${S.relic.key}@${S.relic.x},${S.relic.y}`;
    G.newGame('rq2', 'moderate', 'large');
    const b2 = S.relic && `${S.relic.key}@${S.relic.x},${S.relic.y}`;
    ck('theSameSeedHidesTheSameRelic', !!a && a === b2, a || 'no relic on rq2');
    Relics.MAX_PER_MAP = 0;
    G.newGame('rq2', 'moderate', 'large');
    ck('tunedToZeroPlacesNothing', S.relic === null, '');
    Relics.MAX_PER_MAP = 1;
  }

  // ---- 3. discovery: once, in range, honest, persistent ----
  {
    // find a seed whose relic pays GOLD too, so both scales are exercised
    let goldSeed = null;
    for (let i = 0; i < 40 && !goldSeed; i++) {
      G.newGame('rg' + i, 'moderate', 'large');
      if (S.relic && Relics.DEFS[S.relic.key].res === 'gold') goldSeed = 'rg' + i;
    }
    G.newGame('rq3', 'moderate', 'large');
    Screens._demo = false; Screens.show('playing'); S.paused = true;
    // finish the draft the way a real game does — an unfinished one is
    // auto-resolved by loadJSON (Cards.pick applies the origin's own grant),
    // which would read as a phantom resource jump across the reload below
    if (S.draft && !S.draft.done && window.Cards) Cards.pick(0);
    const r = S.relic;
    ck('aRelicToFind', !!r, r ? r.key : 'rq3 rolled none — pick another seed');
    const def = Relics.DEFS[r.key], range = Relics.REWARD[def.res];
    // the dev x-ray is not exploration
    G.freeVis = true; G.updateVisibility();
    ck('theXRayFindsNothing', !r.found, '');
    G.freeVis = false;
    // …an honest reveal is
    const u = S.units.find(z => z.owner === 'P' && Units.isVillager(z));
    u.x = r.x + 0.5; u.y = r.y + 0.5; u.task = null; u.path = null;
    const before = S.res[def.res];
    G.updateVisibility();
    ck('theFirstRevealGrantsOnce', r.found > 0 && S.res[def.res] === before + r.amount,
      `+${r.amount} ${def.res}`);
    ck('theRollLandsInItsRange', r.amount >= range[0] && r.amount <= range[1],
      `${r.amount} in [${range[0]}, ${range[1]}]`);
    ck('goldKeepsItsOwnSmallerScale',
      Relics.REWARD.gold[1] < Relics.REWARD.stone[0] + Relics.REWARD.stone[1] - Relics.REWARD.gold[1] &&
      Relics.REWARD.gold[0] === 20 && Relics.REWARD.gold[1] === 60 && Relics.REWARD.stone[1] === 150,
      `gold [${Relics.REWARD.gold}] vs stone [${Relics.REWARD.stone}]` + (goldSeed ? ` (gold relic on ${goldSeed})` : ''));
    // a second reveal pass grants nothing more
    const after = S.res[def.res];
    G.updateVisibility();
    ck('aSecondLookPaysNothing', S.res[def.res] === after, '');
    // …and neither does a reload
    const json = G.saveJSON();
    G.loadJSON(json);
    G.updateVisibility();
    ck('theFindRidesInTheSave', S.relic.found === r.found && S.relic.amount === r.amount &&
      S.res[def.res] === after, '');
    ck('andStaysTappableForever', Relics.hitAt(S.relic.x, S.relic.y) === true, '');
    ck('theChronicleNamesTheFind', S.log.some(l => l.msg.indexOf(def.name) >= 0), '');
  }

  // ---- 4. the AI is blind to it ----
  {
    G.newGame('rq3', 'moderate', 'large');
    Screens._demo = false; S.paused = true;
    // the standing test idiom: the AI knows the player's hall and is committed
    const ptc = Bld.tcOf('P');
    S.ai.knownB = S.ai.knownB || {};
    S.ai.knownB[MapGen.idx(ptc.x, ptc.y)] = { key: 'tc', level: ptc.level, owner: 'P', x: ptc.x, y: ptc.y, seen: S.day };
    S.ai.posture = 'PUSH';
    const read = AI.assess();
    const reachWith = AI.aiLandReach().slice();
    const ctxWith = JSON.stringify(AI.probeAssault(read));
    const saved = S.relic;
    S.relic = null;
    const reachWithout = AI.aiLandReach().slice();
    const ctxWithout = JSON.stringify(AI.probeAssault(read));
    S.relic = saved;
    let same = reachWith.length === reachWithout.length;
    for (let i = 0; same && i < reachWith.length; i++) if (reachWith[i] !== reachWithout[i]) same = false;
    ck('theAisGroundIsUnchanged', same, 'land reach byte-identical with and without');
    ck('theAisWarReadIsUnchanged', ctxWith === ctxWithout, '');
  }

  // ---- 5. manners, across a sweep ----
  {
    const NODE = { [T.FOREST]: 1, [T.HILLS]: 1, [T.FERTILE]: 1, [T.GOLDORE]: 1 };
    let placed = 0, none = 0, bad = '';
    const keys = {};
    for (let i = 0; i < 14; i++) {
      G.newGame('rs' + i, i % 2 ? 'hard' : 'moderate', i % 3 ? 'large' : 'xlarge');
      const r = S.relic;
      if (!r) { none++; continue; }
      placed++;
      keys[r.key] = (keys[r.key] || 0) + 1;
      const d = Relics.DEFS[r.key];
      const P0 = S.map.spawns.player, A0 = S.map.spawns.ai;
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      if (Math.hypot(cx - P0.x, cy - P0.y) < 14 || Math.hypot(cx - A0.x, cy - A0.y) < 14)
        bad = bad || `rs${i} ${r.key} on a doorstep`;
      if (r.x < 4 || r.y < 4 || r.x + r.w > CFG.W - 4 || r.y + r.h > CFG.H - 4)
        bad = bad || `rs${i} ${r.key} on the rim`;
      const baseT = d.base === 'water' ? T.WATER : T.GRASS;
      for (let dy = 0; dy < r.h; dy++) for (let dx = 0; dx < r.w; dx++)
        if (S.map.terrain[MapGen.idx(r.x + dx, r.y + dy)] !== baseT)
          bad = bad || `rs${i} ${r.key} off its ground`;
      for (let dy = -1; dy <= r.h; dy++) for (let dx = -1; dx <= r.w; dx++) {
        const nx = r.x + dx, ny = r.y + dy;
        if (MapGen.inB(nx, ny) && NODE[S.map.terrain[MapGen.idx(nx, ny)]])
          bad = bad || `rs${i} ${r.key} crowding a resource node`;
      }
    }
    const dist = Object.entries(keys).map(([k, n]) => `${k}:${n}`).join(' ');
    ck('everyPlacedRelicKeepsItsManners', bad === '', bad || `${placed} placed, ${none} maps kept their secret — ${dist}`);
    ck('mostMapsHideOne', placed >= 10, `${placed}/14`);
  }

  // ---- 6. art: the 404 placeholder, the fog gate, the minimap pip ----
  {
    G.newGame('rq3', 'moderate', 'large');
    Screens._demo = false; S.paused = true;
    const r = S.relic;
    const ph = Relics.art(r.key);
    ck('a404StandsAPlaceholderUp', ph instanceof HTMLCanvasElement && ph.width === r.w * 32,
      ph.width + 'x' + ph.height + ' procedural stand-in');
    const px = (c) => {
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 10) n++; return n;
    };
    const scratch = document.createElement('canvas');
    scratch.width = scratch.height = 256;
    const sg = scratch.getContext('2d');
    sg.translate(-r.x * CFG.TILE + 32, -r.y * CFG.TILE + 32);
    Relics.draw(sg);
    ck('unexploredGroundShowsNothing', px(scratch) === 0, 'the fog keeps its secret');
    for (let dy = 0; dy < r.h; dy++) for (let dx = 0; dx < r.w; dx++)
      S.map.explored[MapGen.idx(r.x + dx, r.y + dy)] = 1;
    Relics.draw(sg);
    ck('exploredGroundShowsTheRelic', px(scratch) > 200, px(scratch) + ' px drawn');
    // the minimap pip waits for the FIND, then stands forever
    const mini = document.createElement('canvas'); mini.width = mini.height = CFG.W * 2;
    const mg = mini.getContext('2d');
    Relics.drawMini(mg);
    ck('noPipBeforeTheFind', px(mini) === 0, '');
    r.found = 12; r.amount = 77;
    Relics.drawMini(mg);
    ck('aFoundRelicMarksTheMinimap', px(mini) > 0, '');
    // …and the ?dev=1 router knows the convention (footprint must match the def)
    const d = Relics.DEFS[r.key];
    ck('theDevRouterKnowsRelicFilenames',
      (DevArt.parseName(`relic-${d.w}x${d.h}-${r.key}-a.png`) || {}).kind === 'relic' &&
      DevArt.parseName(`relic-${d.w + 1}x${d.h}-${r.key}-a.png`) === null &&
      DevArt.parseName('relic-2x2-atlantis-a.png') === null, '');
  }

  return { res, fails };
});

for (const [k, v] of Object.entries(out.res)) console.log((v.startsWith('PASS') ? ' ' : '✗') + ' ' + k + ': ' + v);
const hard = errs.filter(e => !/supabase|fetch|TUNNEL|net::|429/.test(e));
if (hard.length) console.log('PAGE ERRORS:', hard.slice(0, 4));
await b.close();
if (out.fails.length || hard.length) { console.log('FAILURES: ' + (out.fails.join(', ') || 'pageerrors')); process.exit(1); }
console.log('ALL RELIC CHECKS PASS');
