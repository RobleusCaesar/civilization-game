/* SPECIAL EVENTS CONTRACT — the registry, the roll, and each event's gate
   (audit EVT-01..V04, EVD-V01..V03). Before this file nothing in tests/
   touched CFG.SPECIALS or any maybe* trigger, and the measured state was:
   two thirds of runs rolled nothing, the dragon and kraken were each armed
   in ~4-14% of games, the kraken spent its one visit on a rival boat
   off-screen half the time, and the Buried Cache never fired once in 24
   force-armed games. What this file pins:

     1. THE ROLL: draws the same three G.rand numbers whatever it rolls (so
        the cards and the start package never re-deal by outcome), is a pure
        function of the seed, picks by WEIGHT (dragon 3, kraken 3, the rest
        1), lands an event in about `chance` of runs, and never rolls an
        event the map cannot stage (NO DEAD ROLLS — G.specialElig).
     2. THE KRAKEN: the player's alone; any own hull on OPEN water (edge-
        connected or a big inland body); DELAY days after the first launch;
        the boat is held for the rise; the player keeps sight of the spot
        after the boat is gone; the fighting hulls answer it; one toast.
     3. THE SONS ride in where they can ride HOME from; THE CACHE fires on
        one empty basket (not two at once) and is buried where a villager
        can walk; THE PLAGUE's earliest day is hashed off the seed.
     4. Every event feeds a score line (HANDOFF's rule) and the run report
        carries which event, whether it fired and when.
     5. Saves round-trip the new state; an older save is backfilled.

     node tests/specials.mjs      # exits non-zero on any regression */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: 430, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_FILE_NOT_FOUND')) errs.push('console: ' + m.text()); });
await p.goto('file://' + join(root, 'index.html'), { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.Screens && Screens.current === 'title', null, { timeout: 120000 });

const out = await p.evaluate(() => {
  const res = {}, fails = [];
  const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };
  Boot.force(); Screens._demo = false;
  const W = () => CFG.W, H = () => CFG.H;
  const fresh = (seed, mode, size) => { G.newGame(seed, mode || 'moderate', size || 'medium'); S.paused = true; return S; };
  // a flat, fully-known world: every rule below is measured on ground the
  // test built, so no seed can flatter it
  const flat = () => {
    for (let i = 0; i < W() * H(); i++) { S.map.terrain[i] = T.GRASS; S.map.explored[i] = 1; }
    S.units = []; S.buildings = S.buildings.filter(z => z.key === 'tc'); Bld._block = null;
    G._wb = null;
  };
  const water = (x0, y0, x1, y1) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++)
      if (MapGen.inB(x, y)) S.map.terrain[y * W() + x] = T.WATER;
    Bld._block = null; G._wb = null;
  };
  const homeReach = () => Path.reachFrom(Units.homeSteps('P').map(i => ({ x: i % W(), y: (i / W()) | 0 })));
  const toasts = [];
  const tw = UI.toast; UI.toast = function (m, warn) { if (warn) toasts.push(m); return tw.apply(this, arguments); };

  try {
    // ---------------- 1. THE ROLL ----------------
    {
      const keep = CFG.SPECIALS.chance;
      let differ = 0, n = 0;
      for (let i = 0; i < 30; i++) {
        CFG.SPECIALS.chance = 0; fresh('spx-' + i); const a = S.rngState, sa = S.special;
        CFG.SPECIALS.chance = 1; fresh('spx-' + i); const bb = S.rngState, sb = S.special;
        n++; if (a !== bb || sa !== null || !sb) differ++;
      }
      CFG.SPECIALS.chance = keep;
      ck('theRollDrawsTheSameWhateverItRolls', differ === 0, n + ' seeds, rng state after newGame differs between "nothing" and "something" on ' + differ);

      fresh('spx-det'); const one = [S.special, S.kraken.delay, S.plague.from];
      fresh('spx-det'); const two = [S.special, S.kraken.delay, S.plague.from];
      ck('andIsAPureFunctionOfTheSeed', JSON.stringify(one) === JSON.stringify(two), JSON.stringify(one));

      // the weights, read off the pick itself with every event stageable
      const el = G.specialElig; G.specialElig = () => true;
      const tally = {}; const N = 2000;
      for (let i = 0; i < N; i++) { const k = G.pickSpecial('moderate', 0, (i + 0.5) / N); tally[k] = (tally[k] || 0) + 1; }
      const calm = {}; for (let i = 0; i < N; i++) { const k = G.pickSpecial('calm', 0, (i + 0.5) / N); calm[k] = (calm[k] || 0) + 1; }
      const none = G.pickSpecial('moderate', CFG.SPECIALS.chance, 0.5);
      G.specialElig = el;
      const sh = k => (tally[k] || 0) / N;
      // every share is its weight over the mode's whole pool — derived from
      // CFG, so an event added to the pool re-measures itself here
      const want = (mode) => { const P = CFG.SPECIALS.pool, ks = Object.keys(P).filter(k => P[k].modes.includes(mode));
        const tot = ks.reduce((a, k) => a + (P[k].w || 1), 0); const o = {}; for (const k of ks) o[k] = (P[k].w || 1) / tot; return o; };
      const wm = want('moderate'), wc = want('calm');
      ck('theSpectaclesCarryThreeTimesTheWeight',
        CFG.SPECIALS.pool.dragon.w === 3 && CFG.SPECIALS.pool.kraken.w === 3 &&
        Object.keys(wm).every(k => Math.abs(sh(k) - wm[k]) < 0.002) && Object.keys(tally).every(k => wm[k]) &&
        Object.keys(wc).every(k => Math.abs((calm[k] || 0) / N - wc[k]) < 0.002) && !calm.dragon && none === null,
        'moderate ' + JSON.stringify(tally) + ' calm ' + JSON.stringify(calm));

      // the rate, through the real newGame
      let armed = 0, spect = 0; const M = 160;
      for (let i = 0; i < M; i++) { fresh('sprate-' + i); if (S.special) { armed++; if (S.special === 'dragon' || S.special === 'kraken') spect++; } }
      ck('aboutChanceOfRunsRollAnEvent', armed / M > 0.34 && armed / M < 0.56 && spect / Math.max(1, armed) > 0.33,
        armed + '/' + M + ' armed (' + Math.round(100 * armed / M) + '%, chance ' + CFG.SPECIALS.chance + '), ' + spect + ' of them the dragon or the kraken (weight 3 each; a uniform pick over the pool would give about a quarter)');
    }

    // ---------------- 1b. NO DEAD ROLLS ----------------
    {
      fresh('spx-elig'); flat();
      const tc = Bld.tcOf('P'), cx = tc.x, cy = tc.y;
      const dry = G.specialElig('kraken');
      water(cx + 4, cy - 1, cx + 6, cy + 1);                 // a 9-tile pond at the door
      const pond = G.specialElig('kraken');
      water(cx + 4, cy - 4, cx + 13, cy + 4);                // grown into a 90-tile lake
      const lake = G.specialElig('kraken');
      flat(); water(cx + 30, cy - 5, cx + 40, cy + 5);       // the same lake far from home
      const far = G.specialElig('kraken');
      flat(); water(0, 0, Math.min(W() - 1, cx - 5), H() - 1);   // the open sea, reaching the rim
      const sea = G.specialElig('kraken');
      let rolled = 0; flat();
      for (let i = 0; i < 400; i++) if (G.pickSpecial('calm', 0, i / 400) === 'kraken') rolled++;
      ck('noRollIsDeadOnArrival', !dry && !pond && lake && !far && sea && rolled === 0,
        JSON.stringify({ dry, pond, lake, far, sea, krakenRolledOnADryMap: rolled }));
    }

    // ---------------- 2. THE KRAKEN ----------------
    {
      fresh('spx-kraken'); flat();
      const tc = Bld.tcOf('P');
      water(0, 0, tc.x - 8, H() - 1);                       // open sea to the west, edge-connected
      const sx = tc.x - 13, sy = tc.y;
      S.special = 'kraken';
      S.kraken = { avail: true, done: {}, ev: null, launch: 0, day: 0, delay: 5 };
      S.day = 40;
      const rival = Units.spawn('fishboat', 'A', sx - 2, sy + 3);
      G.specialsDaily();
      const ignoresRival = !S.kraken.launch && !S.kraken.ev;
      const raft = Units.spawn('transport', 'P', sx, sy);
      G.specialsDaily();
      const launched = S.kraken.launch === 40 && S.kraken.day === 45;
      S.day = 44; G.specialsDaily(); const early = !S.kraken.ev;
      S.day = 45; G.specialsDaily();
      const ev = S.kraken.ev;
      const tookRaft = !!ev && ev.boatId === raft.id && ev.owner === 'P' && !!Units.get(rival.id);
      ck('theKrakenIsThePlayersAndComesAfterTheLaunch', ignoresRival && launched && early && tookRaft && S.specialDay === 45,
        JSON.stringify({ ignoresRival, launched, early, tookRaft, specialDay: S.specialDay }));

      // the boat is held; if it moves anyway the deep follows it
      raft.path = [{ x: sx - 4, y: sy }];
      G.krakenTick(0.4);
      const held = raft.path === null;
      raft.x += 1.5; G.krakenTick(0.4);
      const follows = Math.abs(ev.x - raft.x) < 1e-6;
      toasts.length = 0;
      G.krakenTick(1.0);                                     // past the rise: the raft goes under
      const gone = !Units.get(raft.id);
      G.updateVisibility();
      const watched = G.visibleAt(ev.x | 0, ev.y | 0);
      const said = toasts.filter(m => /kraken/i.test(m));
      const noEcho = !toasts.some(m => /was killed/.test(m));
      ck('theBoatIsHeldAndTheSpotStaysInSight', held && follows && gone && watched && said.length === 1 && noEcho,
        JSON.stringify({ held, follows, gone, watched, toasts }));
      G.krakenTick(5); G.krakenTick(5);
      ck('andItComesOncePerGame', !S.kraken.ev && !S.kraken.avail && S.kraken.done.P, JSON.stringify(S.kraken));

      // the fleet answers: a fire warship and a bombard within reach
      S.units = []; S.stats.krakenSlain = 0;
      const fb = Units.spawn('fishboat', 'P', sx, sy);
      const f1 = Units.spawn('fireship', 'P', sx + 2, sy + 4);
      const f2 = Units.spawn('bombard', 'P', sx - 3, sy - 4);
      S.kraken = { avail: true, done: {}, ev: null, launch: 30, day: 30, delay: 5 };
      S.day = 50; G.specialsDaily();
      const victim = S.kraken.ev && S.kraken.ev.boatId === fb.id;
      toasts.length = 0;
      G.krakenTick(2.0); G.krakenTick(2.5);
      ck('andTheFightingHullsAnswerIt', victim && S.stats.krakenSlain === 1 && !!Units.get(f1.id) && !!Units.get(f2.id) &&
        toasts.some(m => /drive the kraken back/.test(m)),
        JSON.stringify({ victim, slain: S.stats.krakenSlain, toasts }));
    }

    // ---------------- 3. THE SONS, THE CACHE, THE PLAGUE ----------------
    const breach = () => {
      S.playtime = 400; S.breachedP = true; S.day = 40;
      S.units = S.units.filter(u => !(u.owner === 'P' && Units.isMilitary(u)));
    };
    {
      // home sits inside a moat of sea: no stretch of the border joins it
      fresh('spx-sons'); flat();
      const tc = Bld.tcOf('P'), cx = Bld.cx(tc) | 0, cy = Bld.cy(tc) | 0;
      for (let y = cy - 9; y <= cy + 9; y++) for (let x = cx - 9; x <= cx + 9; x++)
        if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) === 9) water(x, y, x, y);
      breach();
      for (let i = 0; i < 4; i++) Units.spawn('defender', 'A', cx + 3, cy - 3 + i);
      S.special = 'sons'; S.sons = { avail: true, done: false };
      G.maybeSons();
      const reach = homeReach();
      const riders = S.units.filter(u => u.owner === 'P' && u.kind === 'rider');
      const home = riders.filter(u => reach[(u.y | 0) * W() + (u.x | 0)]).length;
      ck('theSonsRideInWhereTheyCanRideHome', riders.length === 5 && home === 5 && S.stats.sonsAnswered === 1,
        riders.length + ' riders, ' + home + ' on ground joined to the hall');
    }
    {
      fresh('spx-cache'); flat(); breach();
      S.special = 'cache';
      S.cache = { avail: true, done: false, ev: null };
      S.res.food = 500; S.res.wood = 500; G.maybeCache();
      const fullBaskets = !S.cache.ev;
      S.res.food = 500; S.res.wood = 10; G.maybeCache();
      const ev = S.cache.ev;
      const reach = homeReach();
      const walkable = !!ev && !!reach[ev.y * W() + ev.x];
      const v = Units.spawn('villager', 'P', ev ? ev.x : 1, ev ? ev.y : 1);
      v.x = ev.x + 0.5; v.y = ev.y + 0.5;
      const before = S.res.stone;
      G.maybeCache();
      ck('theCacheAnswersOneEmptyBasketWhereAHandCanWalk',
        fullBaskets && walkable && S.cache.done && S.res.stone === before + 300 && S.stats.cacheDug === 1 && S.specialDay === 40,
        JSON.stringify({ fullBaskets, ev, walkable, done: S.cache.done, dug: S.stats.cacheDug }));

      // and an unreachable bury spot is refused: wall the town in with water
      fresh('spx-cache2'); flat(); breach();
      const tc = Bld.tcOf('P'), cx = Bld.cx(tc) | 0, cy = Bld.cy(tc) | 0;
      for (let y = cy - 3; y <= cy + 3; y++) for (let x = cx - 3; x <= cx + 3; x++)
        if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) === 3) water(x, y, x, y);
      S.cache = { avail: true, done: false, ev: null }; S.res.food = 0; S.res.wood = 0;
      G.maybeCache();
      ck('andNeverBuriesItWhereNoneCan', !S.cache.ev, JSON.stringify(S.cache.ev));
    }
    {
      const days = []; for (let i = 0; i < 60; i++) days.push(G.plagueFrom('plg-' + i));
      const lo = Math.min(...days), hi = Math.max(...days), distinct = new Set(days).size;
      fresh('spx-plague'); flat();
      const from = S.plague.from;
      S.special = 'plague'; S.plague = { avail: true, done: false, until: 0, lifted: true, from };
      const tc = Bld.tcOf('P');
      for (let i = 0; i < 9; i++) Units.spawn('villager', 'P', tc.x + 3 + (i % 3), tc.y + 3 + ((i / 3) | 0));
      const cap = Bld.popCap; Bld.popCap = () => 9;
      try {
        S.day = from - 1; G.maybePlague(); const waited = !S.plague.done;
        S.day = from; G.maybePlague(); const struck = S.plague.done;
        S.day = S.plague.until; G.specialsDaily();
        ck('thePlagueWaitsForItsOwnDay', lo >= CFG.PLAGUE.from && hi <= CFG.PLAGUE.from + CFG.PLAGUE.spread && distinct > 15 &&
          waited && struck && S.plague.lifted && S.stats.plagueEndured === 1,
          'earliest days over 60 seeds ' + lo + '..' + hi + ' (' + distinct + ' distinct); waited ' + waited + ', struck ' + struck);
      } finally { Bld.popCap = cap; }
    }

    // ---------------- 3b. THE SWALLOWED SUN ----------------
    {
      const days = []; for (let i = 0; i < 80; i++) days.push(G.eclipseDayOf('ecl-' + i));
      const C = CFG.ECLIPSE;
      const bright = days.every(d => d >= C.dayMin && d <= C.dayMax + 12 && (d - 1) % 12 >= 2 && (d - 1) % 12 <= 7);
      ck('theSunIsSwallowedOnABrightDay', bright && new Set(days).size > 30 && G.eclipseDayOf('ecl-3') === days[3],
        'days ' + Math.min(...days) + '..' + Math.max(...days) + ', ' + new Set(days).size + ' distinct, none in the dusk window');

      // unforetold: the village downs tools and the toast says so
      fresh('spx-ecl'); flat();
      S.special = 'eclipse'; S.day = 50;
      S.eclipse = { avail: true, day: 50, warned: false, foretold: false, cut: null, phase: null, t: 0, done: false };
      toasts.length = 0; G.eclipseDaily();
      const unwarned = S.eclipse.phase === 'dim' && S.eclipse.cut.P === true && S.specialDay === 50 && toasts.some(m => /eating the sun/.test(m));
      // in the dark: sight halved (the hall keeps its own), no war band
      const tc = Bld.tcOf('P');
      // soldiers far out of the hall's sight, and what THEY see
      const fx = tc.x < CFG.W / 2 ? CFG.W - 6 : 5, fy = tc.y < CFG.H / 2 ? CFG.H - 6 : 5, sx = fx > 5 ? -9 : 9;
      const posts = []; for (let i = 0; i < 3; i++) { const x = fx + i * sx, y = fy; Units.spawn('defender', 'P', x, y); posts.push([x, y]); }
      G.freeVis = false;
      const seen = () => { G.updateVisibility(); let n = 0;
        for (const [px, py] of posts) for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++)
          if (MapGen.inB(px + dx, py + dy) && G.vis[MapGen.idx(px + dx, py + dy)]) n++;
        return n; };
      S.eclipse.phase = null; const lit = seen();
      S.eclipse.phase = 'dark'; S.eclipse.t = 0; const dark = seen();
      const hallSees = G.visibleAt(tc.x + 5, tc.y);
      S.wave.next = S.day; const waves = S.wave.count; Combat.maybeWave();
      const noWave = S.wave.count === waves;
      ck('anUnwarnedVillageStaresIntoTheDark', unwarned && dark < lit * 0.4 && hallSees && noWave,
        JSON.stringify({ unwarned, lit, dark, hallSees, noWave }));
      // the act plays out and ends on its own
      S.eclipse.phase = 'dim'; S.eclipse.t = 0;
      for (let i = 0; i < 400 && S.eclipse.phase; i++) G.eclipseTick(0.1);
      ck('andTheSunComesBack', S.eclipse.done && G.eclipseDark() === 0 && S.stats.eclipseEndured === 1,
        JSON.stringify({ done: S.eclipse.done, dark: G.eclipseDark() }));

      // foretold: a level-3 Watchtower reads the sky three days ahead and the work goes on
      fresh('spx-ecl2'); flat();
      const tw = Bld.place('P', 'tower', Bld.tcOf('P').x + 3, Bld.tcOf('P').y, { free: true, instant: true });
      tw.level = 3; if (tw.construction > 0) Bld.finish(tw);
      S.eclipse = { avail: true, day: 60, warned: false, foretold: false, cut: null, phase: null, t: 0, done: false };
      toasts.length = 0;
      S.day = 56; G.eclipseDaily(); const early = !S.eclipse.warned;
      S.day = 57; G.eclipseDaily(); const warned = S.eclipse.warned && toasts.some(m => /3 days/.test(m));
      S.day = 60; G.eclipseDaily();
      ck('aWatchtowerForetellsIt', early && warned && S.eclipse.foretold && S.eclipse.cut.P === false && S.eclipse.cut.A === true,
        JSON.stringify({ early, warned, cut: S.eclipse.cut }));
    }

    // ---------------- 3c. THE DRY SUMMER ----------------
    {
      const C = CFG.WILDFIRE;
      const days = []; for (let i = 0; i < 40; i++) days.push(G.fireDayOf('fire-' + i));
      const pure = days.every(d => d >= C.dayMin && d <= C.dayMax) && G.fireDayOf('fire-2') === days[2] && new Set(days).size > 20;
      // eligibility: no wood, no summer; a wood hard by the hall cannot be the site
      fresh('spx-fire'); flat();
      const tc = Bld.tcOf('P'), hx = tc.x, hy = tc.y;
      const wood = (x0, y0, w, h) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { const i = y * CFG.W + x; S.map.terrain[i] = T.FOREST; S.map.resAmount[i] = 100; } };
      const bare = !G.specialElig('wildfire');
      wood(hx + 3, hy - 2, 4, 4);                         // 16 trees, all within 8 of the hall
      const near = !G.specialElig('wildfire');
      flat();
      const ox = hx < CFG.W / 2 ? hx + 10 : hx - 18, oy = Math.max(2, Math.min(CFG.H - 8, hy - 2));
      wood(ox, oy, 8, 5);                                  // the great wood (40 trees)
      wood(ox + 9, oy, 2, 5);                              // across a one-tile firebreak
      const ok = G.specialElig('wildfire');
      ck('aDrySummerNeedsAGreatWood', pure && bare && near && ok, JSON.stringify({ pure, bare, near, ok }));

      // the burn: a house at the wood's edge, the hall far off
      const hb = Bld.place('P', 'house', ox - 1, oy + 2, { free: true, instant: true }); if (hb.construction > 0) Bld.finish(hb);
      const hp0 = hb.hp, razed0 = S.stats.razed, lost0 = (S.workLost && S.workLost.P || []).length;
      S.breachedP = false; S.special = 'wildfire'; S.day = 90;
      S.wildfire = { avail: true, day: 90, warned: true, phase: null, burning: {}, burnt: 0, t: 0, spreadT: 0, wind: [-1, 0], done: false };   // blowing toward the house
      toasts.length = 0; G.fireDaily();
      const lit = S.wildfire.phase === 'burn' && toasts.some(m => /Lightning/.test(m)) && S.specialDay === 90;
      for (let i = 0; i < 2400 && !S.wildfire.done; i++) G.fireTick(0.25);
      const F = S.wildfire;
      let stumps = 0, marked = 0, regrows = 0;
      for (let y = oy; y < oy + 5; y++) for (let x = ox; x < ox + 8; x++) {
        const i = y * CFG.W + x;
        if (S.map.terrain[i] === T.STUMPS) { stumps++; if (S.map.workedBy[i] === 'F') marked++; if (S.map.decay && S.map.decay[i]) regrows++; }
      }
      let across = 0; for (let y = oy; y < oy + 5; y++) for (let x = ox + 9; x < ox + 11; x++) if (S.map.terrain[y * CFG.W + x] === T.FOREST) across++;
      ck('theFireWalksTheWoodAndStopsAtTheBreak', lit && F.done && F.burnt <= C.cap.moderate && stumps === F.burnt && stumps >= 20 && across === 10 && S.stats.wildfireEndured === 1,
        JSON.stringify({ lit, done: F.done, burnt: F.burnt, stumps, across, cap: C.cap.moderate }));
      const houseHit = !S.buildings.includes(hb) || hb.hp < hp0;
      ck('itBurnsAHouseButBlamesNobody', houseHit && S.breachedP === false && S.stats.razed === razed0 &&
        (S.workLost && S.workLost.P || []).length === lost0,
        JSON.stringify({ houseHit, breached: S.breachedP, razed: S.stats.razed - razed0 }));
      let sx = -1, sy = -1;
      for (let y = oy; y < oy + 5 && sx < 0; y++) for (let x = ox; x < ox + 8; x++) if (S.map.terrain[y * CFG.W + x] === T.STUMPS) { sx = x; sy = y; break; }
      const camp = Bld.stationGround('lumber', sx, sy);
      ck('andFireKilledGroundIsNobodysClearing', marked === stumps && regrows === stumps && !camp.ok && /Fire killed/.test(camp.why),
        JSON.stringify({ marked, regrows, stumps, why: camp.why }));

      // Calm burns the wood and spares the town
      fresh('spx-fire2'); flat(); S.mode = 'calm';
      wood(ox, oy, 8, 5);
      const hb2 = Bld.place('P', 'house', ox - 1, oy + 2, { free: true, instant: true }); if (hb2.construction > 0) Bld.finish(hb2);
      const hp2 = hb2.hp;
      S.wildfire = { avail: true, day: S.day, warned: true, phase: null, burning: {}, burnt: 0, t: 0, spreadT: 0, wind: [-1, 0], done: false };
      G.fireDaily();
      for (let i = 0; i < 2400 && !S.wildfire.done; i++) G.fireTick(0.25);
      ck('calmBurnsTheWoodButSparesTheTown', S.wildfire.done && S.wildfire.burnt <= C.cap.calm && hb2.hp === hp2,
        JSON.stringify({ burnt: S.wildfire.burnt, cap: C.cap.calm, hp: hb2.hp + '/' + hp2 }));
    }

    // ---------------- 4. SCORE AND THE RUN REPORT ----------------
    {
      fresh('spx-score');
      const st = S.stats;
      st.sonsAnswered = st.cacheDug = st.winterEndured = st.plagueEndured = st.krakenSlain = st.dragonSeen = st.eclipseEndured = st.wildfireEndured = 1;
      const lines = Score.compute(false).lines.map(l => l.label || l.text || JSON.stringify(l)).join(' | ');
      const C = CFG.SCORE;
      const want = [/kraken/i, /dragon/i, /sons/i, /hoard/i, /winter/i, /plague/i, /swallowed sun/i, /dry summer/i];
      ck('everyEventFeedsAScoreLine', want.every(r => r.test(lines)) && [C.sons, C.cache, C.winter, C.plague].every(n => n > 0), lines);

      S.special = 'winter'; S.specialDay = 0;
      const a = G.runReport('loss', 'probe', false).props;
      S.day = 77; G.specialFired(); S.day = 90; G.specialFired();
      const bb = G.runReport('loss', 'probe', false).props;
      ck('theRunReportSaysWhichEventAndWhen', a.special === 'winter' && a.special_fired === false && a.special_day === null &&
        bb.special_fired === true && bb.special_day === 77, JSON.stringify({ before: a.special, fired: bb.special_fired, day: bb.special_day }));
    }

    // ---------------- 5. SAVES ----------------
    {
      fresh('spx-save');
      S.kraken.launch = 33; S.kraken.day = 41; S.specialDay = 41; S.stats.cacheDug = 1;
      const want = JSON.stringify([S.kraken.delay, S.plague.from]);
      G.loadJSON(G.saveJSON());
      const round = S.kraken.launch === 33 && S.kraken.day === 41 && S.specialDay === 41 && S.stats.cacheDug === 1 &&
        JSON.stringify([S.kraken.delay, S.plague.from]) === want;
      const legacy = JSON.parse(G.saveJSON());
      delete legacy.kraken.delay; delete legacy.kraken.launch; legacy.kraken.day = { P: 60, A: 90 };
      delete legacy.plague.from; delete legacy.specialDay;
      for (const k of ['sonsAnswered', 'cacheDug', 'winterEndured', 'plagueEndured']) delete legacy.stats[k];
      G.loadJSON(JSON.stringify(legacy));
      const back = S.kraken.delay > 0 && S.kraken.launch === 0 && S.kraken.day === 0 && S.plague.from === CFG.PLAGUE.from &&
        S.specialDay === 0 && S.stats.sonsAnswered === 0 && S.stats.cacheDug === 0;
      ck('savesCarryItAndOldSavesAreBackfilled', round && back, JSON.stringify({ round, back }));
    }
  } finally { UI.toast = tw; }
  return { res, fails };
});
console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL SPECIALS CHECKS PASS');
const realErrs = errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e));
console.log('errors:', realErrs);
await b.close();
process.exit(out.fails.length || realErrs.length ? 1 : 0);
