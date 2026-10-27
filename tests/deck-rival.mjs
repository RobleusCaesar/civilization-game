/* THE CARD SYSTEM — RIVAL AND SKY (js/deckfx-rival.js): Scout's Fire,
   Pathfinder's Map, Spy in the Hall, Barbarian Pact, The Swallowed Sun and
   Kraken's Call, each measured doing exactly what its card says, and the
   hooks they ride answering exactly what the game answered before cards
   existed whenever none of them is running.

   This file pins:

     THE SWITCH        off, or on with nothing played, a week of a primed war
                       (a rival raid, a barbarian band, a catapult at a house,
                       a tower at a soldier, the AI's own sight) is
                       byte-identical with the hooks and without them — and a
                       live sun, pact and fire move it, so the probe can see
     THE CARD-LIT MAP  a card's chart is explored AND card-lit; the
                       exploration score, Bld.foreignHome and every strike's
                       "explored ground" ask for the player's OWN eyes (each
                       check runs the naive fill beside it — the mask dropped
                       — and must see the leak); real sight clears the mark;
                       the board's rim is never charted; the memory of the
                       land (seenTerrain) is never synced from the live map;
                       the mask is compact and rides the save; PLACEMENT asks
                       for eyes too (canPlace, the grid, the wall ghost) and
                       the live layers (bridges, ash, carcasses) are never
                       drawn on ground only a card charted; the world's own
                       reveal hands charted ground back
     SCOUT'S FIRE      any point, explored or not; 9 tiles charted for good; a
                       3-day watch that is real sight from the play on (the
                       sheet holds the world still, so the card runs the
                       vision pass itself); a relic in the ring is found, one
                       outside is not — and the card's find rolls its reward
                       off the run's RNG (the same relic found on foot draws
                       it, the control); a second fire lights a second hill,
                       the same fire fed again burns 3 more days; never the
                       rim
     PATHFINDER'S MAP  every tile but the relic's footprint; the relic marked
                       (map and minimap) and unfound; nothing standing shown;
                       its "when", in words
     SPY IN THE HALL   every rival building ghosted for good, through two
                       vision passes; the origin card named (and a true line
                       for a save with none); 10 days of their people seen —
                       shown, counted by the truce's question, never tappable
                       through the fog; allowed at peace; the rival's memory
                       untouched
     BARBARIAN PACT    3 charges (a second pact adds 3); each band that turns
                       marches on the rival alone and is told at every
                       difficulty; a band the wilds would spare WAITS (no
                       muster, not one draw, the charge kept) where the naive
                       flip would send it at the player; a band with no road
                       to the rival scatters, the charge spent and said; the
                       wait is capped (a wave PACT_WAIT days late runs its
                       ordinary course, charge kept); deniable at peace;
                       the bands owed wear the card's chip on the strip
     THE SWALLOWED SUN 4 days: the rival sees half as far (its own vision),
                       strikes 30% softer (unit blows AND the engines' bldAtk
                       AND the towers' arrows — the two bypasses), musters no
                       war band (a primed raid that marches without the card
                       stays home), and every rival soul not fighting stares;
                       the player's people work on; the world's eclipse is
                       never driven (the barbarians still muster); deniable
     KRAKEN'S CALL     "Needs open water"; up to 4 ships on OPEN water,
                       warships first, the world's 'answer' never asked; 600
                       to every rival building within 2 of open water, the
                       hall at most 40% (an L1 hall a naive 600 would raze),
                       never cause 'fire'; kills and razes credited, no
                       krakenSlain, no specialFired, the world's kraken
                       untouched; at war as at peace it is asked of what the
                       player knows (the refusal is never a probe of the fog,
                       the burst lands only on a known target, a known ghost
                       plays and comes up empty); the truce ends at the play;
                       the act is seen; a save mid-act finishes after the
                       load; a put-back confirm is no confirm
     THE PICTURE       every show at several p and every drawLive, through
                       the real frame, without a throw; nothing drawn and no
                       pass entered with no card in play; R.drawKraken is the
                       one kraken drawing for the world's act and the card's
                       (R.drawKrakenAct asked first where the beast art has
                       landed); one beast to a cluster
     NO RNG            no card draws from S.rngState at the play

   Run after touching: js/deckfx-rival.js, Deck.light / eyesAt / eyesKnow /
   eyesClear, G.updateVisibility's card passes, G.sightIn / eclipseAwe,
   AI.sunHush and the war section of AI.daily, AI.updateVision,
   Combat.maybeWave, Combat.bldAtkOf, the tower's arrow, Units.effAtk,
   Score.compute's exploration line, Bld.foreignHome, R.drawKraken,
   Bld.canPlace's eyes gate, UI.buildPlaceMap and the wall/trench ghosts,
   R.rememberedAt, G.reveal, G.runReport's explored line, DeckUI's confirm.

     node tests/deck-rival.mjs      # exits non-zero on any regression */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });
const ctx = await b.newContext({ viewport: { width: 430, height: 880 }, deviceScaleFactor: 3 });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_FILE_NOT_FOUND')) errs.push('console: ' + m.text()); });
await p.goto('file://' + join(root, 'index.html'), { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.Deck && window.Screens && Screens.current === 'title', null, { timeout: 120000 });

const res = {}, fails = [];
const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };

// the shared scaffolding every section builds on
await p.evaluate(() => {
  Boot.force(); Screens._demo = false;
  const IDS = ['scouts_fire', 'pathfinders_map', 'spy_hall', 'barbarian_pact', 'swallowed_sun', 'krakens_call'];
  window.__rv = {
    IDS,
    // the log lines written since `top` was the newest (the log is capped, so
    // never measured by its length)
    since(top) { const out = []; for (const l of S.log) { if (l === top) break; out.push(l); } return out; },
    // a fresh run with the switch ON and a hand of every card of the group
    fresh(seed, mode, size) {
      CFG.CARDS.ON = true;
      G.newGame(seed, mode || 'moderate', size || 'medium');
      S.paused = true;
      Deck._col = null; Deck._del(Deck.KEY);
      for (const id of IDS.concat(['starfall'])) Deck._add(id, 9);
      return S;
    },
    /* a flat world with only the two halls on it — nobody has looked at any
       of it (unless `seen`) — so every number below is measured on ground
       the test built and no seed can flatter it */
    flat(seen) {
      const W = CFG.W, N = W * CFG.H;
      for (let i = 0; i < N; i++) {
        S.map.terrain[i] = T.GRASS; S.map.seenTerrain[i] = T.GRASS;
        S.map.explored[i] = seen ? 1 : 0; S.map.resAmount[i] = 0;
      }
      S.map.seenB = {};
      S.units = []; S.buildings = S.buildings.filter(z => z.key === 'tc');
      const P = Bld.tcOf('P'), A = Bld.tcOf('A');
      P.x = 3; P.y = 3; A.x = W - 6; A.y = CFG.H - 6;
      S.relic = null;
      if (S.ai) { S.ai.knownB = {}; S.ai.seen = null; }
      Bld._block = null; G._wb = null;
      if (G.vis) G.vis.fill(0);
      return { P, A };
    },
    // open sea: every row from y0 down, edge to edge
    sea(y0) {
      for (let y = y0; y < CFG.H; y++) for (let x = 0; x < CFG.W; x++) {
        const i = MapGen.idx(x, y); S.map.terrain[i] = T.WATER; S.map.seenTerrain[i] = T.WATER;
      }
      Bld._block = null; G._wb = null;
    },
    paint(x0, y0, x1, y1, t) {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const i = MapGen.idx(x, y); S.map.terrain[i] = t; S.map.seenTerrain[i] = t;
      }
      Bld._block = null; G._wb = null;
    },
    unit(kind, owner, x, y, hp) {
      const u = Units.spawn(kind, owner, Math.floor(x), Math.floor(y));
      u.x = x; u.y = y;
      if (hp) { u.hp = u.maxhp = hp; }
      return u;
    },
    bld(owner, key, x, y, hp) {
      const bb = Bld.place(owner, key, x, y, { free: true, instant: true });
      if (hp) { bb.hp = bb.maxhp = hp; }
      Bld._block = null;
      return bb;
    },
    explored() { let n = 0; for (let i = 0; i < S.map.explored.length; i++) if (S.map.explored[i]) n++; return n; },
    mapPts() { const l = Score.compute(false).lines.find(z => z.icon === '🗺'); return l ? l.pts : 0; },
    rim() {
      let n = 0;
      for (let y = 0; y < CFG.H; y++) for (let x = 0; x < CFG.W; x++)
        if (!MapGen.onBoard(x, y) && S.map.explored[MapGen.idx(x, y)]) n++;
      return n;
    },
    // the sim, without a picture: the G.frame sim branch at a fixed step
    step(sec, dt) {
      dt = dt || 0.1;
      const n = Math.round(sec / dt);
      for (let i = 0; i < n; i++) {
        S.dayT += dt * 1000;
        while (S.dayT >= CFG.DAY_MS) { S.dayT -= CFG.DAY_MS; G.dayTick(); if (S.over) return; }
        Bld.update(dt * 1000 / CFG.DAY_MS); Units.update(dt); Combat.update(dt);
        G.krakenTick(dt); G.eclipseTick(dt);
        if (S.deck && S.deck.fx && S.deck.fx.length && window.Deck) Deck.tick();
        if (S.deck && S.deck.strike && window.Deck && Deck.strikeTick) Deck.strikeTick(dt);
        if (S.deck && S.deck.kraken && window.Deck && Deck.krakenTick) Deck.krakenTick(dt);
        G.visT = (G.visT || 0) - dt;
        if (G.visT <= 0) { G.visT = 0.35; G.updateVisibility(); }
        if (S.over) return;
      }
    },
    // a kraken risen against the rival, ticked to the end of its act
    sea_done(onTick) { let t = 0; for (let i = 0; i < 600 && S.deck.kraken; i++) { Deck.krakenTick(0.05); t += 0.05; if (onTick) onTick(t); } return t; },
    seed(n) {
      let s = n; Math.random = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
      Combat.scanT = 0; Units.herdClock = 0;
    },
    // the rival primed to march on the player (posture stubbed by the caller)
    primeRaid(n) {
      const tcA = Bld.tcOf('A'), tcP = Bld.tcOf('P');
      for (let i = 0; i < (n || 14); i++) Units.spawn('axeman', 'A', tcA.x + (i % 4), tcA.y + 3 + (i >> 2));
      S.ai.knownB = S.ai.knownB || {};
      S.ai.knownB[MapGen.idx(tcP.x, tcP.y)] = { key: 'tc', level: 1, owner: 'P', x: tcP.x, y: tcP.y, seen: S.day };
      S.ai.raidCd = 0; S.ai.harassCd = 0;
      S.wave.next = S.day + 50;
    },
  };
});

// ---------------- 0. THE SWITCH: off, or on and idle, nothing moves ----------------
{
  const r = await p.evaluate(() => {
    const out = {};
    out.off = CFG.CARDS.ON === false || true;
    const realRandom = Math.random;
    /* ONE primed week of war, run four ways: hooks reachable with the switch
       off, window.Deck gone (every hook's guard — the game as it was), the
       switch on with nothing played, and the CONTROL with a sun, a pact and
       a fire live, which must move it or the probe is blind */
    const run = (how) => {
      __rv.seed(31);
      CFG.CARDS.ON = how === 'idle' || how === 'live';
      G.newGame('rv-off', 'hard', 'medium'); S.paused = true;
      G.visT = 0; G._wb = null;
      Deck._col = null; Deck._del(Deck.KEY);
      S.day = 60;
      __rv.primeRaid(10);
      S.wave.next = S.day + 1;                       // a band musters tomorrow
      const tcP = Bld.tcOf('P'), tcA = Bld.tcOf('A');
      // the halls stand the week: a run that ENDS shows its end scene, and the
      // switch decides which scene that is (tests/deck-screens.mjs) — not a hook
      tcP.hp = tcP.maxhp = 1e6; tcA.hp = tcA.maxhp = 1e6;
      const near = (x, y) => MapGen.findNear(x, y, 8, (a, c) => Path.passable(a, c) && !Bld.at(a, c));
      // a skirmish: a catapult at a house, a tower at a soldier, blade to blade
      const h = near(tcP.x + 4, tcP.y + 4), hb = Bld.place('P', 'house', h.x, h.y, { free: true, instant: true });
      const c = near(h.x, h.y + 3); Units.spawn('catapult', 'A', c.x, c.y);
      const t = near(tcP.x - 3, tcP.y + 5), tw = Bld.place('A', 'tower', t.x, t.y, { free: true, instant: true });
      tw.level = 2; tw.hp = tw.maxhp = 950;
      Units.spawn('defender', 'P', t.x + 2, t.y);
      const d = near(tcP.x + 6, tcP.y - 2); Units.spawn('axeman', 'A', d.x, d.y); Units.spawn('defender', 'P', d.x + 1, d.y);
      Bld._block = null;
      const choose = AI.choosePosture;
      AI.choosePosture = function () { S.ai.posture = 'PUSH'; return 'PUSH'; };
      const keep = window.Deck;
      if (how === 'gone') window.Deck = undefined;
      if (how === 'idle') Deck.run();
      if (how === 'live') {
        for (const id of ['swallowed_sun', 'barbarian_pact', 'scouts_fire']) Deck._add(id, 1);
        Deck.play('swallowed_sun'); Deck.play('barbarian_pact');
        Deck.play('scouts_fire', { x: tcA.x + 0.5, y: tcA.y + 0.5 });
      }
      try { __rv.step(60, 0.1); }
      finally { window.Deck = keep; AI.choosePosture = choose; }
      const units = S.units.map(u => [u.id, u.kind, u.owner, +u.x.toFixed(3), +u.y.toFixed(3), u.hp, u.task ? u.task.type : 0]);
      const blds = S.buildings.map(z => [z.id, z.key, z.owner, Math.round(z.hp * 1000) / 1000, z.level]);
      const ex = __rv.explored();
      const fh = [];
      for (let k = -6; k <= 6; k += 3) fh.push(Bld.foreignHome('P', tcA.x + k, tcA.y + 1) ? 1 : 0);
      const aiVis = AI._vis ? Array.prototype.reduce.call(AI._vis, (a, v) => a + v, 0) : -1;
      return JSON.stringify({ units, blds, res: S.res, ai: S.ai.res, rng: S.rngState, wave: S.wave, stats: S.stats,
        ex, seenB: Object.keys(S.map.seenB).length, score: Score.compute(false).subtotal, fh, aiVis, peace: S.peace, over: !!S.over,
        v: Deck.validTarget('starfall', tcA.x + 0.5, tcA.y + 0.5) });
    };
    const off = run('off'), gone = run('gone'), idle = run('idle'), live = run('live');
    Math.random = realRandom;
    CFG.CARDS.ON = false;
    out.same = off === gone && gone === idle;
    out.seen = live !== off;
    const diff = (x, y) => { const X = JSON.parse(x), Y = JSON.parse(y); return Object.keys(X).filter(k => JSON.stringify(X[k]) !== JSON.stringify(Y[k])).join(','); };
    out.where = off === gone ? (gone === idle ? '' : 'idle differs in ' + diff(off, idle)) : 'gone differs in ' + diff(off, gone);
    out.len = off.length;
    out.raids = JSON.parse(off).units.filter(u => u[2] === 'A' && u[6] === 'raid').length;
    out.bands = JSON.parse(off).units.filter(u => u[2] === 'R').length;
    out.over = JSON.parse(off).over;
    out.refused = __rv.IDS.every(id => { Deck._add(id, 1); const ok = !Deck.play(id, { x: 10.5, y: 10.5 }).ok; return ok; });
    return out;
  });
  ck('offTheHooksChangeNothing', r.same && r.seen && r.raids > 0 && r.bands > 0 && !r.over,
    r.same ? `a primed week (${r.raids} rival raiders out, ${r.bands} barbarians) byte-identical off, gone and idle; a live sun+pact+fire moves it: ${r.seen}` : r.where);
  ck('offNothingCanBePlayed', r.refused);
}

// ---------------- 1. THE CARD-LIT MAP ----------------
{
  const r = await p.evaluate(() => {
    const out = {};
    __rv.fresh('rv-lit'); const { P, A } = __rv.flat(false);
    G.updateVisibility();
    const W = CFG.W, N = W * CFG.H;
    // the rival's worked ground nobody of ours has seen: the memory must not learn it
    const stump = MapGen.idx(A.x - 3, A.y); S.map.terrain[stump] = T.STUMPS;
    const ex0 = __rv.explored(), pts0 = __rv.mapPts(), rng = S.rngState, rim0 = __rv.rim();
    const hallAt = { x: A.x + 1, y: A.y + 1 };
    out.fh0 = Bld.foreignHome('P', A.x - 3, A.y + 1);
    out.v0 = Deck.validTarget('starfall', hallAt.x, hallAt.y);
    out.play = Deck.play('pathfinders_map');
    const ex1 = __rv.explored();
    out.charted = ex1 - ex0;
    out.lit = Deck.litCount();
    out.pts = [pts0, __rv.mapPts()];
    out.fh1 = Bld.foreignHome('P', A.x - 3, A.y + 1);
    out.v1 = Deck.validTarget('starfall', hallAt.x, hallAt.y);
    out.ground = Deck.ground(hallAt.x, hallAt.y);
    out.why = Deck.play('starfall', hallAt).why;
    out.stillHeld = Deck.count('starfall') === 9;
    out.memory = S.map.seenTerrain[stump] === T.GRASS;
    out.rim = __rv.rim() - rim0;   // (the hall's own sight reaches the rim: G.updateVisibility's inB, untouched)
    out.rng = S.rngState === rng;
    // THE NAIVE FILL — the same explored map with the card-lit mask dropped,
    // which is exactly what filling S.map.explored alone would leave
    const keep = S.deck.lit; S.deck.lit = '';
    out.naive = { pts: __rv.mapPts(), fh: Bld.foreignHome('P', A.x - 3, A.y + 1), v: Deck.validTarget('starfall', hallAt.x, hallAt.y) };
    S.deck.lit = keep;
    // the mask is compact and rides the save
    out.size = S.deck.lit.length; out.sizeMax = Math.ceil(Math.ceil(N / 8) / 3) * 4;
    G.loadJSON(G.saveJSON());
    out.saved = Deck.litCount() === out.lit && !Deck.eyesAt(hallAt.x | 0, hallAt.y | 0) && S.map.explored[MapGen.idx(hallAt.x | 0, hallAt.y | 0)] === 1;
    // REAL SIGHT CLEARS THE MARK: a scout walks up to their hall
    const sc = __rv.unit('rider', 'P', A.x - 2.5, A.y + 1.5);
    G.updateVisibility();
    out.cleared = !Deck.litAt(A.x - 2, A.y + 1) && Deck.eyesAt(A.x - 2, A.y + 1);
    out.litAfter = Deck.litCount();
    out.ptsAfter = __rv.mapPts();
    // …and now they have SEEN the hall: it is their ground, and aimable
    out.fh2 = Bld.foreignHome('P', A.x - 3, A.y + 1);
    const look = { x: A.x + 0.5, y: A.y + 0.5 };   // the hall's corner, in the rider's sight
    out.v2 = Deck.validTarget('starfall', look.x, look.y);
    // the scout walks away: the hall's ground stays seen (not card-lit any more)
    S.units = S.units.filter(u => u !== sc); G.updateVisibility();
    out.v3 = Deck.validTarget('starfall', look.x, look.y);
    return out;
  });
  ck('aChartIsExploredAndCardLit', r.play.ok && r.charted > 900 && r.lit === r.charted && r.rng,
    `${r.charted} tiles charted, ${r.lit} of them card-lit`);
  ck('theExplorationScoreNeverCountsACard', r.pts[0] === r.pts[1] && r.naive.pts > r.pts[1] + 500,
    `🗺 ${r.pts[0]} → ${r.pts[1]} points; the naive fill would score ${r.naive.pts}`);
  ck('aChartedHallIsNoGroundOfTheirs', !r.fh0 && !r.fh1 && r.naive.fh,
    `foreignHome beside an unseen hall: before ${r.fh0}, after the map ${r.fh1}; the naive fill arms it: ${r.naive.fh}`);
  ck('andNoStrikeIsAimedThroughACardsMap', !r.v0 && !r.v1 && !r.ground && r.naive.v && r.stillHeld && /own people have seen/.test(r.why),
    `starfall at the unseen hall: before ${r.v0}, after ${r.v1}; naive ${r.naive.v}; refused "${r.why}"`);
  ck('theMemoryOfTheLandIsNeverSynced', r.memory, 'an unseen stump still remembered as grass');
  ck('theRimIsNeverCharted', r.rim === 0, `${r.rim} rim tiles charted by the map`);
  ck('theMaskIsCompactAndRidesTheSave', r.size <= r.sizeMax && r.saved, `${r.size} chars (≤ ${r.sizeMax}); survives a load ${r.saved}`);
  ck('realSightClearsTheMark', r.cleared && r.litAfter < r.lit && r.ptsAfter >= r.pts[1],
    `card-lit ${r.lit} → ${r.litAfter} when a scout walks there; 🗺 ${r.ptsAfter}`);
  ck('andWhatTheEyesSawIsTheirs', r.fh2 && r.v2 && r.v3, `foreignHome ${r.fh2}, aimable in sight ${r.v2} and after ${r.v3}`);
}

// …A CARD'S MAP SHOWS THE LAND, NEVER WHAT STANDS ON IT: placement, the
// placement grid, the wall ghost and every live layer ask for eyes. Each
// check runs the NAIVE explored-only gate beside it (Deck.blindIdx stubbed
// to "never blind") and must see the leak.
{
  const r = await p.evaluate(() => {
    const out = {};
    __rv.fresh('rv-eyes'); const { P, A } = __rv.flat(false);
    for (let y = 0; y < 14; y++) for (let x = 0; x < 14; x++) S.map.explored[MapGen.idx(x, y)] = 1;
    // the rival felled a stand beside its hall, in the fog: live STUMPS, memory grass
    const sx = A.x - 3, sy = A.y - 2, si = MapGen.idx(sx, sy);
    S.map.terrain[si] = T.STUMPS; S.map.seenTerrain[si] = T.GRASS;
    S.map.workedBy = S.map.workedBy || {}; S.map.workedBy[si] = 'A';
    const hut = __rv.bld('A', 'house', A.x - 4, A.y + 1);
    const free = { x: A.x - 6, y: A.y - 4 };
    G.updateVisibility();
    out.before = Bld.canPlace('P', 'lumber', sx, sy).code;
    Deck.play('pathfinders_map'); G.updateVisibility();
    const probe = () => {
      const o = {};
      o.stump = Bld.canPlace('P', 'lumber', sx, sy);
      o.hut = Bld.canPlace('P', 'house', hut.x, hut.y);
      UI.placing = 'lumber'; UI.buildPlaceMap(); o.cell = UI.placeMap ? UI.placeMap[si] : 'none';
      UI.placing = null; UI.placeMap = null;
      UI.wallDrag = [{ x: hut.x, y: hut.y }, { x: free.x, y: free.y }]; UI.updateWallGhost();
      o.wall = UI.wallGhost.map(t => t.ok); UI.wallDrag = null; UI.wallGhost = null;
      return o;
    };
    out.eyes = probe();
    const bi = Deck.blindIdx;
    Deck.blindIdx = () => false;
    out.naive = probe();
    Deck.blindIdx = bi;
    // …and the world's own reveal hands charted ground back (a starfall, a
    // finished building's view): it scores and builds as it always did
    const pts0 = __rv.mapPts();
    G.reveal(free.x, free.y, 2);
    out.given = !Deck.litAt(free.x, free.y) && !Deck.blindAt(free.x, free.y) && __rv.mapPts() >= pts0;
    out.EYES = Deck.EYES_BUILD;
    return out;
  });
  ck('aChartIsNoGroundToBuildOn', r.before === 'unexplored' && !r.eyes.stump.ok && r.eyes.stump.code === 'unexplored' && r.eyes.stump.why === r.EYES &&
    !r.eyes.hut.ok && r.eyes.hut.code === 'unexplored' && r.naive.stump.ok && r.naive.hut.code === 'blocked',
    `the rival's fogged stump: ${r.eyes.stump.code} (naive: ok ${r.naive.stump.ok}); their hidden hut: ${r.eyes.hut.code} (naive: ${r.naive.hut.code})`);
  ck('andTheGridDrawsNoCellOverIt', r.eyes.cell === 255 && r.naive.cell === 0, `lumber camp grid at the stump: ${r.eyes.cell} (naive ${r.naive.cell})`);
  ck('andTheWallGhostSaysNothing', r.eyes.wall[0] === false && r.eyes.wall[1] === false && r.naive.wall[0] === false && r.naive.wall[1] === true,
    `ghost over the hidden hut / open charted ground: ${r.eyes.wall.join('/')} (naive ${r.naive.wall.join('/')} — the difference IS the hut)`);
  ck('theWorldsRevealIsTheTribesOwn', r.given);
}
{
  const r = await p.evaluate(() => {
    __rv.fresh('rv-eyes2'); const { A } = __rv.flat(false);
    for (let y = 0; y < 14; y++) for (let x = 0; x < 14; x++) S.map.explored[MapGen.idx(x, y)] = 1;
    // a channel by their town, a RIVAL bridge over it, an ash heap: all in the fog
    const bx = A.x - 4, by = A.y - 4;
    __rv.paint(bx - 3, by, bx + 3, by, T.WATER);
    S.bridges = S.bridges || [];
    S.bridges.push({ x: bx, y: by, owner: 'A', level: 1, dir: 'v', hp: 100, maxhp: 100 });
    S.ashes = S.ashes || [];
    S.ashes.push({ x: A.x - 6, y: A.y + 1, sz: 1, key: 'house', lv: 1, day: S.day });
    S.corpses = S.corpses || [];
    S.corpses.push({ x: A.x - 7.5, y: A.y - 2.5, kind: 'deer', day: S.day });
    Bld._block = null; G._wb = null;
    Screens.show('playing'); S.paused = true;
    if (R.rebuildTerrain) R.rebuildTerrain();
    Deck.play('pathfinders_map'); G.updateVisibility();
    const TL = CFG.TILE;
    // the card's own moment is not what is measured (it unrolls over the
    // screen): drop it, and draw at a frozen clock so nothing animates
    R.cardShows.length = 0;
    const pn = performance.now, t0 = pn.call(performance);
    const lum = (tx, ty) => {
      performance.now = () => t0;
      try { R.centerOn(tx + 0.5, ty + 0.5); R.fogDirty = true; R.draw(0); R.fogDirty = true; R.draw(0); }
      finally { performance.now = pn; }
      const z = R.cam.z * (R.dpr || 1), g = R.cv.getContext('2d');
      // the whole tile, in device pixels (an ash heap lies low in its tile)
      const px = Math.round((tx * TL - R.cam.x) * z), py = Math.round((ty * TL - R.cam.y) * z), sz = Math.max(4, Math.round(TL * z));
      return g.getImageData(px, py, sz, sz).data;
    };
    const with3 = () => ({ bridge: lum(bx, by), ash: lum(A.x - 6, A.y + 1), corpse: lum(A.x - 8, A.y - 3) });
    const hold = { b: S.bridges.slice(), a: S.ashes.slice(), c: S.corpses.slice() };
    const without = () => { S.bridges = []; S.ashes = []; S.corpses = []; const o = with3(); S.bridges = hold.b; S.ashes = hold.a; S.corpses = hold.c; return o; };
    // the pixels of the tile that change when the thing is there
    const diff = (on, off) => { const o = {}; for (const k in on) { let n = 0; for (let i = 0; i < on[k].length; i += 4) if (Math.abs(on[k][i] - off[k][i]) + Math.abs(on[k][i + 1] - off[k][i + 1]) + Math.abs(on[k][i + 2] - off[k][i + 2]) > 12) n++; o[k] = n; } return o; };
    const out = { lit: Deck.litAt(bx, by) && !G.visibleAt(bx, by) };
    out.eyes = diff(with3(), without());
    const bi = Deck.blindIdx; Deck.blindIdx = () => false;
    out.naive = diff(with3(), without());
    Deck.blindIdx = bi;
    out.remembered = R.rememberedAt(MapGen.idx(bx, by));
    S.paused = true;
    return out;
  });
  ck('aChartShowsTheLandNotWhatStandsOnIt', r.lit && !r.remembered && r.eyes.bridge === 0 && r.eyes.ash === 0 && r.eyes.corpse === 0 &&
    r.naive.bridge > 20 && r.naive.ash > 20 && r.naive.corpse > 20,
    `device pixels changed by the bridge / ash / carcass on charted ground: ${r.eyes.bridge}/${r.eyes.ash}/${r.eyes.corpse}; ` +
    `the naive gate draws them: ${r.naive.bridge}/${r.naive.ash}/${r.naive.corpse}`);
}

// ---------------- 2. SCOUT'S FIRE ----------------
{
  const r = await p.evaluate(() => {
    const out = {};
    __rv.fresh('rv-scout'); const { P, A } = __rv.flat(false);
    G.updateVisibility();
    const pt = { x: 19.5, y: 12.5 };
    out.c = Deck.card('scouts_fire');
    out.at = Deck.FX.scouts_fire.at;
    out.anyUnexplored = !S.map.explored[MapGen.idx(19, 12)] && Deck.validTarget('scouts_fire', pt.x, pt.y);
    out.offBoard = !Deck.validTarget('scouts_fire', 0.5, 0.5);
    // what stands in the ring: a rival hut and a soldier
    const hut = __rv.bld('A', 'house', 22, 12);
    const sol = __rv.unit('defender', 'A', 21.5, 14.5);
    const ex0 = __rv.explored(), pts0 = __rv.mapPts(), rng = S.rngState, now = Deck.now();
    out.play = Deck.play('scouts_fire', pt);
    let inRing = 0, ringLit = 0, ringN = 0;
    for (let dy = -9; dy <= 9; dy++) for (let dx = -9; dx <= 9; dx++) {
      if (dx * dx + dy * dy > 90) continue;
      const x = 19 + dx, y = 12 + dy;
      if (!MapGen.onBoard(x, y)) continue;
      ringN++;
      if (S.map.explored[MapGen.idx(x, y)]) inRing++;
      if (Deck.litAt(x, y)) ringLit++;
    }
    out.ring = { n: ringN, explored: inRing, lit: ringLit };
    out.pts = [pts0, __rv.mapPts()];
    out.until = +(out.play.until - now).toFixed(6);
    out.watch = G.visibleAt(19, 12) && G.visibleAt(22, 12) && G.visibleAt(21, 14);
    out.ghost = !!S.map.seenB[MapGen.idx(22, 12)];
    out.rng = S.rngState === rng;
    out.logged = /9 tiles/.test(S.log[0].msg) && /3 days/.test(S.log[0].msg);
    // a second fire, on another hill: a second watch, one chip to the later
    const t2 = { x: 30.5, y: 6.5 };
    S.day += 1;
    Deck.play('scouts_fire', t2);
    const e = Deck.timed('scouts_fire');
    out.two = { pts: e.pts.length, live: S.deck.fx.filter(z => z.id === 'scouts_fire').length, untilGap: +(e.until - Deck.now()).toFixed(6) };
    G.updateVisibility();
    out.bothWatched = G.visibleAt(19, 12) && G.visibleAt(30, 6);
    // the two watches ride a save, hill by hill
    const hills0 = JSON.stringify(Deck.timed('scouts_fire').pts);
    G.loadJSON(G.saveJSON()); G.updateVisibility();
    out.saved = JSON.stringify(Deck.timed('scouts_fire').pts) === hills0 && G.visibleAt(19, 12) && G.visibleAt(30, 6);
    // the first burns out on its third day, the second watches on
    S.day += 2; S.dayT = 1; Deck.tick(); G.updateVisibility();
    out.firstOut = !G.visibleAt(19, 12) && G.visibleAt(30, 6) && !!Deck.timed('scouts_fire');
    S.day += 1; Deck.tick(); G.updateVisibility();
    out.over = !Deck.timed('scouts_fire') && !G.visibleAt(30, 6) && S.map.explored[MapGen.idx(30, 6)] === 1 && Deck.litAt(30, 6);
    out.endLog = /burned out/.test(S.log[0].msg);
    // A RELIC IN THE RING IS FOUND — legitimately, its own roll and all
    __rv.fresh('rv-scout2'); __rv.flat(false); G.updateVisibility();
    S.relic = { key: 'aqueduct', x: 20, y: 20, w: 4, h: 2, found: 0, amount: 0 };
    const s0 = S.res.stone, rngR = S.rngState;
    Deck.play('scouts_fire', { x: 22.5, y: 24.5 });
    out.found = S.relic.found > 0 && S.res.stone > s0;
    // …and its reward is the CARD's find: no draw at the play, nor through
    // the watch's vision passes after it (a card never draws the run's RNG)
    out.foundRng = S.rngState === rngR;
    G.updateVisibility(); G.updateVisibility();
    out.foundRngAfter = S.rngState === rngR;
    // the CONTROL: the same relic found by a hand that walked there rolls
    // its reward on the run's RNG, as it always has — the probe can see a draw
    __rv.fresh('rv-scout2w'); __rv.flat(false); G.updateVisibility();
    S.relic = { key: 'aqueduct', x: 20, y: 20, w: 4, h: 2, found: 0, amount: 0 };
    __rv.unit('rider', 'P', 21.5, 21.5);
    const rngW = S.rngState;
    G.updateVisibility();
    out.walkDraws = S.relic.found > 0 && S.rngState !== rngW;
    // …one outside it is not, and nothing draws
    __rv.fresh('rv-scout3'); __rv.flat(false); G.updateVisibility();
    S.relic = { key: 'aqueduct', x: 30, y: 30, w: 4, h: 2, found: 0, amount: 0 };
    const rng3 = S.rngState;
    Deck.play('scouts_fire', { x: 15.5, y: 15.5 });
    out.notFound = !S.relic.found && S.rngState === rng3;
    // at the far corner of the world: never the rim
    const cy = CFG.H - 2, rim0 = __rv.rim();
    Deck.play('scouts_fire', { x: 1.5, y: cy + 0.5 });
    out.rim = __rv.rim() - rim0;
    // what G.reveal (inB) would have charted there
    let naive = 0;
    for (let dy = -9; dy <= 9; dy++) for (let dx = -9; dx <= 9; dx++)
      if (dx * dx + dy * dy <= 90 && MapGen.inB(1 + dx, cy + dy) && !MapGen.onBoard(1 + dx, cy + dy)) naive++;
    out.naiveRim = naive;
    // THE SAME FIRE FED AGAIN burns 3 MORE days (a play within half its ring
    // of a hill still burning) — the old code lit a second fire there that
    // outlasted the first by one day
    __rv.fresh('rv-scout4'); __rv.flat(false); G.updateVisibility();
    const d0 = Deck.now();
    Deck.play('scouts_fire', { x: 20.5, y: 20.5 });
    S.day += 1;
    Deck.play('scouts_fire', { x: 22.5, y: 21.5 });
    const e4 = Deck.timed('scouts_fire');
    out.fed = { pts: e4.pts.length, until: +(e4.pts[0].until - d0).toFixed(6), chip: +(e4.until - d0).toFixed(6) };
    return out;
  });
  ck('theSameFireFedAgainBurnsThreeMoreDays', r.fed.pts === 1 && r.fed.until === 6 && r.fed.chip === 6,
    `${r.fed.pts} hill, burning ${r.fed.until} days from the first play (chip ${r.fed.chip})`);
  ck('theFireIsAnyPoint', r.c.target === 'any' && r.at === 'target' && r.anyUnexplored && r.offBoard,
    `target '${r.c.target}', unexplored ground takes it ${r.anyUnexplored}, off the board refused ${r.offBoard}`);
  ck('nineTilesChartedForGood', r.play.ok && r.ring.explored === r.ring.n && r.ring.lit > 200 && r.pts[0] === r.pts[1],
    `${r.ring.explored}/${r.ring.n} ring tiles explored, ${r.ring.lit} card-lit; 🗺 ${r.pts[0]} → ${r.pts[1]}`);
  ck('aWatchForThreeDaysFromThePlay', r.until === 3 && r.watch && r.ghost,
    `${r.until} days; in sight at once (the world held still) ${r.watch}; their hut ghosted ${r.ghost}`);
  ck('aSecondFireLightsASecondHill', r.two.pts === 2 && r.two.live === 1 && r.two.untilGap === 3 && r.bothWatched && r.firstOut,
    `${r.two.pts} hills on ${r.two.live} timer, chip ${r.two.untilGap}d; both watched ${r.bothWatched}; the first burns out alone ${r.firstOut}`);
  ck('theWatchEndsTheChartStays', r.over && r.endLog);
  ck('theWatchesRideTheSave', r.saved);
  ck('aRelicInTheRingIsFound', r.found && r.notFound, `inside found ${r.found}; outside untouched and no draw ${r.notFound}`);
  ck('andTheFindDrawsNoRng', r.foundRng && r.foundRngAfter && r.walkDraws,
    `the card's find: no draw at the play ${r.foundRng}, nor after its watch ${r.foundRngAfter}; the same relic found on foot draws ${r.walkDraws}`);
  ck('theFireNeverChartsTheRim', r.rim === 0 && r.naiveRim > 0, `${r.rim} rim tiles (an inB disc would chart ${r.naiveRim})`);
  ck('andTheFireDrawsNoRng', r.rng && r.logged);
}

// ---------------- 3. PATHFINDER'S MAP ----------------
{
  const r = await p.evaluate(() => {
    const out = {};
    __rv.fresh('rv-map'); const { P, A } = __rv.flat(false);
    G.updateVisibility();
    S.relic = { key: 'aqueduct', x: 18, y: 24, w: 4, h: 2, found: 0, amount: 0 };
    const hut = __rv.bld('A', 'house', 20, 14);
    const rv = __rv.unit('villager', 'A', 22.5, 16.5);
    out.c = Deck.card('pathfinders_map');
    const seenB0 = JSON.stringify(S.map.seenB), rng = S.rngState, n0 = Deck.count('pathfinders_map');
    out.play = Deck.play('pathfinders_map');
    let dark = 0, darkRelic = 0;
    for (let y = 0; y < CFG.H; y++) for (let x = 0; x < CFG.W; x++) {
      if (!MapGen.onBoard(x, y) || S.map.explored[MapGen.idx(x, y)]) continue;
      dark++;
      if (x >= 18 && x < 22 && y >= 24 && y < 26) darkRelic++;
    }
    out.dark = dark; out.darkRelic = darkRelic;
    out.relic = !S.relic.found && S.deck.relicMark === true;
    out.rng = S.rngState === rng;
    out.used = n0 - Deck.count('pathfinders_map');
    out.nothingStanding = JSON.stringify(S.map.seenB) === seenB0 && !G.visibleAt(22, 16);
    out.log = S.log[0].msg;
    // the mark: drawn on the minimap (gold) and on the map, with no throw
    const calls = []; const g = { fillRect: (...a) => calls.push(a), set fillStyle(v) { calls.push(v); } };
    Deck.drawMini(g);
    out.mini = calls.filter(c => typeof c === 'string' && /ffd45e|c99b32/.test(c)).length > 0 && calls.filter(Array.isArray).length >= 14;
    // its "when": nothing left to chart and the relic marked → kept, in words
    out.again = Deck.canPlay('pathfinders_map');
    // a hand walks there and digs it up: the mark retires itself
    __rv.unit('rider', 'P', 19.5, 25.5); G.updateVisibility(); G.updateVisibility();
    out.dug = !!S.relic.found && S.deck.relicMark === false;
    out.again2 = Deck.canPlay('pathfinders_map');
    // a world all charted with the relic unfound and UNMARKED may still mark it
    __rv.fresh('rv-map2'); __rv.flat(true); G.updateVisibility();
    S.relic = { key: 'aqueduct', x: 18, y: 24, w: 4, h: 2, found: 0, amount: 0 };
    for (let y = 24; y < 26; y++) for (let x = 18; x < 22; x++) S.map.explored[MapGen.idx(x, y)] = 0;
    out.markOnly = Deck.canPlay('pathfinders_map').ok && Deck.play('pathfinders_map').ok && S.deck.relicMark === true && !S.relic.found;
    return out;
  });
  ck('everyTileButTheRelicIsCharted', r.play.ok && r.c.target === 'none' && r.dark === 8 && r.darkRelic === 8,
    `${r.dark} on-board tiles left dark, ${r.darkRelic} of them the relic's footprint`);
  ck('theRelicIsMarkedNotFound', r.relic && r.rng && /marked/.test(r.log), `marked and unfound ${r.relic}; no draw ${r.rng}`);
  ck('itShowsNothingStandingOnTheLand', r.nothingStanding, 'no ghost written, nobody in sight');
  ck('theMarkIsOnTheMinimap', r.mini);
  ck('itsWhenIsKeptInWords', !r.again.ok && /already on your map, and the relic is marked/.test(r.again.why) &&
    r.dug && !r.again2.ok && /already on your map\.$/.test(r.again2.why) && r.markOnly,
    `"${r.again.why}" / dug: mark retired ${r.dug} / "${r.again2.why}" / mark only ${r.markOnly}`);
}

// ---------------- 4. SPY IN THE HALL ----------------
{
  const r = await p.evaluate(() => {
    const out = {};
    __rv.fresh('rv-spy', 'calm'); const { P, A } = __rv.flat(false);
    G.updateVisibility();
    out.c = Deck.card('spy_hall');
    out.peace0 = S.peace === true;
    const hut = __rv.bld('A', 'house', 20, 20);
    const bar = __rv.bld('A', 'barracks', 24, 24);
    const site = Bld.place('A', 'house', 18, 26, { free: true }); Bld._block = null;
    const sneak = __rv.unit('villager', 'A', 25.5, 10.5);
    const aiMem0 = JSON.stringify([S.ai.knownB, S.ai.knownTC || null]);
    const rng = S.rngState, now = Deck.now();
    out.hidden0 = !G.visibleAt(25, 10) && !Deck.reachesRival({ x: 25.5, y: 10.5 }, 1, 0);
    out.play = Deck.play('spy_hall');
    const rivals = S.buildings.filter(z => z.owner === 'A');
    out.ghosts = rivals.filter(z => S.map.seenB[MapGen.idx(z.x, z.y)] && S.map.seenB[MapGen.idx(z.x, z.y)].key === z.key).length;
    out.rivals = rivals.length;
    out.footLit = [0, 1].every(dx => [0, 1].every(dy => Deck.litAt(24 + dx, 24 + dy)));
    G.updateVisibility(); G.updateVisibility();
    out.kept = rivals.filter(z => S.map.seenB[MapGen.idx(z.x, z.y)]).length;
    out.until = +(out.play.until - now).toFixed(6);
    const pk = S.draft && S.draft.rival && S.draft.rival.pick, cd = pk && Cards.DEFS[pk.key];
    out.origin = cd ? out.play.msg.includes(cd.name) && S.log[0].msg.includes(cd.name) : 'no pick';
    out.peace = S.peace === true;
    out.sees = Deck.spySees(sneak) && !G.visibleAt(25, 10);
    out.knows = Deck.reachesRival({ x: 25.5, y: 10.5 }, 1, 0);
    out.aiMem = JSON.stringify([S.ai.knownB, S.ai.knownTC || null]) === aiMem0;
    out.rng = S.rngState === rng;
    // NOT TAPPABLE THROUGH THE FOG: shown, never selected from the dark
    Screens.show('playing');
    R.centerOn(25.5, 10.5);
    UI.deselect();
    const tap = (u) => UI.handleTap((u.x * CFG.TILE - R.cam.x) * R.cam.z, ((u.y - 0.3) * CFG.TILE - R.cam.y) * R.cam.z);
    tap(sneak);
    out.tapHidden = !(UI.sel && UI.sel.id === sneak.id);
    // …and the very same tap with the soldier in sight does select it (the probe can see)
    G.vis[MapGen.idx(25, 10)] = 1;
    UI.deselect(); tap(sneak);
    out.tapSeen = !!(UI.sel && UI.sel.id === sneak.id);
    UI.deselect(); G.vis[MapGen.idx(25, 10)] = 0;
    // the silhouettes are drawn while the spy sits there (render state only)
    let sil = 0; const silF = Deck.FX.spy_hall.silhouette;
    Deck.FX.spy_hall.silhouette = function (img) { const c = silF.call(this, img); if (c) sil++; return c; };
    S.dayT += 2000;   // they fade in over the first moments of game time after the play
    try { R.draw(1 / 30); } finally { Deck.FX.spy_hall.silhouette = silF; }
    out.sil = sil;
    out.inS = /silhouette|_sil/.test(JSON.stringify(S.deck));
    // a save mid-watch
    G.loadJSON(G.saveJSON());
    out.saved = !!Deck.timed('spy_hall') && Deck.spySees(S.units.find(u => u.owner === 'A'));
    // ten days on, the people are hidden again; the marks stay for good
    S.day += 10; Deck.tick(); G.updateVisibility();
    out.after = !Deck.timed('spy_hall') && !Deck.spySees(S.units.find(u => u.owner === 'A')) &&
      S.buildings.filter(z => z.owner === 'A').every(z => S.map.seenB[MapGen.idx(z.x, z.y)]);
    out.endLog = /spy slips away/.test(S.log[0].msg);
    // THEIR card in THEIR voice: the Forager's headline is written to the
    // player who drafts it ("your folk walk 12% faster")
    S.draft = S.draft || {}; S.draft.rival = S.draft.rival || {};
    S.draft.rival.pick = { key: 'forager', roll: { food: 20, wood: 20, stone: 15, kick: 30, pm: 1.12 } };
    const fm = Deck.play('spy_hall').msg;
    out.forager = { msg: fm, theirs: /Forager — mixed stores; their folk walk 12% faster/.test(fm) && !/\byour\b/.test(fm.split('drafted')[1] || 'your'),
      naive: /\byour\b/.test(Cards.DEFS.forager.text(S.draft.rival.pick.roll)) };
    // a save from before the draft: something true about the origin card
    S.draft.rival.pick = null;
    out.noPick = Deck.play('spy_hall');
    return out;
  });
  ck('everyRivalBuildingIsMarkedForGood', r.play.ok && r.c.target === 'none' && r.ghosts === r.rivals && r.rivals === 4 && r.footLit && r.kept === r.rivals && r.after,
    `${r.ghosts}/${r.rivals} ghosted (a work site among them), 2x2 footprint card-lit ${r.footLit}, kept through two passes ${r.kept}, after the ten days ${r.after}`);
  ck('youLearnTheirOriginCard', (r.origin === true || r.origin === 'no pick') && r.forager.theirs && r.forager.naive,
    String(r.origin) + ' — ' + r.forager.msg);
  ck('aSaveWithNoDraftIsToldTheTruth', r.noPick.ok && /drafted no origin card/.test(r.noPick.msg), r.noPick.msg);
  ck('forTenDaysTheirPeopleAreSeen', r.until === 10 && r.hidden0 && r.sees && r.knows && r.saved && r.endLog,
    `${r.until} days; a soul in the fog seen ${r.sees}, counted by the truce's question ${r.knows}; rides the save ${r.saved}`);
  ck('seenThroughTheFogIsNeverTapped', r.tapHidden && r.tapSeen, `hidden: not selected ${r.tapHidden}; the same tap in sight selects ${r.tapSeen}`);
  ck('theirSilhouettesAreDrawn', r.sil > 0 && !r.inS, `${r.sil} silhouette(s) this frame; in S ${r.inS}`);
  ck('aSpyIsAGuestNotABlow', r.peace0 && r.peace, 'the truce holds');
  ck('theRivalLearnsNothing', r.aiMem && r.rng);
}

// ---------------- 5. BARBARIAN PACT ----------------
{
  const r = await p.evaluate(() => {
    const out = {};
    __rv.fresh('rv-pact', 'hard'); const { P, A } = __rv.flat(false);
    G.updateVisibility();
    out.c = Deck.card('barbarian_pact');
    out.noteChance = G.modeCfg().foeNoteChance;
    const rng = S.rngState;
    out.play = Deck.play('barbarian_pact');
    out.n = S.deck.charges.pact;
    out.rng = S.rngState === rng;
    Deck.play('barbarian_pact');
    out.n2 = S.deck.charges.pact;
    /* EVERY RUNNING CARD IS SEEN, OR COUNTED: the bands still owed wear the
       card's chip on the strip — the count, in words when tapped — and it
       goes with the last of them */
    Screens.show('playing'); S.paused = true;
    const chipNow = () => { DeckUI._t = 0; DeckUI.frame(1); const ch = DeckUI._chips.barbarian_pact; return ch ? ch.lab.textContent + '|' + ch.charge.words : null; };
    out.chip = [chipNow()];
    S.deck.charges.pact = 1; out.chip.push(chipNow());
    delete S.deck.charges.pact; out.chip.push(chipNow());
    S.deck.charges.pact = 3;
    // three bands muster: every one marches on the rival, and is told
    const bands = [];
    for (let k = 0; k < 3; k++) {
      S.wave.next = S.day;
      const ids0 = new Set(S.units.map(u => u.id)), log0 = S.log.length;
      Combat.maybeWave();
      const nu = S.units.filter(u => !ids0.has(u.id));
      bands.push({ n: nu.length, aim: [...new Set(nu.map(u => u.hostileTo))].join(','), left: S.deck.charges.pact,
        told: S.log.length > log0 && /turns on the rival/.test(S.log[0].msg) });
      S.units = S.units.filter(u => ids0.has(u.id));
    }
    out.bands = bands;
    out.spent = !Deck.pactPending();
    // A BAND THE WILDS WOULD SPARE WAITS: no muster, no draw, the charge kept
    S.deck.charges.pact = 2;
    const ease = G.barbEase;
    G.barbEase = o => o === 'A';
    S.wave.next = S.day;
    const c0 = S.wave.count, r0 = S.rngState, u0 = S.units.length;
    Combat.maybeWave();
    out.waits = { count: S.wave.count - c0, rng: S.rngState === r0, units: S.units.length - u0, kept: S.deck.charges.pact };
    // the NAIVE flip — the same eased day with no pact — sends the band at the player
    S.deck.charges.pact = 0;
    const ids1 = new Set(S.units.map(u => u.id));
    Combat.maybeWave();
    out.naive = [...new Set(S.units.filter(u => !ids1.has(u.id)).map(u => u.hostileTo))].join(',');
    S.units = S.units.filter(u => ids1.has(u.id));
    /* …BUT NEVER FOR LONG: a wave PACT_WAIT days past its day runs its
       ordinary course with the charge kept, and the log says why — the
       uncapped wait (pactHold stubbed to "always") is the control, and it
       holds every band off the map for as long as the rival stays down */
    S.deck.charges.pact = 2;
    const waitOne = (hold) => {
      const ph = Deck.pactHold; if (hold) Deck.pactHold = () => true;
      S.wave.next = S.day - Deck.PACT_WAIT;
      const ids = new Set(S.units.map(u => u.id)), c = S.wave.count, top = S.log[0];
      Combat.maybeWave();
      const nu = S.units.filter(u => !ids.has(u.id));
      const o = { count: S.wave.count - c, n: nu.length, aim: [...new Set(nu.map(u => u.hostileTo))].join(','), kept: S.deck.charges.pact,
        said: __rv.since(top).some(l => /pact.s bands wait/.test(l.msg)) };
      S.units = S.units.filter(u => ids.has(u.id));
      Deck.pactHold = ph;
      return o;
    };
    out.capped = waitOne(false);
    out.uncapped = waitOne(true);
    out.day9 = (() => { S.wave.next = S.day - (Deck.PACT_WAIT - 1); const c = S.wave.count; Combat.maybeWave(); return S.wave.count - c; })();
    G.barbEase = ease;
    // A BAND WITH NO ROAD TO THE RIVAL SCATTERS — one of the pact's three,
    // spent and said: their town walled in by crags, no sea for a longboat
    S.deck.charges.pact = 2;
    for (let y = A.y - 3; y <= A.y + 4; y++) for (let x = A.x - 3; x <= A.x + 4; x++)
      if (Math.max(Math.abs(x - A.x - 0.5), Math.abs(y - A.y - 0.5)) >= 3 && MapGen.inB(x, y)) {
        const i = MapGen.idx(x, y); S.map.terrain[i] = T.MOUNTAIN;
      }
    Bld._block = null; G._wb = null;
    S.wave.next = S.day;
    const ids2 = new Set(S.units.map(u => u.id)), c2 = S.wave.count;
    const top2 = S.log[0];
    Combat.maybeWave();
    out.walled = { spawned: S.units.filter(u => !ids2.has(u.id) && u.owner === 'R').length, kept: S.deck.charges.pact, waved: S.wave.count - c2,
      said: __rv.since(top2).some(l => /found no road to the rival/.test(l.msg)) };
    // a save keeps the charges
    G.loadJSON(G.saveJSON());
    out.saved = S.deck.charges.pact === 1;
    // …and the next no-road band spends the last: the pact is a count, never a
    // shield — the wave after it musters its ordinary band
    S.wave.next = S.day; Combat.maybeWave();
    out.lastSpent = S.deck.charges.pact === 0 && !Deck.pactPending();
    const ids4 = new Set(S.units.map(u => u.id));
    S.wave.next = S.day; Combat.maybeWave();
    out.after = S.units.filter(u => !ids4.has(u.id) && u.owner === 'R').length;
    // DENIABLE AT PEACE, and the band goes for the rival's town
    __rv.fresh('rv-pact2', 'calm'); const f2 = __rv.flat(false);
    // a town to sack: barbarians never burn a hall (they cannot win anyone's war)
    __rv.bld('A', 'house', f2.A.x - 3, f2.A.y); __rv.bld('A', 'house', f2.A.x, f2.A.y - 3);
    __rv.unit('villager', 'A', f2.A.x - 1.5, f2.A.y + 0.5);
    G.updateVisibility();
    Deck.play('barbarian_pact');
    S.wave.next = S.day;
    const ids3 = new Set(S.units.map(u => u.id));
    Combat.maybeWave();
    const band = S.units.filter(u => !ids3.has(u.id));
    out.peaceBand = band.length;
    __rv.step(25, 0.1);
    out.peace = S.peace === true;
    const tcA = Bld.tcOf('A'), tcP = Bld.tcOf('P');
    out.hunt = band.filter(u => S.units.includes(u)).map(u => {
      const toA = Math.hypot(u.x - Bld.cx(tcA), u.y - Bld.cy(tcA)), toP = Math.hypot(u.x - Bld.cx(tcP), u.y - Bld.cy(tcP));
      const tb = u.tBld && Bld.get(u.tBld), tu = u.tUnit && Units.get(u.tUnit);
      return { toA: +toA.toFixed(1), toP: +toP.toFixed(1), at: tb ? tb.owner : tu ? tu.owner : '-' };
    });
    out.rivalHurt = S.buildings.filter(z => z.owner === 'A').some(z => z.hp < z.maxhp) || S.units.some(u => u.owner === 'A' && u.hp < u.maxhp);
    out.playerSafe = S.buildings.filter(z => z.owner === 'P').every(z => z.hp >= z.maxhp);
    return out;
  });
  ck('thePactHoldsThreeBands', r.play.ok && r.c.target === 'none' && r.n === 3 && r.n2 === 6 && r.rng, `${r.n} charges, a second pact ${r.n2}; no draw ${r.rng}`);
  ck('theBandsOwedWearAChip', r.chip[0] === '×6|6 war bands' && r.chip[1] === '×1|1 war band' && r.chip[2] === null,
    `strip chip: ${r.chip.map(String).join(' → ')}`);
  ck('eachBandMarchesOnTheRival', r.bands.every((bd, i) => bd.n > 0 && bd.aim === 'A' && bd.left === 2 - i) && r.spent,
    r.bands.map(bd => `${bd.n}→${bd.aim} (${bd.left} left)`).join(', '));
  ck('andIsToldAtEveryDifficulty', r.noteChance === 0 && r.bands.every(bd => bd.told), `on Hard (foe notes ${r.noteChance}) every band logged`);
  ck('aSparedRivalMeansTheBandWaits', r.waits.count === 0 && r.waits.rng && r.waits.units === 0 && r.waits.kept === 2 && /P/.test(r.naive),
    `muster ${r.waits.count}, draws none ${r.waits.rng}, spawned ${r.waits.units}, charges kept ${r.waits.kept}; the naive flip aims at '${r.naive}'`);
  ck('butTheWaitIsNeverAShield', r.capped.count === 1 && r.capped.n > 0 && /P/.test(r.capped.aim) && r.capped.kept === 2 && r.capped.said &&
    r.uncapped.count === 0 && r.uncapped.n === 0 && r.day9 === 0,
    `${r.capped.n} raised at ${r.capped.aim}, charges kept ${r.capped.kept}, said ${r.capped.said}; a day short of the cap still waits (${r.day9}); the uncapped wait raises ${r.uncapped.n}`);
  ck('noRoadToTheRivalSpendsTheCharge', r.walled.spawned === 0 && r.walled.kept === 1 && r.walled.waved === 1 && r.walled.said && r.lastSpent && r.after > 0,
    `spawned ${r.walled.spawned}, charges ${r.walled.kept}, the wave spent ${r.walled.waved}, said ${r.walled.said}; the last spent ${r.lastSpent}, the next wave raises ${r.after}`);
  ck('theChargesRideTheSave', r.saved);
  ck('thePactIsDeniable', r.peace && r.peaceBand > 0, `peace holds while the band marches: ${r.peace}`);
  ck('andTheBandGoesForTheirTown', r.hunt.length > 0 && r.hunt.every(h => h.toA < h.toP && h.at !== 'P') && r.playerSafe,
    JSON.stringify(r.hunt) + ` rival hurt ${r.rivalHurt}`);
}

// ---------------- 6. THE SWALLOWED SUN ----------------
{
  const r = await p.evaluate(() => {
    const out = {};
    __rv.fresh('rv-sun', 'hard'); const { P, A } = __rv.flat(true);
    G.updateVisibility();
    out.c = Deck.card('swallowed_sun');
    const ax = __rv.unit('axeman', 'A', 20.5, 20.5), pd = __rv.unit('defender', 'P', 10.5, 20.5);
    const catA = __rv.unit('catapult', 'A', 14.5, 30.5), catP = __rv.unit('catapult', 'P', 6.5, 30.5);
    const v = __rv.unit('villager', 'A', 26.5, 12.5), pv = __rv.unit('villager', 'P', 8.5, 12.5);
    const raider = __rv.unit('raider', 'R', 30.5, 4.5), wolf = __rv.unit('wolf', 'W', 4.5, 30.5);
    const base = { ax: Units.effAtk(ax), pd: Units.effAtk(pd), ca: Combat.bldAtkOf(catA), cp: Combat.bldAtkOf(catP),
      sight: G.sightIn(6, null, 'A'), awe: G.eclipseAwe(v) };
    AI.updateVision(); const vis0 = AI._vis.reduce((a, z) => a + z, 0), by0 = AI._vis[MapGen.idx(22, 20)];
    const ecl0 = JSON.stringify(S.eclipse), rng = S.rngState, now = Deck.now();
    out.play = Deck.play('swallowed_sun');
    out.until = +(out.play.until - now).toFixed(6);
    out.rng = S.rngState === rng;
    out.dark = G.eclipseDark();
    out.ecl = JSON.stringify(S.eclipse) === ecl0;
    out.atk = { ax: [base.ax, Units.effAtk(ax)], pd: [base.pd, Units.effAtk(pd)], ca: [base.ca, Combat.bldAtkOf(catA)], cp: [base.cp, Combat.bldAtkOf(catP)] };
    out.sight = { A6: G.sightIn(6, null, 'A'), A4: G.sightIn(4, null, 'A'), hall: G.sightIn(8, Bld.tcOf('A'), 'A'), P6: G.sightIn(6), Pown: G.sightIn(6, null, 'P') };
    AI.updateVision(); const vis1 = AI._vis.reduce((a, z) => a + z, 0), by1 = AI._vis[MapGen.idx(22, 20)];
    out.vis = [vis0, vis1, by0, by1];
    // THE STARE: every rival soul not fighting; never ours, never the wild's
    out.awe = { v: G.eclipseAwe(v), ax: G.eclipseAwe(ax), pv: G.eclipseAwe(pv), raider: G.eclipseAwe(raider), wolf: G.eclipseAwe(wolf) };
    ax.tUnit = pd.id; out.aweFighting = G.eclipseAwe(ax); ax.tUnit = 0;
    Units.setPath(v, 30, 16); Units.setPath(pv, 4, 16);
    v.task = { type: 'move', x: 30, y: 16 }; pv.task = { type: 'move', x: 4, y: 16 };
    const v0 = [v.x, v.y], pv0 = [pv.x, pv.y];
    for (let i = 0; i < 30; i++) Units.update(0.1);
    out.moved = { v: Math.hypot(v.x - v0[0], v.y - v0[1]), pv: Math.hypot(pv.x - pv0[0], pv.y - pv0[1]) };
    out.pose = R.unitPose ? R.unitPose(v) : 'idle';
    // THE TOWER'S ARROW: a level-2 rival tower at a player soldier (no miss at L2)
    const tw = __rv.bld('A', 'tower', 12, 8); tw.level = 2;
    const tgt = __rv.unit('defender', 'P', 13.5, 10.5, 1000);
    const hits = [], ud = Units.damage;
    Units.damage = function (u, amt, x, by) { if (u === tgt) hits.push(amt); return ud.apply(this, arguments); };
    try { for (let i = 0; i < 40 && hits.length < 2; i++) Combat.update(0.1); } finally { Units.damage = ud; }
    out.tower = { hit: hits[0], want: Math.max(1, Math.round(13 * 0.7) - Units.effDef(tgt)), full: Math.max(1, 13 - Units.effDef(tgt)) };
    // THE BARBARIANS STILL MUSTER (the world's eclipse is never driven)
    S.wave.next = S.day;
    const wc = S.wave.count; Combat.maybeWave();
    out.wave = S.wave.count - wc;
    // a save mid-dark
    G.loadJSON(G.saveJSON());
    const ax2 = S.units.find(u => u.id === ax.id);
    out.saved = !!Deck.timed('swallowed_sun') && Math.abs(Units.effAtk(ax2) - base.ax * 0.7) < 1e-9;
    // the fourth day ends it
    S.day += 3; S.dayT = 0; Deck.tick();
    out.day3 = !!Deck.timed('swallowed_sun');
    S.day += 1; Deck.tick();
    const v2 = S.units.find(u => u.id === v.id);
    out.over = !Deck.timed('swallowed_sun') && Units.effAtk(ax2) === base.ax && G.sightIn(6, null, 'A') === 6 && !G.eclipseAwe(v2);
    out.endLog = /sun comes back/.test(S.log[0].msg);
    // DENIABLE AT PEACE
    __rv.fresh('rv-sun2', 'calm');
    out.calm = Deck.play('swallowed_sun').ok && S.peace === true;
    return out;
  });
  const a = r.atk;
  ck('theSunIsDarkForFourDays', r.play.ok && r.c.target === 'none' && r.until === 4 && r.rng, `${r.until} days; no draw ${r.rng}`);
  ck('theWorldsEclipseIsNeverDriven', r.dark === 0 && r.ecl && r.wave === 1, `eclipseDark ${r.dark}, S.eclipse untouched ${r.ecl}, a barbarian band still musters ${r.wave === 1}`);
  ck('theySeeHalfAsFar', r.sight.A6 === 3 && r.sight.A4 === 2 && r.sight.hall === 8 && r.sight.P6 === 6 && r.sight.Pown === 6 && r.vis[1] < r.vis[0] && r.vis[2] === 1 && r.vis[3] === 0,
    `rival 6→${r.sight.A6}, 4→${r.sight.A4}, the hall keeps ${r.sight.hall}; ours ${r.sight.P6}; the chief's own sight ${r.vis[0]} → ${r.vis[1]} tiles, two tiles from its soldier ${r.vis[2]} → ${r.vis[3]}`);
  ck('theyStrikeThirtyPercentSofter', Math.abs(a.ax[1] - a.ax[0] * 0.7) < 1e-9 && a.pd[1] === a.pd[0],
    `a rival blow ${a.ax[0]} → ${a.ax[1]}; ours ${a.pd[0]} → ${a.pd[1]}`);
  ck('andSoDoTheirEnginesAndTowers', a.ca[1] === Math.round(a.ca[0] * 0.7) && a.cp[1] === a.cp[0] && r.tower.hit === r.tower.want && r.tower.want < r.tower.full,
    `catapult ${a.ca[0]} → ${a.ca[1]} (ours ${a.cp[1]}); the tower's arrow ${r.tower.hit} (full ${r.tower.full})`);
  ck('everyRivalSoulNotFightingStares', r.awe.v && r.awe.ax && !r.awe.pv && !r.awe.raider && !r.awe.wolf && !r.aweFighting && r.moved.v === 0 && r.moved.pv > 1 && r.pose === 'idle',
    `rival ${r.awe.v}/${r.awe.ax}, fighting ${r.aweFighting}, ours ${r.awe.pv}, raider ${r.awe.raider}, wolf ${r.awe.wolf}; walked: theirs ${r.moved.v}, ours ${r.moved.pv.toFixed(2)}`);
  ck('itRidesTheSaveAndEndsOnItsDay', r.saved && r.day3 && r.over && r.endLog);
  ck('theSunIsDeniable', r.calm);
}

// …and no war band musters: a raid primed to march stays home
{
  const r = await p.evaluate(() => {
    const run = (sun) => {
      __rv.seed(11);
      __rv.fresh('rv-hush', 'hard');
      S.day = 90;
      __rv.primeRaid(14);
      const cp = AI.choosePosture;
      AI.choosePosture = function () { S.ai.posture = 'PUSH'; return 'PUSH'; };
      const calls = {}, names = ['campaignLaunch', 'secondFront', 'maybePurge', 'stormTheHall', 'wonderWatch', 'foeSpent'];
      const orig = {};
      for (const n of names) { orig[n] = AI[n]; AI[n] = function () { calls[n] = (calls[n] || 0) + 1; return orig[n].apply(this, arguments); }; }
      if (sun) Deck.play('swallowed_sun');
      const raids = [];
      try {
        for (let d = 0; d < 4; d++) {
          AI.daily();
          raids.push(S.units.filter(u => u.owner === 'A' && u.task && u.task.type === 'raid').length);
          S.day++;
        }
      } finally { for (const n of names) AI[n] = orig[n]; AI.choosePosture = cp; }
      return { raids, calls };
    };
    return { control: run(false), sun: run(true) };
  });
  const c = r.control, s = r.sun;
  ck('noWarBandMustersUnderTheirDarkSun', c.raids.some(n => n > 0) && s.raids.every(n => n === 0) &&
    !s.calls.campaignLaunch && !s.calls.secondFront && !s.calls.maybePurge && !s.calls.stormTheHall && !s.calls.wonderWatch &&
    c.calls.campaignLaunch > 0 && c.calls.secondFront > 0,
    `raiders out: without the card ${c.raids.join('/')}, with it ${s.raids.join('/')}; launchers asked ${JSON.stringify(s.calls)} (control ${JSON.stringify(c.calls)})`);
}

// ---------------- 7. KRAKEN'S CALL ----------------
{
  const r = await p.evaluate(() => {
    const out = {};
    out.c = Deck.card('krakens_call');
    // NEEDS OPEN WATER: a dry world, then one with only a pond
    __rv.fresh('rv-kr0'); __rv.flat(true);
    out.dry = Deck.canPlay('krakens_call');
    __rv.paint(10, 10, 14, 14, T.WATER);
    out.pond = Deck.canPlay('krakens_call');
    // THE SEA: rows 27.. edge to edge; a pond up the coast; the rival's
    // hall beside the water at level 1 (500hp — a naive 600 razes it)
    __rv.fresh('rv-kr'); const { P, A } = __rv.flat(true);
    __rv.sea(27);
    __rv.paint(4, 12, 6, 14, T.WATER);                       // a pond: never the deep's
    A.x = 14; A.y = 23; A.level = 1; A.hp = A.maxhp = 500;    // footprint rows 23-24: 2 from row 27
    Bld._block = null; G._wb = null;
    out.open = Deck.canPlay('krakens_call');
    const H = [__rv.bld('A', 'house', 3, 26, 5000),           // d 0
               __rv.bld('A', 'house', 5, 25, 5000),           // d 1
               __rv.bld('A', 'house', 7, 24, 5000),           // d 2 — the edge
               __rv.bld('A', 'house', 9, 23, 5000)];          // d 3 — out of reach
    const pondHut = __rv.bld('A', 'house', 7, 13, 5000);      // beside a pond only
    const hut = __rv.bld('A', 'house', 18, 26);               // 80hp at d 0: razed
    const own = __rv.bld('P', 'house', 22, 26, 5000);
    const mine = __rv.bld('A', 'mine', 24, 26, 5000);
    const S0 = [['fishboat', 2.5], ['transport', 6.5], ['fireship', 10.5], ['bombard', 14.5], ['fishboat', 18.5], ['fireship', 11.5]];
    const ships = S0.map(([k, x]) => __rv.unit(k, 'A', x, k === 'fireship' && x > 11 ? 29.5 : 31.5));
    const pondBoat = __rv.unit('fishboat', 'A', 5.5, 13.5);
    const ours = __rv.unit('fireship', 'P', 30.5, 31.5);
    G.updateVisibility();
    const kr0 = JSON.stringify(S.kraken), sd0 = S.specialDay, kills0 = S.stats.kills, razed0 = S.stats.razed, slain0 = S.stats.krakenSlain;
    const causes = new Set(), bd = Bld.damage;
    Bld.damage = function (bb, amt, cause) { causes.add(String(cause)); return bd.apply(this, arguments); };
    const rng = S.rngState, n0 = Deck.count('krakens_call');
    out.play = Deck.play('krakens_call');
    out.rng = S.rngState === rng;
    const rngPlay = S.rngState;
    out.acts = S.deck.kraken.acts.map(a => Units.get(a.id).kind);
    out.risen = Deck.canPlay('krakens_call');
    // …nor while the world's own kraken is up out of the deep
    const K0 = S.deck.kraken; S.deck.kraken = null;
    S.kraken.ev = { phase: 'rise', t: 0.2, x: 20.5, y: 31.5, owner: 'P', boatId: -1 };
    out.stirring = Deck.canPlay('krakens_call');
    S.kraken.ev = null; S.deck.kraken = K0;
    // nothing is struck at the play: the deep rises on sim time
    out.untouched = H.every(h => h.hp === 5000) && ships.every(s => s.hp > 0);
    // a save mid-act, with the first ship rising (the map's acts wait out the
    // sky's moment: the first rises at FIRST, 2.8s — this is 3.2s in)
    for (let i = 0; i < 64; i++) Deck.krakenTick(0.05);
    G.loadJSON(G.saveJSON());
    out.midSave = !!S.deck.kraken && S.deck.kraken.acts[0].phase === 'rise';
    // what is seen: the deep where it rises
    G.updateVisibility();
    const a0 = S.deck.kraken.acts[0];
    out.seen = G.visibleAt(a0.x | 0, a0.y | 0);
    const bd2 = Bld.damage;
    Bld.damage = function (bb, amt, cause) { causes.add(String(cause)); return bd2.apply(this, arguments); };
    __rv.sea_done();
    out.rngAct = S.rngState === rngPlay;
    Bld.damage = bd;
    const live = id => S.units.some(u => u.id === id);
    out.sunk = ships.map(s => s.kind + (live(s.id) ? '' : '†')).join(',');
    out.pondBoat = live(pondBoat.id); out.ours = live(ours.id);
    const hb = id => { const z = Bld.get(id); return z ? 5000 - z.hp : 'gone'; };
    out.hb = [hb(H[0].id), hb(H[1].id), hb(H[2].id), hb(H[3].id)];
    out.pondHut = hb(pondHut.id); out.own = hb(own.id); out.mine = hb(mine.id);
    out.hutGone = !S.buildings.some(z => z.id === hut.id);
    const tcA = Bld.tcOf('A');
    out.hall = { hp: tcA && tcA.hp, max: tcA && tcA.maxhp, over: !!S.over };
    out.kills = S.stats.kills - kills0; out.razed = S.stats.razed - razed0;
    out.slain = S.stats.krakenSlain === slain0; out.world = JSON.stringify(S.kraken) === kr0 && S.specialDay === sd0;
    out.causes = [...causes].join(',');
    out.used = n0 - Deck.count('krakens_call');
    out.cleared = S.deck.kraken === null;
    /* AT WAR, ASKED OF WHAT YOU KNOW: knowing of nothing the card comes back
       — and in the SAME words whether the hidden sea is empty or holds a
       hull, or the refusal is a free probe of the fog (the naive plan, which
       asked the live sea, would have played on the hidden hull) */
    const war = (hull) => {
      __rv.fresh('rv-kr2'); const e2 = __rv.flat(false); e2.A.x = 30; e2.A.y = 4; Bld._block = null; __rv.sea(27);
      const h = hull ? __rv.unit('fishboat', 'A', 28.5, 31.5) : null;
      G.updateVisibility();
      const n2 = Deck.count('krakens_call');
      const fx = Deck.FX.krakens_call;
      const o = { hidden: h ? !G.visibleAt(28, 31) : null, focus: fx.focus(), naive: fx.targets().ships.length };
      o.res = Deck.play('krakens_call');
      o.kept = Deck.count('krakens_call') === n2 && !S.deck.kraken && (!h || h.hp === h.maxhp);
      return o;
    };
    out.empty = war(false);
    out.hiddenHull = war(true);
    // …knowing of something that is GONE, it is played and comes up empty —
    // spent, as a strike aimed at a ghost is
    __rv.fresh('rv-kr3'); const e3 = __rv.flat(false); e3.A.x = 30; e3.A.y = 4; Bld._block = null; __rv.sea(27);
    S.map.seenB[MapGen.idx(12, 25)] = { key: 'house', level: 1, owner: 'A' };   // remembered by the water; razed since
    const hid = __rv.unit('fishboat', 'A', 28.5, 31.5);                          // a hull the fog hides
    G.updateVisibility();
    const n3 = Deck.count('krakens_call'), fx3 = Deck.FX.krakens_call;
    out.ghost = { focus: fx3.focus(), naiveFocus: (() => { const t = fx3.targets(); return t.ships[0] ? { x: t.ships[0].x, y: t.ships[0].y } : null; })() };
    out.ghost.res = Deck.play('krakens_call');
    out.ghost.spent = Deck.count('krakens_call') === n3 - 1;
    // the hidden hull is gone too (the war is on: the deep takes what is really there)
    S.units = S.units.filter(u => u.id !== hid.id);
    const top = S.log[0];
    __rv.sea_done();
    out.ghost.over = __rv.since(top).some(l => /nothing to show for it/.test(l.msg));
    return out;
  });
  ck('itNeedsOpenWater', !r.dry.ok && r.dry.why === 'Needs open water' && !r.pond.ok && r.pond.why === 'Needs open water' && r.open.ok,
    `dry "${r.dry.why}", a pond "${r.pond.why}", the sea ${r.open.ok}`);
  ck('upToFourShipsWarshipsFirst', r.play.ok && r.c.target === 'none' && r.acts.join(',') === 'fireship,fireship,bombard,transport' &&
    r.sunk === 'fishboat,transport†,fireship†,bombard†,fishboat,fireship†' && r.pondBoat && r.ours,
    `taken in turn ${r.acts.join(', ')}; after: ${r.sunk}; the pond's boat ${r.pondBoat}, ours ${r.ours}`);
  ck('theWorldsAnswerIsNeverAsked', r.sunk.split(',').filter(s => s === 'fireship†').length === 2, 'two warships side by side both go down');
  ck('itBattersTheirShore600', JSON.stringify(r.hb) === JSON.stringify([600, 600, 600, 0]) && r.pondHut === 0 && r.own === 0 && r.mine === 0 && r.hutGone,
    `houses at d 0/1/2/3: ${r.hb.join('/')}; by a pond ${r.pondHut}; ours ${r.own}; the mine ${r.mine}; a hut razed ${r.hutGone}`);
  ck('aRivalHallNeverFallsToTheKraken', r.hall.hp === 300 && r.hall.max === 500 && !r.hall.over,
    `an L1 hall ${r.hall.max} → ${r.hall.hp} (a naive 600 razes it and ends the run)`);
  ck('itStrikesInItsOwnNameNeverTheWilds', r.causes === 'kraken', r.causes);
  ck('killsAndRazesAreCreditedNoTaleIsTold', r.kills === 4 && r.razed === 1 && r.slain && r.world,
    `kills +${r.kills}, razed +${r.razed}; krakenSlain untouched ${r.slain}; the world's kraken and specialDay untouched ${r.world}`);
  ck('theActIsSeenAndRidesTheSave', r.untouched && r.midSave && r.seen && r.cleared && r.used === 1,
    `nothing at the play ${r.untouched}; mid-act save ${r.midSave}; in sight ${r.seen}`);
  ck('oneKrakenAtATime', !r.risen.ok && /still risen/.test(r.risen.why) && !r.stirring.ok && /already stirring/.test(r.stirring.why),
    `"${r.risen.why}" / "${r.stirring.why}"`);
  ck('atWarItIsAskedOfWhatYouKnow', !r.empty.res.ok && /know of nothing/.test(r.empty.res.why) && r.empty.kept &&
    r.hiddenHull.hidden && !r.hiddenHull.res.ok && r.hiddenHull.res.why === r.empty.res.why && r.hiddenHull.kept && r.hiddenHull.naive === 1,
    `"${r.empty.res.why}" — the same with a hidden hull ${r.hiddenHull.res.why === r.empty.res.why} (the naive plan would have played on it: ${r.hiddenHull.naive})`);
  ck('aKnownGhostPlaysAndComesUpEmpty', r.ghost.res.ok && r.ghost.spent && r.ghost.over,
    `played ${r.ghost.res.ok}, spent ${r.ghost.spent}, said empty ${r.ghost.over}`);
  ck('theBurstLandsOnlyOnWhatYouKnow', r.hiddenHull.focus === null && r.empty.focus === null && r.ghost.focus && Math.abs(r.ghost.focus.x - 12.5) < 1e-9 && Math.abs(r.ghost.focus.y - 25.5) < 1e-9 &&
    r.ghost.naiveFocus && r.ghost.naiveFocus.x === 28.5,
    `hidden hull only → ${JSON.stringify(r.hiddenHull.focus)}; a known ghost → ${JSON.stringify(r.ghost.focus)} (the naive pick: the hidden hull at ${JSON.stringify(r.ghost.naiveFocus)})`);
  ck('andTheKrakenDrawsNoRng', r.rng && r.rngAct, `at the play ${r.rng}, through the whole act ${r.rngAct}`);
}

// …and THE TRUCE: asked of what the player knows
{
  const r = await p.evaluate(() => {
    const out = {};
    const setup = (seen) => {
      __rv.fresh('rv-kt', 'calm'); const { P, A } = __rv.flat(false);
      __rv.sea(27);
      A.x = 30; A.y = 4; Bld._block = null;
      const boat = __rv.unit('fireship', 'A', 20.5, 28.5);
      if (seen) __rv.unit('rider', 'P', 20.5, 26.5);
      G.updateVisibility();
      return boat;
    };
    // a rival hull in sight: warned, and the truce ends AT THE PLAY
    let boat = setup(true);
    out.visible = G.visibleAt(20, 28);
    out.warn = Deck.FX.krakens_call.warn();
    let peaceAtApply = null;
    const bp = G.breakPeace;
    G.breakPeace = function () { peaceAtApply = { hp: boat.hp, kraken: !!S.deck.kraken }; return bp.apply(this, arguments); };
    try { out.play = Deck.play('krakens_call'); } finally { G.breakPeace = bp; }
    out.broken = S.peace === false;
    out.before = peaceAtApply;
    __rv.sea_done();
    out.took = !S.units.some(u => u.id === boat.id);
    // the same hull hidden: no warning, the truce holds, the card is kept
    boat = setup(false);
    out.hidden = !G.visibleAt(20, 28);
    out.quiet = Deck.FX.krakens_call.warn();
    const n = Deck.count('krakens_call');
    out.refused = Deck.play('krakens_call');
    out.kept = Deck.count('krakens_call') === n && S.peace === true && boat.hp === boat.maxhp;
    // …seen through a spy at their fire it is KNOWN, and warned of
    Deck.play('spy_hall');
    out.spyWarn = Deck.FX.krakens_call.warn();
    // …and a remembered building by the water counts too
    boat = setup(false);
    const hut = __rv.bld('A', 'house', 12, 25);
    S.map.seenB[MapGen.idx(12, 25)] = { key: 'house', level: 1, owner: 'A' };
    out.memWarn = Deck.FX.krakens_call.warn();
    out.TRUCE = Deck.TRUCE;
    // the deck's own play asks twice for a card that would end the truce
    return out;
  });
  ck('aKnownHullWarnsAndTheTruceEndsAtThePlay', r.visible && r.warn === r.TRUCE && r.play.ok && r.broken && r.before && r.before.kraken === false && r.took,
    `warned "${r.warn}"; peace broken before the deep rose ${JSON.stringify(r.before)}; the hull taken ${r.took}`);
  ck('aHiddenRivalNeitherWarnsNorBreaksThePeace', r.hidden && r.quiet === null && !r.refused.ok && /truce holds/.test(r.refused.why) && r.kept,
    `warn ${r.quiet}; "${r.refused.why}"; kept, peace and hull whole ${r.kept}`);
  ck('whatASpySeesOrTheMemoryHoldsIsKnown', r.spyWarn === r.TRUCE && r.memWarn === r.TRUCE, `spy ${!!r.spyWarn}, memory ${!!r.memWarn}`);
}

// …and the deck itself asks twice before an untargeted card ends the truce
{
  const r1 = await p.evaluate(() => {
    __rv.fresh('rv-ui', 'calm'); const { P, A } = __rv.flat(false);
    __rv.sea(27); A.x = 30; A.y = 4; Bld._block = null;
    __rv.unit('fireship', 'A', 20.5, 28.5);
    __rv.unit('rider', 'P', 20.5, 26.5);
    G.updateVisibility();
    Screens.show('playing'); S.paused = false;
    const n = Deck.count('krakens_call');
    DeckUI.play('krakens_call');
    const first = { armed: !!DeckUI._armed, kept: Deck.count('krakens_call') === n, peace: S.peace === true, running: !!DeckUI.playing };
    DeckUI.play('krakens_call');
    return { first, n, running: !!DeckUI.playing };
  });
  let landed = true;
  await p.waitForFunction(() => S.peace === false && !!S.deck.kraken, null, { timeout: 10000 }).catch(() => { landed = false; });
  const r2 = await p.evaluate(() => { const o = { n: Deck.count('krakens_call'), peace: S.peace }; S.paused = true; return o; });
  ck('theDeckAsksTwiceBeforeTheTruceEnds', r1.first.armed && r1.first.kept && r1.first.peace && !r1.first.running && r1.running && landed && r2.n === r1.n - 1 && r2.peace === false,
    `first tap: armed ${r1.first.armed}, card kept ${r1.first.kept}, peace ${r1.first.peace}; second tap plays ${r1.running}; landed ${landed}, ${r1.n} → ${r2.n} cards`);
}

// …and a confirm the player walked away from is no confirm: arm it, put the
// card back, lift it again — ONE tap must warn again, never play
{
  const r = await p.evaluate(async () => {
    const wait = ms => new Promise(f => setTimeout(f, ms));
    __rv.fresh('rv-ui2', 'calm'); const { A } = __rv.flat(false);
    __rv.sea(27); A.x = 30; A.y = 4; Bld._block = null;
    __rv.unit('fireship', 'A', 20.5, 28.5);
    __rv.unit('rider', 'P', 20.5, 26.5);
    G.updateVisibility();
    Screens.show('playing'); S.paused = false;
    const n = Deck.count('krakens_call');
    const cell = () => document.querySelector('#dkSheet .dkCell[data-card="krakens_call"]');
    if (!DeckUI.open) DeckUI.openSheet();
    await wait(60);
    cell().click(); await wait(60);
    document.querySelector('#dkInsp .dkPlay').click();          // armed: "Confirm"
    const armed = !!DeckUI._armed && /Confirm/.test(document.querySelector('#dkInsp .dkPlay').textContent);
    DeckUI.putBack(true);                                          // …put back
    cell().click(); await wait(60);                                // …lifted again
    const label = document.querySelector('#dkInsp .dkPlay').textContent;
    document.querySelector('#dkInsp .dkPlay').click();            // one tap
    await wait(120);
    const o = { armed, label, playing: !!DeckUI.playing, kept: Deck.count('krakens_call') === n, peace: S.peace === true, rearmed: !!DeckUI._armed };
    DeckUI.putBack(true); if (DeckUI.open) DeckUI.closeSheet();
    S.paused = true;
    return o;
  });
  ck('aConfirmPutBackIsNoConfirm', r.armed && !/Confirm/.test(r.label) && !r.playing && r.kept && r.peace && r.rearmed,
    `armed ${r.armed}; lifted again it reads "${r.label}"; one tap: playing ${r.playing}, kept ${r.kept}, peace ${r.peace}, warned again ${r.rearmed}`);
}

// ---------------- 8. THE PICTURE ----------------
{
  const r = await p.evaluate(() => {
    const out = {};
    __rv.fresh('rv-draw'); const { P, A } = __rv.flat(false);
    __rv.sea(28);
    A.x = 20; A.y = 24; Bld._block = null; G._wb = null;
    __rv.bld('A', 'house', 16, 26);
    __rv.unit('fireship', 'A', 14.5, 31.5);
    __rv.unit('villager', 'A', 22.5, 20.5);
    S.relic = { key: 'aqueduct', x: 8, y: 16, w: 4, h: 2, found: 0, amount: 0 };
    G.updateVisibility();
    R.rebuildTerrain();
    Screens.show('playing');
    R.centerOn(14, 18);
    // NOTHING IS DRAWN with no card in play: the world pass is never entered
    let world = 0; const dcw = R.drawCardWorld;
    R.drawCardWorld = function () { world++; return dcw.apply(this, arguments); };
    R.cardShows.length = 0; R.summons.length = 0;
    try { for (let i = 0; i < 3; i++) R.draw(1 / 30); } finally { R.drawCardWorld = dcw; }
    out.idle = world;
    // each card's moment, through the real frame and at chosen p
    const P_ = [0.02, 0.1, 0.25, 0.45, 0.6, 0.8, 0.97];
    const shows = {};
    const tryDraw = (id) => {
      const s = R.cardShows.find(z => z.id === id);
      if (!s) return 'no show';
      const sh = Deck.FX[id].show, layers = sh.layers || [sh.layer || 'world'];
      for (const pp of P_) {
        s.t = pp * s.ms / 1000;
        for (const L of layers) { R.g.save(); try { sh.draw.call(Deck.FX[id], R.g, s, pp, 1 / 30, L); } catch (e) { R.g.restore(); return String(e); } R.g.restore(); }
      }
      s.t = 0;
      try { for (let i = 0; i < 20; i++) R.draw(1 / 30); } catch (e) { return String(e); }
      return 'ok';
    };
    Deck.play('scouts_fire', { x: 20.5, y: 12.5 }); shows.scouts_fire = tryDraw('scouts_fire');
    Deck.play('pathfinders_map'); shows.pathfinders_map = tryDraw('pathfinders_map');
    Deck.play('spy_hall'); shows.spy_hall = tryDraw('spy_hall');
    Deck.play('barbarian_pact');
    { // the signal fire burns BESIDE the hall, never on its roof (a burning building is the one unprompted alarm)
      const ps = R.cardShows.find(z => z.id === 'barbarian_pact'), tcP = Bld.tcOf('P');
      out.fireBeside = !!ps && ps.fx != null && !Bld.covers(tcP, Math.floor(ps.fx), Math.floor(ps.fy)) &&
        Math.hypot(ps.fx - Bld.cx(tcP), ps.fy - Bld.cy(tcP)) < 2.5;
    }
    shows.barbarian_pact = tryDraw('barbarian_pact');
    Deck.pactTurned('wolf', 3); shows.pact_turn = tryDraw('barbarian_pact');
    Deck.play('swallowed_sun'); shows.swallowed_sun = tryDraw('swallowed_sun');
    Deck.play('krakens_call'); shows.krakens_call = tryDraw('krakens_call');
    out.shows = shows;
    // the running looks: the watch fire, the spied, the dusk and the black sun, the kraken's act
    let live = null;
    try { for (let i = 0; i < 90; i++) { R.draw(1 / 30); Deck.krakenTick(1 / 30); } } catch (e) { live = String(e); }
    out.live = live;
    // every drawLive at once, by hand, with no show in the way
    R.cardShows.length = 0;
    const lives = {};
    for (const id of ['scouts_fire', 'spy_hall', 'swallowed_sun']) {
      const e = Deck.timed(id);
      try { R.g.save(); Deck.FX[id].drawLive(R.g, e, 1 / 30); R.g.restore(); lives[id] = 'ok'; } catch (err) { lives[id] = String(err); }
    }
    out.lives = lives;
    // ONE kraken drawing: the card's act and the world's event both go through
    // it — R.drawKrakenAct where the beast art (js/beasts.js) has landed, else
    // R.drawKraken; either answers, so the pin survives the art landing
    let dk = 0; const dkF = R.drawKraken, dkA = R.drawKrakenAct;
    R.drawKraken = function () { dk++; return dkF.apply(this, arguments); };
    if (dkA) R.drawKrakenAct = function () { dk++; return dkA.apply(this, arguments); };
    try {
      const K = S.deck.kraken;
      if (K && K.acts[0]) { K.acts[0].phase = 'thrash'; K.acts[0].t = 0.2; G.vis[MapGen.idx(K.acts[0].x | 0, K.acts[0].y | 0)] = 1; }
      R.draw(1 / 30);
      const viaCard = dk;
      S.kraken.ev = { phase: 'thrash', t: 0.3, x: 14.5, y: 31.5, owner: 'P', boatId: -1 };
      G.vis[MapGen.idx(14, 31)] = 1;
      R.draw(1 / 30);
      out.drawKraken = { card: viaCard, world: dk - viaCard };
      S.kraken.ev = null;
    } finally { R.drawKraken = dkF; if (dkA) R.drawKrakenAct = dkA; }
    // ONE BEAST TO A CLUSTER: two hulls side by side are one beast and an
    // arm (the naive draw raised a body per act — two half-stacked beasts)
    {
      const fx = Deck.FX.krakens_call;
      const mk = (id, x, y) => ({ id, x, y, at: 0, phase: 'thrash', t: 0.3 });
      const K = { t: 3, n: 1, hit: true, took: 0, struck: 0, razed: 0, acts: [mk(9001, 14.5, 31.5), mk(9002, 16, 31.5), mk(9003, 26.5, 31.5)], coast: [] };
      for (const a of K.acts) G.vis[MapGen.idx(a.x | 0, a.y | 0)] = 1;
      let body = 0, arm = 0; const dkF2 = R.drawKraken, dkA2 = R.drawKrakenAct, gr = fx.grab;
      R.drawKraken = function () { body++; return dkF2.apply(this, arguments); };
      if (dkA2) R.drawKrakenAct = function () { body++; return dkA2.apply(this, arguments); };
      fx.grab = function () { arm++; return gr.apply(this, arguments); };
      try { R.g.save(); fx.draw(R.g, 1 / 30, K); R.g.restore(); } finally { R.drawKraken = dkF2; if (dkA2) R.drawKrakenAct = dkA2; fx.grab = gr; }
      // …and the beast art's own act drawing is asked first where it has landed
      let viaAct = 0; const had = R.drawKrakenAct;
      R.drawKrakenAct = function () { viaAct++; };
      try { R.g.save(); fx.draw(R.g, 1 / 30, Object.assign({}, K, { acts: K.acts.map(a => Object.assign({}, a)) })); R.g.restore(); }
      finally { if (had) R.drawKrakenAct = had; else delete R.drawKrakenAct; }
      out.cluster = { body, arm, act: viaAct };
    }
    out.inS = /cardShows|_sky|silhouette|_host|head/.test(JSON.stringify(S.deck));
    return out;
  });
  ck('nothingIsDrawnWithNoCardInPlay', r.idle === 0, `the card world pass entered ${r.idle} times`);
  ck('everyShowDrawsAtEveryBeat', Object.values(r.shows).every(v => v === 'ok'), JSON.stringify(r.shows));
  ck('everyRunningLookDraws', !r.live && Object.values(r.lives).every(v => v === 'ok'), r.live || JSON.stringify(r.lives));
  ck('thePactsSignalFireBurnsBesideTheHall', r.fireBeside);
  ck('theKrakenIsDrawnInOnePlace', r.drawKraken.card > 0 && r.drawKraken.world > 0, JSON.stringify(r.drawKraken));
  ck('oneBeastToACluster', r.cluster.body === 2 && r.cluster.arm === 1 && r.cluster.act === 2,
    `three hulls, two of them side by side: ${r.cluster.body} bodies and ${r.cluster.arm} arm (the naive draw: 3 bodies); with the beast art, its act drawing is asked ${r.cluster.act} times`);
  ck('theShowsAreRenderStateOnly', !r.inS);
}

for (const [k, v] of Object.entries(res)) console.log((v.startsWith('PASS') ? ' ' : '✗') + ' ' + k + ': ' + v);
if (errs.length) console.log('PAGE ERRORS:', errs.slice(0, 6));
await b.close();
if (fails.length || errs.length) { console.log('FAILURES:', fails.join(', ') || 'pageerrors'); process.exit(1); }
console.log('ALL DECK-RIVAL CHECKS PASS');
