/* THE CARD SYSTEM — the core (js/deck.js): what a card is, who earns one,
   where it is kept, and the one door it is played through.

   This file pins:

     THE CATALOG     36 cards, 8/8/7/7/6 by tier, every one with a name, an
                     exact effect, a flavor line, a play condition, a kind
                     and a targeting rule — exactly the Gate 1 catalog
     THE SWITCH      CFG.CARDS.ON ships false: off, nothing is granted, no
                     starter hand is dealt and nothing can be played
     THE DROPS       the approved tables, each summing to 100; a great
                     victory earns a second card; 15 wins without a legend
                     guarantee one; a measured roll lands on the table it
                     was asked for
     THE EARN RULE   a WIN always earns — a day-31 win at five minutes
                     included; a DEFEAT earns for a real fight, counted in
                     DEEDS (CFG.CARDS.LOSS_DEEDS): a passive Hard run, end to
                     end in the real sim, reads 0 and earns nothing (origin
                     prebuilds, the start package, the tutorial and its
                     larder add nothing); a token effort (one house, one
                     villager) reads 2 and is told how far it got; a
                     scripted player who builds and trains for five minutes
                     on Hard and is razed earns. The two traps the naive
                     tally falls into are pinned on constructed ground: a
                     rival work a barbarian burns, or a camp the RIVAL
                     burns, is no deed of the player's; a fishing boat's
                     nets are no hand-gathering. A struck banner earns
                     nothing; the deeds ride the run report and a save
     ONCE PER RUN    settling the same run twice pays once
     THE COLLECTION  survives a reload, takes the starter hand once,
                     queues every write for the cloud
     THE DOOR        a card is taken only when its effect applies; a refusal
                     hands it back; the run remembers what it played, and
                     S.deck rides a save and backfills an old one
     TIMERS          count game days (a pause freezes them), a second play
                     extends rather than stacks, and expiry runs the end hook
     NO RNG          nothing here draws from the run's seeded stream
     THE FACE        every card face is a whole multiple of device pixels

     THE TEST LINK   ?cards=all turns the deck on for the device and, on
                     every load carrying it, resets the collection and deals
                     one of every card — the starter marked as given; a
                     test deck writes nothing for the cloud; the link is
                     read with the switch thrown on too; ?cards=0 forgets
                     the toy deck with the switch, never a real collection
     THE LESSON      while the tutorial's spine runs the door refuses (the
                     deck is not in the game yet) and the card stays

   Run after touching: js/deck.js, CFG.CARDS, S.deck in game.js, and the
   deeds' tallies — S.stats.handGathered (units.js: the gather and shore-fish
   tasks), S.stats.handRazed (combat.js: Combat.hitBuilding and its two
   callers), G.runReport's deeds props.

     node tests/deck-core.mjs      # exits non-zero on any regression */

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
const url = 'file://' + join(root, 'index.html');
await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.Deck && window.Screens && Screens.current, null, { timeout: 15000 });

const res = {}, fails = [];
const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };

const a = await p.evaluate(() => {
  const out = {};
  const C = Deck.CATALOG;
  const by = {}; for (const c of C) by[c.tier] = (by[c.tier] || 0) + 1;
  out.counts = [by.stone, by.bronze, by.iron, by.imperial, by.enlight].join('/');
  out.total = C.length;
  out.uniq = new Set(C.map(c => c.id)).size;
  out.missing = C.filter(c => !c.name || !c.text || !c.flavor || !c.when || !c.cat || !['none', 'any', 'explored'].includes(c.target) || !Deck.GLYPHS[c.cat]).map(c => c.id);
  out.targeted = C.filter(c => c.target !== 'none').map(c => c.id).sort().join(',');
  // THE SWITCH ships off
  out.shipsOff = CFG.CARDS.ON === false;
  Deck._dev = null; Deck._del('neo-cards-dev');
  out.offOn = Deck.on();
  Deck._col = null; Deck._del(Deck.KEY);
  out.offStarter = Deck.ensureStarter();
  out.offStored = Deck._get(Deck.KEY);
  G.newGame('deckcore', 'moderate', 'medium');
  S.playtime = 900;
  out.offSettle = Deck.settle({ win: true, cause: 'razed_rival_tc', mode: 'moderate', day: 80, seconds: 900, subtotal: 4000, key: 'x', runId: 'x' }).ok;
  out.offPlay = Deck.canPlay('forager_cache').ok;
  // THE DROPS
  const D = CFG.CARDS.DROPS;
  out.tables = JSON.stringify(D);
  out.sums = Object.values(D).map(w => w.reduce((s, x) => s + x, 0)).join(',');
  return out;
});
ck('theCatalogIs36CardsInFiveTiers', a.total === 36 && a.uniq === 36 && a.counts === '8/8/7/7/6', `${a.total} cards, ${a.uniq} ids, ${a.counts}`);
ck('everyCardIsFullyDescribed', a.missing.length === 0, a.missing.join(',') || 'name, text, flavor, when, kind, target');
ck('fourCardsAreAimed', a.targeted === 'dragonfire,scouts_fire,starfall', a.targeted);
ck('theSwitchShipsOff', a.shipsOff && !a.offOn, a.shipsOff ? 'CFG.CARDS.ON is false' : 'CFG.CARDS.ON is TRUE');
ck('offMeansNothingHappens', !a.offStarter && !a.offStored && !a.offSettle && !a.offPlay,
  `starter ${a.offStarter}, stored ${a.offStored}, settle ${a.offSettle}, play ${a.offPlay}`);
ck('theDropTablesAreTheApprovedOnes',
  a.tables === JSON.stringify({ loss: [85, 15, 0, 0, 0], calm: [40, 40, 17, 3, 0], moderate: [0, 35, 40, 20, 5], hard: [0, 0, 30, 45, 25] }) && a.sums === '100,100,100,100',
  a.sums);

const c = await p.evaluate(() => {
  const out = {};
  CFG.CARDS.ON = true;
  Deck._col = null; Deck._del(Deck.KEY);
  const rng = mulberry32(1234);
  const rep = (o) => Object.assign({ win: true, cause: 'razed_rival_tc', mode: 'moderate', day: 400, seconds: 900, subtotal: 4000, deeds: 20, runId: null }, o);
  // gates
  out.banner = Deck.settle(rep({ win: false, cause: 'struck_banner', key: 'g1' }), rng).ok;
  out.bannerDeeds = Deck.settle(rep({ win: false, cause: 'struck_banner', deeds: 99, key: 'g1b' }), rng).ok;
  // THE EARN RULE: a day-31 Moderate win at five real minutes, scoring next
  // to nothing and having raised nothing — the old ten-minute/500 gate refused it
  out.quickWin = Deck.settle(rep({ day: 31, seconds: 300, subtotal: 120, deeds: 0, key: 'g2' }), rng);
  out.lossOk = Deck.settle(rep({ win: false, cause: 'tc_destroyed', key: 'g4' }), rng);
  const need = CFG.CARDS.LOSS_DEEDS;
  out.need = need;
  out.under = Deck.settle(rep({ win: false, cause: 'tc_destroyed', deeds: need - 1, key: 'g5' }), rng);
  out.at = Deck.settle(rep({ win: false, cause: 'tc_destroyed', deeds: need, seconds: 60, subtotal: 0, key: 'g6' }), rng).ok;
  out.why2 = Deck.eligible(rep({ win: false, cause: 'tc_destroyed', deeds: 2 })).why;
  out.gatesGone = !('MIN_SECONDS' in CFG.CARDS) && !('MIN_SCORE' in CFG.CARDS);
  // the measured roll: 20,000 tier rolls per table against the approved weights
  const tiers = Deck.TIERS.map(t => t.k);
  out.dev = {};
  for (const [name, w] of Object.entries(CFG.CARDS.DROPS)) {
    const n = 20000, hit = [0, 0, 0, 0, 0];
    for (let i = 0; i < n; i++) hit[tiers.indexOf(Deck.rollTier(w, rng))]++;
    out.dev[name] = Math.max(...hit.map((h, i) => Math.abs(h / n * 100 - w[i]))).toFixed(2);
    out.dev[name + 'Zero'] = hit.every((h, i) => w[i] > 0 || h === 0);
  }
  // great victory
  const g = (o) => Deck.settle(rep(o), rng).cards.length;
  out.wonder = g({ cause: 'wonder', key: 'w1' });
  out.hard = g({ mode: 'hard', key: 'h1' });
  out.fast = g({ day: Deck.medianDay('moderate') - 1, key: 'f1' });
  out.slow = g({ day: Deck.medianDay('moderate') + 1, key: 's1' });
  out.lossNoBonus = g({ win: false, cause: 'tc_destroyed', mode: 'hard', key: 'l1' });
  // ONCE PER RUN
  const before = Deck.total();
  const r1 = Deck.settle(rep({ key: 'once' }), rng), mid = Deck.total();
  const r2 = Deck.settle(rep({ key: 'once' }), rng), after = Deck.total();
  out.once = { gained: mid - before, again: after - mid, same: JSON.stringify(r1.cards) === JSON.stringify(r2.cards) };
  // PITY: 15 calm wins (calm never drops a legend) then the 16th must
  Deck.col().pity = 0;
  let legends = 0;
  for (let i = 0; i < 15; i++) legends += Deck.settle(rep({ mode: 'calm', day: 999, key: 'p' + i }), rng).cards.filter(x => x.tier === 'enlight').length;
  out.pityBefore = Deck.col().pity;
  const p16 = Deck.settle(rep({ mode: 'calm', day: 999, key: 'p15' }), rng);
  out.pity = { legends, at15: out.pityBefore, forced: p16.cards[0].tier, flag: p16.pity, reset: Deck.col().pity };
  // a loss never moves the count
  Deck.col().pity = 7;
  Deck.settle(rep({ win: false, cause: 'tc_destroyed', key: 'pl' }), rng);
  out.lossPity = Deck.col().pity;
  out.queue = Deck.col().queue.filter(q => q.op === 'grant').length;
  out.counts = JSON.stringify(Deck.col().counts);
  return out;
});
ck('aStruckBannerEarnsNothing', c.banner === false && c.bannerDeeds === false, `deeds or none, a struck banner: ${c.banner}/${c.bannerDeeds}`);
ck('aWinAlwaysEarnsEvenAtFiveMinutes', c.quickWin.ok && c.quickWin.cards.length >= 1 && c.gatesGone,
  `day-31 win at 300s, score 120, 0 deeds: ${c.quickWin.ok} ${c.quickWin.why || ''}; old gates gone ${c.gatesGone}`);
ck('aLossEarnsACard', c.lossOk.ok && c.lossOk.cards.length === 1 && ['stone', 'bronze'].includes(c.lossOk.cards[0].tier), JSON.stringify(c.lossOk.cards));
ck('aDefeatIsJudgedOnDeedsNotTime', c.need === 5 && !c.under.ok && c.at,
  `bar ${c.need}: ${c.need - 1} deeds ${c.under.ok}, ${c.need} deeds at one minute and score 0 ${c.at}`);
ck('andAShortDefeatIsToldHowFarItGot', c.under.why === 'Build, train, upgrade or raze to earn a card from a defeat — 4 of 5 deeds.' &&
  c.why2 === 'Build, train, upgrade or raze to earn a card from a defeat — 2 of 5 deeds.', `"${c.under.why}" / "${c.why2}"`);
ck('theRollLandsOnItsTable', Object.keys(c.dev).filter(k => !k.endsWith('Zero')).every(k => +c.dev[k] < 1.2) &&
  Object.keys(c.dev).filter(k => k.endsWith('Zero')).every(k => c.dev[k]), JSON.stringify(c.dev));
ck('aGreatVictoryEarnsASecondCard', c.wonder === 2 && c.hard === 2 && c.fast === 2 && c.slow === 1 && c.lossNoBonus === 1,
  `wonder ${c.wonder}, hard ${c.hard}, fast ${c.fast}, slow ${c.slow}, hard loss ${c.lossNoBonus}`);
ck('aRunIsPaidOnce', c.once.gained === 1 && c.once.again === 0 && c.once.same, JSON.stringify(c.once));
ck('fifteenWinsWithoutALegendGuaranteeOne', c.pity.legends === 0 && c.pity.at15 === 15 && c.pity.forced === 'enlight' && c.pity.flag && c.pity.reset === 0, JSON.stringify(c.pity));
ck('aLossNeverMovesThePity', c.lossPity === 7, 'pity ' + c.lossPity);
ck('everyGrantIsQueuedForTheCloud', c.queue >= 20, c.queue + ' grant ops');

// THE COLLECTION survives a reload, and the starter hand comes once
const counts = c.counts;
await p.reload({ waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.Deck && window.Screens && Screens.current, null, { timeout: 15000 });
const d = await p.evaluate((counts) => {
  const out = {};
  out.survived = JSON.stringify(Deck.col().counts) === counts;
  CFG.CARDS.ON = true;
  Deck._col = null; Deck._del(Deck.KEY);
  out.first = Deck.ensureStarter();
  out.hand = JSON.stringify(Deck.col().counts);
  out.second = Deck.ensureStarter();
  out.handAfter = JSON.stringify(Deck.col().counts);
  // THE DOOR — in a real game, not the title's demo world
  Screens._demo = false;
  G.newGame('deckdoor', 'moderate', 'medium');
  const rng0 = S.rngState;
  Deck.FX.__ok = { apply: () => { S.res.food += 1; return { ok: true }; } };
  Deck.FX.__no = { apply: () => ({ ok: false, why: 'no room' }) };
  Deck.FX.__boom = { apply: () => { throw new Error('boom'); } };
  Deck.CATALOG.push({ id: '__ok', tier: 'stone', cat: 'econ', target: 'none', name: 'ok', text: 't', flavor: 'f', when: 'w' },
                    { id: '__no', tier: 'stone', cat: 'econ', target: 'none', name: 'no', text: 't', flavor: 'f', when: 'w' },
                    { id: '__boom', tier: 'stone', cat: 'econ', target: 'none', name: 'boom', text: 't', flavor: 'f', when: 'w' });
  Deck._byId = null;
  Deck._add('__ok', 1); Deck._add('__no', 1); Deck._add('__boom', 1);
  const ok = Deck.play('__ok'), no = Deck.play('__no'), boom = Deck.play('__boom');
  out.door = { ok: ok.ok, okLeft: Deck.count('__ok'), no: no.ok, noWhy: no.why, noLeft: Deck.count('__no'), boom: boom.ok, boomLeft: Deck.count('__boom') };
  out.none = Deck.play('__ok');
  out.played = JSON.stringify(S.deck.played);
  out.consumeQueued = Deck.col().queue.filter(q => q.op === 'consume').length;
  out.rngSame = S.rngState === rng0;
  // THE LESSON HAS THE FLOOR (ruling 12): while the tutorial's spine runs the
  // door refuses and the card stays; once the spine is done it plays
  Deck._add('__ok', 1);
  const tut0 = S.tut, food0 = S.res.food;
  S.tut = { on: true, phase: 1, step: 3, done: {}, fired: {} };
  const held = Deck.play('__ok');
  out.lesson = { ok: held.ok, why: held.why, left: Deck.count('__ok'), food: S.res.food - food0 };
  S.tut.phase = 2;
  out.lesson.after = Deck.play('__ok').ok;
  S.tut = tut0;
  S.deck.played.pop();
  // S.deck rides the save, and an old save is backfilled
  const json = G.saveJSON();
  G.loadJSON(json);
  out.rides = JSON.stringify(S.deck.played) === out.played;
  const old = JSON.parse(json); delete old.deck;
  G.loadJSON(JSON.stringify(old));
  out.backfill = !!(S.deck && Array.isArray(S.deck.played) && Array.isArray(S.deck.fx) && S.deck.played.length === 0);
  // TIMERS
  let ended = 0;
  Deck.FX.__t = { end: () => { ended++; } };
  const e = Deck.addTimed('__t', 2);
  const until0 = e.until;
  Deck.addTimed('__t', 2);
  out.extends = +(e.until - until0).toFixed(3);
  out.oneEntry = S.deck.fx.filter(x => x.id === '__t').length;
  S.paused = true;
  const t0 = Deck.timers()[0].left;
  out.pausedLeft = +(Deck.timers()[0].left - t0).toFixed(3);
  S.paused = false;
  S.day += 3; Deck.tick();
  out.notYet = ended;
  S.day += 2; Deck.tick();
  out.ended = ended; out.gone = S.deck.fx.length;
  // THE FACE: a whole multiple of device pixels at every width asked for
  out.dpr = devicePixelRatio;
  out.faces = [80, 120, 150, 176, 200, 260, 330].map(w => { const f = Deck.fit(w); return +(f.w * devicePixelRatio / 176).toFixed(4); });
  const el = Deck.face('swift_raiders', { w: 150, n: 3 });
  document.body.appendChild(el);
  // layout keeps 1/64 of a CSS pixel, so a third-pixel width lands within a hair of the device grid
  out.faceW = el.getBoundingClientRect().width * devicePixelRatio / 176;
  out.badge = !!el.querySelector('.cc-n') && el.querySelector('.cc-n').textContent;
  el.remove();
  return out;
}, counts);
ck('theCollectionSurvivesAReload', d.survived);
ck('theStarterHandComesOnce', d.first && !d.second && d.hand === d.handAfter &&
  d.hand === JSON.stringify({ forager_cache: 1, fallen_timber: 1, willing_hands: 1 }), d.hand);
ck('aCardIsTakenOnlyWhenItApplies', d.door.ok && d.door.okLeft === 0 && !d.door.no && d.door.noLeft === 1 && d.door.noWhy === 'no room' &&
  !d.door.boom && d.door.boomLeft === 1, JSON.stringify(d.door));
ck('aCardYouDoNotHoldCannotBePlayed', !d.none.ok, d.none.why);
ck('theLessonHasTheFloor', !d.lesson.ok && d.lesson.why === 'Finish the lesson first — your deck opens when it ends.' &&
  d.lesson.left === 1 && d.lesson.food === 0 && d.lesson.after, JSON.stringify(d.lesson));
ck('theRunRemembersWhatItPlayed', JSON.parse(d.played).length === 1 && d.consumeQueued === 1, d.played);
ck('nothingDrawsFromTheRunsRng', d.rngSame);
ck('theRunStateRidesASave', d.rides && d.backfill, `rides ${d.rides}, backfill ${d.backfill}`);
ck('aSecondPlayExtendsNotStacks', d.extends === 2 && d.oneEntry === 1, `+${d.extends} days, ${d.oneEntry} entry`);
ck('timersCountGameDays', d.pausedLeft === 0 && d.notYet === 0 && d.ended === 1 && d.gone === 0,
  `paused drift ${d.pausedLeft}, ended ${d.ended}`);
ck('everyFaceIsAWholeMultiple', d.faces.every(k => Number.isInteger(k) && k >= 1) && Math.abs(d.faceW - Math.round(d.faceW)) < 0.01,
  `dpr ${d.dpr}: ${d.faces.join(', ')}; drawn ${d.faceW}`);
ck('aDuplicateWearsItsCount', d.badge === '×3', String(d.badge));

/* THE DEEDS, end to end. Every world here is stepped exactly as G.frame
   steps it, seeded (Math.random + the module clocks), with no input but the
   bot's own — so the counts are the game's, not a test's arithmetic. */
const SIM = `window.__sim = (o) => {
  let rs = o.rs || 1;
  Math.random = () => { rs = (rs * 16807) % 2147483647; return (rs - 1) / 2147483646; };
  Screens._demo = false;
  try { localStorage.setItem('neo-tutorial-ask', o.tut ? '1' : '0'); } catch (e) {}
  G.newGame(o.seed, o.mode || 'hard', 'medium');
  S.draft.hand = [{ key: o.origin, roll: Cards.DEFS[o.origin].roll() }];
  Cards.pick(0);
  Screens.show('playing'); S.paused = false;
  Combat.scanT = 0; Units.herdClock = 0;
  if (o.tut) Tutorial.maybeStart();
  const tc0 = Bld.tcOf('P');
  const vills = () => S.units.filter(u => u.owner === 'P' && Units.isVillager(u));
  const spot = (key) => MapGen.findNear(tc0.x + 1, tc0.y + 1, 9, (x, y) => Bld.canPlace('P', key, x, y).ok);
  const lay = (key) => {
    const s = spot(key); if (!s) return null;
    const b = Bld.place('P', key, s.x, s.y); if (!b) return null;
    for (const v of vills().filter(v => !(v.task && v.task.type === 'build')).slice(0, 2)) Units.assignBuild(v, b);
    return b;
  };
  const near = (terrs, r) => MapGen.findNear(tc0.x + 1, tc0.y + 1, r, (x, y) => {
    const i = MapGen.idx(x, y);
    return terrs.includes(S.map.terrain[i]) && S.map.resAmount[i] > 0 && S.map.explored[i];
  });
  let house = false, villager = false;
  const act = () => {
    const tc = Bld.tcOf('P'); if (!tc) return;
    if (o.bot === 'token') {
      if (!house && Bld.canAfford(Bld.effCost('P', 'house'), S.res) && lay('house')) house = true;
      if (!villager && Bld.train(tc, 'villager')) villager = true;
      return;
    }
    let j = 0;
    for (const v of vills()) {
      if (v.task) continue;
      const t = near([[T.FOREST], [T.FERTILE], [T.HILLS]][j++ % 3], 16) || near([T.FOREST, T.FERTILE, T.HILLS], 20);
      if (t) Units.assignGather(v, t.x, t.y);
    }
    if (tc.queue.length < 1) Bld.train(tc, 'villager');
    if (S.buildings.filter(b => b.owner === 'P' && b.construction > 0).length < 2) {
      if (Bld.popCap('P') - Units.popUsed('P') < 3 && Bld.canAfford(Bld.effCost('P', 'house'), S.res)) lay('house');
      else if (S.day > 4 && !S.buildings.some(b => b.owner === 'P' && b.key === 'barracks') && Bld.canAfford(Bld.effCost('P', 'barracks'), S.res)) lay('barracks');
      else if (S.day > 10 && Bld.canAfford(Bld.effCost('P', 'tower'), S.res) && S.buildings.filter(b => b.owner === 'P' && b.key === 'tower').length < 2) lay('tower');
    }
    const bk = S.buildings.find(b => b.owner === 'P' && b.key === 'barracks' && !b.construction);
    if (bk && bk.queue.length < 1) Bld.train(bk, 'defender');
    for (const st of S.buildings.filter(b => b.owner === 'P' && b.construction > 0))
      if (!S.units.some(u => u.owner === 'P' && u.task && u.task.type === 'build' && u.task.id === st.id)) {
        const v = vills()[0]; if (v) Units.assignBuild(v, st);
      }
  };
  const dt = 0.25;
  let actT = 0, steps = 0;
  while (!S.over && S.day < (o.cap || 260) && steps++ < 300000) {
    if (o.bot && S.day < (o.act || 30)) { actT -= dt; if (actT <= 0) { actT = 2; act(); } }
    if (o.bot && S.day >= (o.act || 30) && o.raze) break;
    const dtDays = dt * 1000 / CFG.DAY_MS;
    S.playtime += dt; S.dayT += dt * 1000;
    while (S.dayT >= CFG.DAY_MS) { S.dayT -= CFG.DAY_MS; G.dayTick(); if (S.over) break; }
    if (S.over) break;
    Bld.update(dtDays); Units.update(dt); Combat.update(dt);
    G.dyingTick(dt); G.krakenTick(dt); G.eclipseTick(dt); G.fireTick(dt); G.strifeTick(dt); G.starfallTick(dt); G.dragonTick(dt);
    G.dragonT = (G.dragonT || 0) - dt;
    if (G.dragonT <= 0) { G.dragonT = 1.3; G.maybeDragon(); G.maybeSons(); G.maybeCache(); G.maybeWinter(); G.maybePlague(); }
    G.visT -= dt; if (G.visT <= 0) { G.visT = 0.35; G.updateVisibility(); }
    if (S.tut && S.tut.on) Tutorial.tick(dt);
  }
  // the hall falls to the world — through the real door, so the end screen settles it
  if (!S.over) { const tc = Bld.tcOf('P'); if (tc) Bld.damage(tc, 1e7); }
  const st = S.stats, d = Deck.deeds(), rep = Deck.report(false, 'tc_destroyed');
  return { day: S.day, cause: S.over && S.over.cause, win: !!(S.over && S.over.win), deeds: d.n, parts: d.parts,
    razed: st.razed, gathered: Math.round(st.gathered), built: st.built, trained: st.trained, secs: Math.round(S.playtime),
    granted: !!Deck.col().runs[rep.key], why: (DeckScreens._view && DeckScreens._view.why) || '',
    tut: !!(S.tut && S.tut.on), report: G.runReport('loss', 'tc_destroyed', false).props };
};`;
const e = await p.evaluate(async (SIM) => {
  eval(SIM);
  const out = {};
  CFG.CARDS.ON = true;
  Deck._col = null; Deck._del(Deck.KEY);
  Deck.ensureStarter();
  const N = (o) => Object.assign({ mode: 'hard', cap: 260 }, o);
  /* A PASSIVE HARD RUN: no input at all, the world razes the hall. Six
     origins, among them every kind that plants a building or a hand on day
     one (Delver's camp, Bowyer's range, the Mariner's boats, the Hunt's
     lodge, the Timberwright's camp) and the two seeds that measured the
     naive tally's worst: the Mariner's nets (1,537 food by day 73) and a
     Grainkeeper whose rival lost 7 works to the wilds */
  out.passive = [];
  for (const [seed, origin] of [['passive-marinerb', 'mariner'], ['passive-grainkeepera', 'grainkeeper'], ['passive-delvera', 'delver'],
    ['passive-bowyera', 'bowyer'], ['passive-huntlorda', 'huntlord'], ['passive-timberwrighta', 'timberwright']])
    out.passive.push(Object.assign({ origin }, __sim(N({ seed, origin }))));
  // …and the same with the tutorial on: its larder, its scout, its free house
  // (which needs a site the player laid) add nothing either
  out.tutPassive = __sim(N({ seed: 'passive-tut', origin: 'forager', tut: true }));
  // A TOKEN EFFORT: one house and one villager, then hands off
  out.token = __sim(N({ seed: 'active-token-0', origin: 'homesteader', bot: 'token', act: 400, rs: 7 }));
  // FIVE MINUTES ON HARD: a player who builds, trains and gathers for 30
  // game days (five real minutes) and is then razed
  out.active = __sim(N({ seed: 'active-active-0', origin: 'homesteader', bot: 'active', act: 30, raze: true, rs: 7 }));
  out.active2 = __sim(N({ seed: 'active-active-2', origin: 'refugeehost', bot: 'active', act: 30, raze: true, rs: 9 }));
  return out;
}, SIM);
const pv = e.passive;
ck('aPassiveHardDefeatEarnsNothing', pv.every(r => !r.win && r.deeds === 0 && !r.granted) && e.tutPassive.deeds === 0 && !e.tutPassive.granted,
  pv.map(r => `${r.origin} d${r.day} ${r.deeds} deeds (razed ${r.razed}, gathered ${r.gathered})`).join('; ') + `; tutorial d${e.tutPassive.day} ${e.tutPassive.deeds}`);
ck('aTokenEffortIsToldHowFarItGot', e.token.deeds === 2 && !e.token.granted &&
  e.token.why === 'Build, train, upgrade or raze to earn a card from a defeat — 2 of 5 deeds.',
  `${e.token.deeds} deeds (${JSON.stringify(e.token.parts)}), granted ${e.token.granted}, "${e.token.why}"`);
ck('fiveMinutesOfRealPlayOnHardEarns', [e.active, e.active2].every(r => !r.win && r.cause === 'tc_destroyed' && r.deeds >= 7 && r.granted && r.secs <= 320),
  [e.active, e.active2].map(r => `${r.deeds} deeds ${JSON.stringify(r.parts)} at ${r.secs}s, granted ${r.granted}`).join('; '));
ck('theDeedsRideTheRunReport', [e.active, e.token, ...pv].every(r => r.report.deeds === r.deeds &&
  r.report.hand_razed === r.parts.razed && Number.isFinite(r.report.hand_gathered)),
  `active report deeds ${e.active.report.deeds}, hand_gathered ${e.active.report.hand_gathered}`);

/* THE TWO TRAPS, on constructed ground (deterministic whatever the AI does
   next year): whose torch razed it, and whose hands gathered it. The score's
   own tallies (S.stats.razed / gathered) are what a naive earn rule would
   read — they move here, and the deeds must not. */
const t = await p.evaluate(() => {
  const out = {};
  Screens._demo = false;
  G.newGame('deeds-traps', 'moderate', 'medium');
  Screens.show('playing'); S.paused = true;
  Combat.scanT = 0; Units.herdClock = 0;
  const atc = Bld.tcOf('A');
  const mk = (owner, key, x, y) => Bld.place(owner, key, x, y, { free: true, instant: true, noAutoAssign: true });
  const free = (x0, y0, r) => MapGen.findNear(x0, y0, r, (x, y) => !Bld.at(x, y) && Bld.tileFree(x, y) && Path.passable(x, y, 'A'));
  const house = () => { const h = free(atc.x + 1, atc.y + 1, 10); return mk('A', 'house', h.x, h.y); };
  const s0 = { razed: S.stats.razed, hand: S.stats.handRazed };
  // a barbarian's torch, and a bare Bld.damage (no striker at all)
  Combat.hitBuilding(house(), 1e6, false, 'R');
  Bld.damage(house(), 1e6);
  // a barbarian camp the RIVAL burns
  const cp = free(atc.x + 1, atc.y + 1, 14);
  const camp = mk('R', 'raidercamp', cp.x, cp.y);
  Combat.hitBuilding(camp, 1e6, false, 'A');
  out.notMine = { razed: S.stats.razed - s0.razed, hand: S.stats.handRazed - s0.hand };
  // the player's own: a direct hit, a soldier's blow in the real combat loop,
  // and an engine's boulder landing
  Combat.hitBuilding(house(), 1e6, false, 'P');
  const h2 = house();
  const sp = MapGen.findNear(h2.x, h2.y, 3, (x, y) => Path.passable(x, y, 'P') && Math.max(Math.abs(x - h2.x), Math.abs(y - h2.y)) === 1);
  const sol = Units.spawn('axeman', 'P', sp.x + 0.5, sp.y + 0.5);
  sol.atk = 9999;
  sol.tBld = h2.id; sol.task = { type: 'attackBld', id: h2.id };
  for (let i = 0; i < 4000 && Bld.get(h2.id); i++) Combat.update(0.05);
  const h3 = house();
  const cat = Units.spawn('catapult', 'P', h3.x + 3.5, h3.y + 0.5);
  Combat.launch(cat, Bld.cx(h3), Bld.cy(h3), { kind: 'bld', id: h3.id, dmg: 1e6 });
  for (let i = 0; i < 200 && Combat.projectiles.length; i++) Combat.update(0.05);
  out.mine = S.stats.handRazed - s0.hand - out.notMine.hand;
  out.blowLanded = !Bld.get(h2.id) && !Bld.get(h3.id);
  // whose hands: a fishing boat's nets, then a villager's own
  const ptc = Bld.tcOf('P');
  const w = MapGen.findNear(ptc.x + 1, ptc.y + 1, 40, (x, y) => Units.canFish(x, y));
  const g0 = { all: S.stats.gathered, hand: S.stats.handGathered };
  out.water = !!w;
  if (w) {
    const boat = Units.spawn('fishboat', 'P', w.x + 0.5, w.y + 0.5);
    Units.assignFish(boat, w.x, w.y);
    for (let i = 0; i < 1600; i++) Units.update(0.25);
    Units.despawn(boat);
  }
  out.boat = { all: Math.round(S.stats.gathered - g0.all), hand: Math.round(S.stats.handGathered - g0.hand) };
  const v = S.units.find(u => u.owner === 'P' && Units.isVillager(u));
  const f = MapGen.findNear(Math.round(v.x), Math.round(v.y), 20, (x, y) => S.map.terrain[MapGen.idx(x, y)] === T.FOREST && S.map.resAmount[MapGen.idx(x, y)] > 0);
  Units.assignGather(v, f.x, f.y);
  const g1 = S.stats.handGathered;
  for (let i = 0; i < 1200; i++) Units.update(0.25);
  out.hand = Math.round(S.stats.handGathered - g1);
  // the allowance: one deed per 300, capped at three
  out.allow = [0, 299, 300, 899, 900, 5000].map(n => Deck.deeds({ handGathered: n }).parts.gathered);
  out.naiveBoatDeeds = Math.min(3, Math.floor(out.boat.all / 300));
  // the tallies ride a save, and a pre-deeds save gives the benefit of the doubt
  S.stats.handGathered = 640; S.stats.handRazed = 3;
  const json = G.saveJSON();
  G.loadJSON(json);
  out.rides = S.stats.handGathered === 640 && S.stats.handRazed === 3;
  const old = JSON.parse(json); delete old.stats.handGathered; delete old.stats.handRazed; old.stats.gathered = 900; old.stats.razed = 2;
  G.loadJSON(JSON.stringify(old));
  out.backfill = S.stats.handGathered === 900 && S.stats.handRazed === 2;
  return out;
});
ck('aWorkTheWildsOrTheRivalBurnedIsNoDeed', t.notMine.razed === 3 && t.notMine.hand === 0,
  `the score's razed +${t.notMine.razed} (what a naive rule would pay), the player's hand +${t.notMine.hand}`);
ck('butWhatTheirOwnSoldiersPullDownIs', t.mine === 3 && t.blowLanded, `a direct hit, a soldier's blow, an engine's boulder: +${t.mine}`);
ck('aBoatsNetsAreNoHandGathering', t.water && t.boat.all >= 300 && t.boat.hand === 0 && t.naiveBoatDeeds >= 1,
  t.water ? `boat: +${t.boat.all} gathered (${t.naiveBoatDeeds} deeds to a naive rule), +${t.boat.hand} by hand` : 'no water near the seat');
ck('aVillagersOwnHandsAre', t.hand > 0, `+${t.hand} by hand`);
ck('theGatheringAllowanceIsCapped', JSON.stringify(t.allow) === '[0,0,1,2,3,3]', JSON.stringify(t.allow));
ck('theTalliesRideASave', t.rides && t.backfill, `rides ${t.rides}, backfill ${t.backfill}`);

/* NO CARD BUYS A CARD. Every deed is something the player's own hand
   started; a card's free building, free upgrade or summoned soldier is the
   card's (ruling 6 — and a slip there would let one card's play buy the
   next one from a defeat). Every card with an effect is played in a fresh
   world — aimed cards at the first valid ground beside the hall — and the
   world run on for three days with no input: the deeds may not move. Cards
   whose can() refuses on a bare day-1 town are named, never failed. */
const nc = await p.evaluate(() => {
  const out = { moved: [], measured: [], refused: [] };
  CFG.CARDS.ON = true;
  /* the CONTROL: a card that raises its house the naive way, through the
     builders' own Bld.finish — the probe must see it, or a pass means nothing */
  Deck.FX.__builds = { apply() {
    const tc = Bld.tcOf('P');
    const sp = MapGen.findNear(tc.x + 1, tc.y + 1, 9, (x, y) => Bld.canPlace('P', 'house', x, y).ok);
    const b = sp && Bld.place('P', 'house', sp.x, sp.y, { free: true, noAutoAssign: true });
    if (!b) return { ok: false, why: 'no ground' };
    Bld.finish(b);
    return { ok: true };
  } };
  Deck.CATALOG.push({ id: '__builds', tier: 'stone', cat: 'econ', target: 'none', name: 'b', text: 't', flavor: 'f', when: 'w' });
  Deck._byId = null;
  const ids = Object.keys(Deck.FX).filter(k => Deck.card(k) && !k.startsWith('__')).sort();
  for (const id of ids.concat('__builds')) {
    Screens._demo = false;
    G.newGame('no-card-buys-' + id, 'moderate', 'medium');
    Screens.show('playing'); S.paused = false;
    Combat.scanT = 0; Units.herdClock = 0;
    for (const k of ['food', 'wood', 'stone', 'gold']) S.res[k] = 5000;
    Deck._col = null; Deck._del(Deck.KEY);
    Deck._add(id, 1);
    const c = Deck.card(id), tc = Bld.tcOf('P');
    let tgt = null;
    if (c.target !== 'none') {
      const sp = MapGen.findNear(tc.x + 1, tc.y + 1, 12, (x, y) => Deck.validTarget(id, x + 0.5, y + 0.5) &&
        Math.hypot(x - tc.x, y - tc.y) > 4);
      if (sp) tgt = { x: sp.x + 0.5, y: sp.y + 0.5 };
    }
    const d0 = Deck.deeds().n;
    const r = Deck.play(id, tgt);
    if (!r.ok) { out.refused.push(id + ': ' + r.why); continue; }
    const d1 = Deck.deeds().n;
    // G.frame's own sim step, strikes and timers included, for three days
    const dt = 0.25;
    for (let i = 0; i < 3 * CFG.DAY_MS / 250 && !S.over; i++) {
      S.playtime += dt; S.dayT += dt * 1000;
      while (S.dayT >= CFG.DAY_MS) { S.dayT -= CFG.DAY_MS; G.dayTick(); if (S.over) break; }
      if (S.over) break;
      Bld.update(dt * 1000 / CFG.DAY_MS); Units.update(dt); Combat.update(dt);
      G.dyingTick(dt); G.krakenTick(dt); G.eclipseTick(dt); G.fireTick(dt); G.strifeTick(dt); G.starfallTick(dt); G.dragonTick(dt);
      if (S.deck.fx.length) Deck.tick();
      if (S.deck.strike && Deck.strikeTick) Deck.strikeTick(dt);
      G.visT -= dt; if (G.visT <= 0) { G.visT = 0.35; G.updateVisibility(); }
    }
    const d2 = Deck.deeds().n;
    if (id === '__builds') { out.control = d1 - d0; continue; }
    out.measured.push(id);
    if (d1 !== d0 || d2 !== d0) out.moved.push(`${id} ${d0}→${d1}→${d2} ${JSON.stringify(Deck.deeds().parts)}`);
  }
  return out;
});
ck('noCardPlayIsADeed', nc.moved.length === 0 && nc.measured.length >= 5 && nc.control === 1,
  `${nc.measured.length} cards played and run three days: ${nc.moved.join('; ') || 'no deed moved'}; ` +
  `the control (a free house raised through Bld.finish) read +${nc.control}` +
  (nc.refused.length ? ` (refused on a bare town: ${nc.refused.join(' | ')})` : ''));

/* THE TEST LINK: ?cards=all turns the deck on for the device and, on EVERY
   load carrying it, resets the collection and deals one of every card in
   the catalog — the starter hand marked as given, so it adds no three more.
   A test deck queues nothing for the cloud and reports nothing. */
{
  const ctx2 = await b.newContext({ viewport: { width: 430, height: 880 } });
  const p2 = await ctx2.newPage();
  p2.on('pageerror', e => errs.push(String(e)));
  // a device with a real collection first: two Swift Raiders and a run ledger
  await p2.goto(url, { waitUntil: 'domcontentloaded' });
  await p2.waitForFunction(() => window.Deck && window.Screens && Screens.current, null, { timeout: 15000 });
  await p2.evaluate(() => {
    Deck._set(Deck.KEY, JSON.stringify({ v: 1, counts: { swift_raiders: 2, gold_nugget: 1 }, seen: { swift_raiders: 1 }, pity: 9,
      starter: 0, runs: { k1: [{ id: 'swift_raiders', tier: 'iron' }] }, queue: [{ op: 'grant' }], medians: {} }));
  });
  const load = async (q) => {
    await p2.goto(url + q, { waitUntil: 'domcontentloaded' });
    await p2.waitForFunction(() => window.Deck && window.Screens && Screens.current, null, { timeout: 15000 });
  };
  await load('?cards=all');
  const a1 = await p2.evaluate(() => {
    Deck.ensureStarter();
    const c = Deck.col();
    const all = Deck.CATALOG.every(x => Deck.count(x.id) === 1);
    const o = { on: Deck.on(), dev: Deck._get('neo-cards-dev'), total: Deck.total(), all, runs: Object.keys(c.runs).length,
      queue: c.queue.length, pity: c.pity, starter: !!c.starter, test: !!c.test, again: Deck.ensureStarter() };
    // a card played and a grant settled in a test deck write nothing for the cloud
    Screens._demo = false;
    G.newGame('cards-all', 'moderate', 'medium');
    Screens.show('playing'); S.paused = true;
    const r = Deck.play('forager_cache');
    const g = Deck.settle(Object.assign(Deck.report(true, 'razed_rival_tc'), { key: 'cards-all-win' }));
    o.played = r.ok; o.granted = g.ok; o.queued = Deck.col().queue.length;
    return o;
  });
  ck('theTestLinkDealsTheWholeCatalog', a1.on && a1.dev === '1' && a1.total === 36 && a1.all && a1.test,
    `on ${a1.on}, device ${a1.dev}, ${a1.total} cards, one of each ${a1.all}`);
  ck('andResetsTheCollectionFirst', a1.runs === 0 && a1.pity === 0 && a1.queue === 0 && a1.starter && a1.again === false,
    `ledger ${a1.runs}, pity ${a1.pity}, queue ${a1.queue}, starter marked ${a1.starter} (a second ask deals ${a1.again})`);
  ck('aTestDeckWritesNothingForTheCloud', a1.played && a1.granted && a1.queued === 0, `played ${a1.played}, granted ${a1.granted}, queued ${a1.queued}`);
  // every load carrying it deals afresh — and the switch thrown at launch must
  // not stop the link being read (an on() that asked the switch first never
  // read the address at all)
  await load('?cards=all');
  const a2 = await p2.evaluate(() => {
    const o = { reloaded: (Deck.ensureStarter(), Deck.total()) };
    Deck._add('gold_nugget', -1); Deck.saveCol();
    o.spent = Deck.total();
    Deck._dev = null; Deck._all = false; CFG.CARDS.ON = true;
    Deck.on(); Deck.ensureStarter();
    o.switchOn = Deck.total();
    return o;
  });
  ck('everyLoadOfTheLinkDealsAfresh', a2.reloaded === 36, `${a2.reloaded} after a reload`);
  ck('andTheLinkIsReadWithTheSwitchOn', a2.spent === 35 && a2.switchOn === 36, `${a2.spent} → ${a2.switchOn} with CFG.CARDS.ON`);
  // a load WITHOUT it keeps the deck it dealt and the device's switch
  await load('');
  const a3 = await p2.evaluate(() => { Deck.ensureStarter(); return { on: Deck.on(), total: Deck.total() }; });
  ck('andAPlainLoadKeepsIt', a3.on && a3.total === 36, `on ${a3.on}, ${a3.total}`);
  // ?cards=0 forgets the device switch AND the toy deck (a test deck never
  // syncs, so a device left holding one would never sync again) — and
  // ?cards=1 after it starts a real collection with the starter hand
  await load('?cards=0');
  const a4 = await p2.evaluate(() => ({ on: Deck.on(), stored: Deck._get(Deck.KEY) }));
  await load('?cards=1');
  const a5 = await p2.evaluate(() => { Deck.ensureStarter(); return { on: Deck.on(), total: Deck.total(), test: Deck.isTest(), queue: Deck.col().queue.length }; });
  ck('andCardsZeroForgetsTheToyDeck', !a4.on && a4.stored === null && a5.on && a5.total === 3 && !a5.test && a5.queue === 1,
    `off ${!a4.on}, stored ${a4.stored === null ? 'gone' : 'kept'}; then ?cards=1: ${a5.total} cards, test ${a5.test}, queued ${a5.queue}`);
  // …while a REAL collection survives ?cards=0 untouched
  await p2.evaluate(() => { Deck._add('swift_raiders', 2); Deck.saveCol(); });
  await load('?cards=0');
  const a6 = await p2.evaluate(() => { const c = JSON.parse(Deck._get(Deck.KEY) || 'null'); return c && c.counts && c.counts.swift_raiders; });
  ck('butARealCollectionSurvivesIt', a6 === 2, `swift raiders kept: ${a6}`);
  await ctx2.close();
}

for (const [k, v] of Object.entries(res)) console.log((v.startsWith('PASS') ? ' ' : '✗') + ' ' + k + ': ' + v);
if (errs.length) console.log('PAGE ERRORS:', errs.slice(0, 4));
await b.close();
if (fails.length || errs.length) { console.log('FAILURES:', fails.join(', ') || 'pageerrors'); process.exit(1); }
console.log('ALL DECK-CORE CHECKS PASS');
