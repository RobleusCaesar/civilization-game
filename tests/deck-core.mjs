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
                     nothing; the deeds ride the run report, the grant's
                     cloud op and a save; and NO CARD BUYS A CARD — every
                     card with an effect is played on a fresh town and run
                     three days, and the deeds may not move (a control card
                     raising a house through Bld.finish must read +1)
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
     EARNED IS EARNED a card won while the toy deck is held (a plain visit
                     keeps it) is banked in the set-aside real collection
                     too, its grant op in that collection's own queue — one
                     made for a device that had none — so ?cards=0 gives it
                     back and it syncs; a re-dealt toy never banks a run twice
     THE LESSON      while the tutorial's spine runs the door refuses (the
                     deck is not in the game yet) and the card stays
     ONE WORD        "deck" is the card collection alone: the origin
                     draft's help deals three ORIGIN cards

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
  const rep = (o) => Object.assign({ win: true, cause: 'razed_rival_tc', mode: 'moderate', day: 400, seconds: 900, subtotal: 4000, deeds: 20, actDays: 30, runId: null }, o);
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
  out.underPips = Deck.eligible(rep({ win: false, cause: 'tc_destroyed', deeds: need - 1 })).pips;
  out.gatesGone = !('MIN_SECONDS' in CFG.CARDS) && !('MIN_SCORE' in CFG.CARDS);
  // …and the fight has to LAST: deeds galore given on too few days earn
  // nothing; a win needs no days at all
  const needD = CFG.CARDS.LOSS_DAYS;
  out.needD = needD;
  const burstRep = rep({ win: false, cause: 'tc_destroyed', deeds: 10, actDays: needD - 1, key: 'g7' });
  out.burst = Object.assign({}, Deck.eligible(burstRep), { settled: Deck.settle(burstRep, rng).ok });
  out.lasted = Deck.settle(rep({ win: false, cause: 'tc_destroyed', deeds: CFG.CARDS.LOSS_DEEDS, actDays: needD, key: 'g8' }), rng).ok;
  out.both = Deck.eligible(rep({ win: false, cause: 'tc_destroyed', deeds: 2, actDays: 1 }));
  out.quickWinNoDays = Deck.eligible(rep({ win: true, deeds: 0, actDays: 0 })).ok;
  // THE NO WAY BACK RESIGN is a defeat, judged like one; a struck banner never
  out.doomed = Deck.eligible(rep({ win: false, cause: 'doomed' })).ok;
  out.doomedShort = Deck.eligible(rep({ win: false, cause: 'doomed', deeds: 1 })).ok;
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
  // the grant op carries what the server needs to re-run the earn rule
  const lossOp = Deck.col().queue.find(q => q.op === 'grant' && q.key === 'g6');
  out.opRule = !!lossOp && lossOp.cause === 'tc_destroyed' && lossOp.deeds === CFG.CARDS.LOSS_DEEDS && lossOp.act_days === 30 && lossOp.outcome === 'loss';
  out.counts = JSON.stringify(Deck.col().counts);
  return out;
});
ck('aStruckBannerEarnsNothing', c.banner === false && c.bannerDeeds === false, `deeds or none, a struck banner: ${c.banner}/${c.bannerDeeds}`);
ck('aWinAlwaysEarnsEvenAtFiveMinutes', c.quickWin.ok && c.quickWin.cards.length >= 1 && c.gatesGone,
  `day-31 win at 300s, score 120, 0 deeds: ${c.quickWin.ok} ${c.quickWin.why || ''}; old gates gone ${c.gatesGone}`);
ck('aLossEarnsACard', c.lossOk.ok && c.lossOk.cards.length === 1 && ['stone', 'bronze'].includes(c.lossOk.cards[0].tier), JSON.stringify(c.lossOk.cards));
ck('aDefeatIsJudgedOnDeedsNotTime', c.need === 5 && !c.under.ok && c.at,
  `bar ${c.need}: ${c.need - 1} deeds ${c.under.ok}, ${c.need} deeds at one minute and score 0 ${c.at}`);
ck('andAShortDefeatIsToldHowFarItGot', c.under.why === 'Build, train, gather, upgrade or raze to earn a card from a defeat — 4 of 5 deeds.' &&
  c.why2 === 'Build, train, gather, upgrade or raze to earn a card from a defeat — 2 of 5 deeds.' &&
  c.underPips && c.underPips.n === 4 && c.underPips.of === 5, `"${c.under.why}" / "${c.why2}"; pips ${JSON.stringify(c.underPips)}`);
ck('andTheFightHasToLast', c.needD === 6 && !c.burst.ok && !c.burst.settled && c.lasted && c.quickWinNoDays &&
  c.burst.why === 'Keep up the fight across the days to earn a card from a defeat — orders given on 5 of 6 days.' &&
  c.burst.pips.n === 5 && c.burst.pips.of === 6 &&
  c.both.why === 'Build, train, gather, upgrade or raze to earn a card from a defeat — 2 of 5 deeds, orders given on 1 of 6 days.' &&
  c.both.pips.n === 2 && c.both.pips.of === 5,
  `bar ${c.needD} days: 10 deeds on 5 days ${c.burst.ok} "${c.burst.why}"; 5 deeds on 6 days ${c.lasted}; a win on 0 days ${c.quickWinNoDays}; both short "${c.both.why}"`);
ck('theNoWayBackResignIsADefeatNotAStruckBanner', c.doomed && !c.doomedShort, `doomed with its deeds ${c.doomed}, with one deed ${c.doomedShort}`);
ck('theRollLandsOnItsTable', Object.keys(c.dev).filter(k => !k.endsWith('Zero')).every(k => +c.dev[k] < 1.2) &&
  Object.keys(c.dev).filter(k => k.endsWith('Zero')).every(k => c.dev[k]), JSON.stringify(c.dev));
ck('aGreatVictoryEarnsASecondCard', c.wonder === 2 && c.hard === 2 && c.fast === 2 && c.slow === 1 && c.lossNoBonus === 1,
  `wonder ${c.wonder}, hard ${c.hard}, fast ${c.fast}, slow ${c.slow}, hard loss ${c.lossNoBonus}`);
ck('aRunIsPaidOnce', c.once.gained === 1 && c.once.again === 0 && c.once.same, JSON.stringify(c.once));
ck('fifteenWinsWithoutALegendGuaranteeOne', c.pity.legends === 0 && c.pity.at15 === 15 && c.pity.forced === 'enlight' && c.pity.flag && c.pity.reset === 0, JSON.stringify(c.pity));
ck('aLossNeverMovesThePity', c.lossPity === 7, 'pity ' + c.lossPity);
ck('everyGrantIsQueuedForTheCloud', c.queue >= 20 && c.opRule, c.queue + ' grant ops; a defeat\'s op carries its cause, deeds and days ' + c.opRule);

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
    /* THE BURST: every house the opening pile buys and every villager the
       food queues, on the first tick, and then no order ever again */
    if (o.bot === 'burst') {
      if (o._done) return; o._done = true;
      let n = 0; while (n < 12 && Bld.canAfford(Bld.effCost('P', 'house'), S.res) && lay('house')) n++;
      let k = 0; while (k < 12 && Bld.train(tc, 'villager')) k++;
      return;
    }
    if (o.bot === 'token') {
      if (!house && Bld.canAfford(Bld.effCost('P', 'house'), S.res) && lay('house')) house = true;
      if (!villager && Bld.train(tc, 'villager')) villager = true;
      return;
    }
    let j = 0;
    for (const v of vills()) {
      if (v.task) continue;
      const t = near([[T.FOREST], [T.FERTILE], [T.HILLS]][j++ % 3], 16) || near([T.FOREST, T.FERTILE, T.HILLS], 20);
      // a tap on the ground: the real pointerup stamps the day (UI._orderMoved
      // → G.noteAct, pinned on its own below) — the bot taps the model directly
      if (t && Units.assignGather(v, t.x, t.y)) G.noteAct();
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
        const v = vills()[0]; if (v && Units.assignBuild(v, st)) G.noteAct();
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
  return { day: S.day, cause: S.over && S.over.cause, win: !!(S.over && S.over.win), deeds: d.n, parts: d.parts, act: st.actDays,
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
  /* THE BURST (the review's probe): four of the runs that EARNED under the
     deeds alone — 8, 9, 6 and 7 deeds bought in the first tick — and then
     no order for between 28 and 86 game days */
  out.burst = [];
  for (const [origin, s, rs] of [['homesteader', 0, 3], ['mariner', 0, 11], ['bowyer', 1, 14], ['refugeehost', 0, 7]])
    out.burst.push(Object.assign({ origin }, __sim(N({ seed: 'cheese-' + origin + '-' + s, origin, bot: 'burst', act: 400, rs }))));
  return out;
}, SIM);
const pv = e.passive, CFG_LOSS = 5;
ck('aPassiveHardDefeatEarnsNothing', pv.every(r => !r.win && r.deeds === 0 && r.act === 0 && !r.granted) &&
  e.tutPassive.deeds === 0 && e.tutPassive.act === 0 && !e.tutPassive.granted,
  pv.map(r => `${r.origin} d${r.day} ${r.deeds} deeds on ${r.act} days (razed ${r.razed}, gathered ${r.gathered})`).join('; ') +
  `; tutorial d${e.tutPassive.day} ${e.tutPassive.deeds} on ${e.tutPassive.act} days — no automation stamps a day`);
ck('aTokenEffortIsToldHowFarItGot', e.token.deeds === 2 && e.token.act === 1 && !e.token.granted &&
  e.token.why === 'Build, train, gather, upgrade or raze to earn a card from a defeat — 2 of 5 deeds, orders given on 1 of 6 days.',
  `${e.token.deeds} deeds (${JSON.stringify(e.token.parts)}) on ${e.token.act} days, granted ${e.token.granted}, "${e.token.why}"`);
ck('fiveMinutesOfRealPlayOnHardEarns', [e.active, e.active2].every(r => !r.win && r.cause === 'tc_destroyed' && r.deeds >= 7 &&
  r.act >= 12 && r.granted && r.secs <= 320),
  [e.active, e.active2].map(r => `${r.deeds} deeds ${JSON.stringify(r.parts)} on ${r.act} days at ${r.secs}s, granted ${r.granted}`).join('; '));
// the deeds alone would have paid every one of these (each reads 5+): the
// days are what refuse them — and the screen says which half was missing
ck('aFrontLoadedBurstEarnsNothing', e.burst.every(r => !r.win && r.deeds >= CFG_LOSS && r.act === 1 && !r.granted &&
  r.why === 'Keep up the fight across the days to earn a card from a defeat — orders given on 1 of 6 days.'),
  e.burst.map(r => `${r.origin} razed d${r.day}: ${r.deeds} deeds on ${r.act} day${r.act === 1 ? '' : 's'}, granted ${r.granted}`).join('; '));
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
  S.stats.handGathered = 640; S.stats.handRazed = 3; S.stats.handKills = 4; S.stats.actDays = 7; S.stats.actDay = S.day;
  const json = G.saveJSON();
  G.loadJSON(json);
  out.rides = S.stats.handGathered === 640 && S.stats.handRazed === 3 && S.stats.handKills === 4 && S.stats.actDays === 7;
  const old = JSON.parse(json); delete old.stats.handGathered; delete old.stats.handRazed; delete old.stats.handKills;
  delete old.stats.actDays; delete old.stats.actDay;
  old.stats.gathered = 900; old.stats.razed = 2; old.day = 41;
  G.loadJSON(JSON.stringify(old));
  // an older save could not tell whose hand it was, nor which days had an
  // order: the run somebody saved gets the benefit of the doubt (every day
  // it reached) — but no kill can be told for an ordered one, so none is
  out.backfill = S.stats.handGathered === 900 && S.stats.handRazed === 2 && S.stats.handKills === 0 && S.stats.actDays === 41;
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

/* THE ORDERED KILL, A CARD'S RICHER HARVEST, AND THE DAYS THE TAPS STAMP.
   (1) a foe the player SENT a soldier at falling to it is a deed (one per
   three, at most two); the same kill by a soldier who found the foe on its
   own — a Defend stance, an assault's next mark — is a kill for the score
   and no deed. (2) A running Harvest Festival fills the larder 40% fuller
   and lengthens the deeds by NOTHING: the hand's allowance credits the base
   take (a naive `+= take` reads ×1.4 here). (3) A day is stamped where the
   player's input lands — through the REAL pointer handler and the panel's
   buttons — and only when an order actually changed: a selection, a pan or
   the panel's ✕ stamps nothing, and a second order the same day adds no day. */
const k = await p.evaluate(async () => {
  const out = {};
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  CFG.CARDS.ON = true;
  Screens._demo = false;
  G.newGame('deeds-kills', 'moderate', 'medium');
  Screens.show('playing'); S.paused = true;
  Combat.scanT = 0; Units.herdClock = 0;
  const tc = Bld.tcOf('P');
  const open = (x0, y0, r, skip) => MapGen.findNear(x0, y0, r, (x, y) => Path.passable(x, y, 'P') && !Bld.at(x, y) && !(skip && skip(x, y)));
  const duel = (ordered) => {
    const at = open(tc.x + 6, tc.y + 6, 12, (x, y) => S.units.some(u => Math.hypot(u.x - x - 0.5, u.y - y - 0.5) < 3));
    const sol = Units.spawn('axeman', 'P', at.x + 0.5, at.y + 0.5);
    const foe = Units.spawn('defender', 'A', at.x + 1.3, at.y + 0.5);
    sol.atk = 9999; foe.atk = 0;
    if (ordered) { sol.task = { type: 'attack', on: foe.id }; sol.tUnit = foe.id; sol.tBld = 0; }
    else { sol.task = null; sol.tUnit = foe.id; }            // marked by acquisition, as a Defend stance does
    for (let i = 0; i < 400 && S.units.includes(foe); i++) Combat.update(0.05);
    Units.despawn(sol);
    return !S.units.includes(foe);
  };
  const k0 = { kills: S.stats.kills, hand: S.stats.handKills };
  out.unorderedDied = duel(false);
  out.unordered = { kills: S.stats.kills - k0.kills, hand: S.stats.handKills - k0.hand };
  out.orderedDied = duel(true);
  out.ordered = { kills: S.stats.kills - k0.kills, hand: S.stats.handKills - k0.hand };
  out.fought = [0, 2, 3, 5, 6, 99].map(n => Deck.deeds({ handKills: n }).parts.fought);
  // (2) the festival: the same villager on the same stand, before and during
  const v = S.units.find(u => u.owner === 'P' && Units.isVillager(u));
  const f = MapGen.findNear(Math.round(v.x), Math.round(v.y), 20, (x, y) => S.map.terrain[MapGen.idx(x, y)] === T.FOREST);
  S.map.resAmount[MapGen.idx(f.x, f.y)] = 1e6;
  Units.assignGather(v, f.x, f.y);
  const h00 = S.stats.handGathered;
  for (let i = 0; i < 2400 && S.stats.handGathered === h00; i++) Units.update(0.25);   // walked out, first stroke
  for (let i = 0; i < 40; i++) Units.update(0.25);           // settled at the stand
  const leg = () => { const h0 = S.stats.handGathered, w0 = S.res.wood; for (let i = 0; i < 200; i++) Units.update(0.25);
    return { hand: S.stats.handGathered - h0, wood: S.res.wood - w0 }; };
  out.plain = leg();
  Deck._add('harvest_festival', 1);
  out.played = Deck.play('harvest_festival').ok;
  out.fest = leg();
  S.deck.fx = [];                                            // the festival over
  // (3) the days, through the real pointer handler and the panel
  S.deck.played = []; S.stats.actDays = 0; S.stats.actDay = 0; S.day = 3;
  UI.deselect();
  const TL = CFG.TILE;
  const scr = (wx, wy) => ({ x: (wx * TL - R.cam.x) * R.cam.z, y: (wy * TL - R.cam.y) * R.cam.z });
  const stand = MapGen.findNear(tc.x + 1, tc.y + 1, 14, (x, y) => S.map.terrain[MapGen.idx(x, y)] === T.FOREST && S.map.resAmount[MapGen.idx(x, y)] > 0 &&
    !S.units.some(u => Math.hypot(u.x - x - 0.5, u.y - y - 0.5) < 2));
  S.map.explored.fill(1); G.updateVisibility();
  R.centerOn(stand.x + 0.5, stand.y + 0.5);
  out.stand = scr(stand.x + 0.5, stand.y + 0.5);
  const grass = open(stand.x, stand.y, 6, (x, y) => S.map.terrain[MapGen.idx(x, y)] !== T.GRASS ||
    S.units.some(u => Math.hypot(u.x - x - 0.5, u.y - y - 0.5) < 1.5) || Math.abs(x - stand.x) + Math.abs(y - stand.y) < 2);
  out.grass = scr(grass.x + 0.5, grass.y + 0.5);
  const vs = S.units.filter(u => u.owner === 'P' && Units.isVillager(u)).slice(0, 2);
  for (const u of vs) { u.task = null; u.path = null; }
  out.vs = vs.map(u => u.id);
  return out;
});
const click = async (pt) => { await p.mouse.click(pt.x, pt.y); await p.waitForTimeout(420); };   // never a double-tap
const days = () => p.evaluate(() => S.stats.actDays);
const d0 = await days();
await click(k.grass);                                                       // nothing selected: no order
const dSel0 = await days();
await p.evaluate((id) => UI.select('unit', id), k.vs[0]);
await click(k.stand);                                                       // a villager sent to the stand
const dOrd = await days();
await p.evaluate((id) => UI.select('unit', id), k.vs[1]);
await click(k.stand);                                                       // a second order, the same day
const dSame = await days();
// the villager walks into view (paused: it is placed) — a tap must land on it
const vScr = await p.evaluate(({ id, g }) => {
  S.day = 4; UI.deselect();
  const u = Units.get(id), TL = CFG.TILE;
  const gx = (g.x / R.cam.z + R.cam.x) / TL, gy = (g.y / R.cam.z + R.cam.y) / TL;
  const at = MapGen.findNear(Math.floor(gx), Math.floor(gy) - 2, 4, (x, y) => Path.passable(x, y, 'P') && !Bld.at(x, y) &&
    Math.hypot(x + 0.5 - gx, y + 0.5 - gy) >= 1.5 && !S.units.some(o => o !== u && Math.hypot(o.x - x - 0.5, o.y - y - 0.5) < 1.5));
  u.x = at.x + 0.5; u.y = at.y + 0.5; u.path = null;
  G.updateVisibility();                                      // it sees where it stands (a tap hits only what is seen)
  return { x: (u.x * TL - R.cam.x) * R.cam.z, y: (u.y * TL - CFG.SPRITE_LIFT - R.cam.y) * R.cam.z };
}, { id: k.vs[0], g: k.grass });
await click(vScr);                                                          // a tap that only SELECTS
const dLook = await p.evaluate(() => ({ n: S.stats.actDays, sel: !!(UI.sel && UI.sel.type === 'unit') }));
await p.evaluate((id) => UI.select('unit', id), k.vs[0]);
await click(k.grass);                                                       // a walk order on a new day
const dWalk = await days();
const pn = await p.evaluate(async () => {
  const out = {};
  const tc = Bld.tcOf('P');
  S.day = 5;
  const sol = Units.spawn('defender', 'P', tc.x + 0.5, tc.y + 2.5);
  sol.defend = false;
  UI.select('unit', sol.id); UI.renderPanel();
  const close = document.querySelector('#panel #panelClose');
  out.def = !!document.querySelector('#panel [data-act="defend"]');
  if (close) close.click();                                                // the ✕ is no order
  out.afterClose = S.stats.actDays;
  UI.select('unit', sol.id); UI.renderPanel();
  const def = document.querySelector('#panel [data-act="defend"]');
  if (def) def.click();                                                     // Defend is
  out.afterDefend = S.stats.actDays;
  out.defending = !!sol.defend;
  return out;
});
ck('anOrderedKillIsADeedAndNoOtherKillIs', k.unorderedDied && k.orderedDied && k.unordered.kills === 1 && k.unordered.hand === 0 &&
  k.ordered.kills === 2 && k.ordered.hand === 1 && JSON.stringify(k.fought) === '[0,0,1,1,2,2]',
  `found on its own: kills +${k.unordered.kills}, ordered +${k.unordered.hand}; sent at it: kills +${k.ordered.kills}, ordered +${k.ordered.hand}; allowance ${JSON.stringify(k.fought)}`);
ck('aRicherHarvestIsNoLongerADeed', k.played && k.plain.hand > 1 && k.fest.wood > k.plain.wood * 1.35 &&
  Math.abs(k.fest.hand - k.plain.hand) < 1e-6 * Math.max(1, k.plain.hand),
  `plain: +${k.plain.wood.toFixed(2)} wood, +${k.plain.hand.toFixed(2)} to the hand; festival: +${k.fest.wood.toFixed(2)} wood, +${k.fest.hand.toFixed(2)} to the hand`);
ck('aDayIsStampedByAnOrderNotATap', d0 === 0 && dSel0 === 0 && dOrd === 1 && dSame === 1 && dLook.n === 1 && dLook.sel && dWalk === 2,
  `start ${d0}; an empty tap ${dSel0}; an order ${dOrd}; a second the same day ${dSame}; a tap that selects ${dLook.n} (selected ${dLook.sel}); a walk the next day ${dWalk}`);
ck('andAPanelButtonThatActsIsAnOrder', pn.def && pn.afterClose === 2 && pn.afterDefend === 3 && pn.defending,
  `Defend offered ${pn.def}; after ✕ ${pn.afterClose}; after Defend ${pn.afterDefend} (defending ${pn.defending})`);

/* NO CARD BUYS A CARD. Every deed is something the player's own hand
   started; a card's free building, free upgrade or summoned soldier is the
   card's (ruling 6 — and a slip there would let one card's play buy the
   next one from a defeat). Every card with an effect is played in a fresh
   world — aimed cards at the first valid ground beside the hall — with the
   player's own work already standing: a house site they laid and PAID for,
   nobody building it, and a house mid-upgrade they ordered, nobody on the
   scaffold. After the play the player lays one more house through the real
   placement confirm, and the world runs three days with no other input.
   Every deed that moves is then ATTRIBUTED: a finish of a site the player
   placed, or an upgrade they ordered, is theirs (the RULING: a card may
   hasten the player's own paid work — Master Builders standing up a house
   they placed, Quick Hands doubling the builders — because the deed is the
   order's and the card only spares the wait); anything else is the card
   conjuring a deed out of work nobody ordered, and fails. Deferred and
   charge cards are seen this way too, since the placement after the play is
   the one their effect lands on. A card's play also stamps no day of
   orders. Two controls must be caught, or a pass means nothing: a card that
   raises a FREE house through Bld.finish, and one that bills a free
   upgrade's deed through Bld.finishUpgrade. Cards whose can() refuses on a
   bare day-1 town are named, never failed. */
const nc = await p.evaluate(() => {
  const out = { moved: [], measured: [], refused: [], control: {}, hastened: [] };
  CFG.CARDS.ON = true;
  const spotFor = (key, avoid) => {
    const tc = Bld.tcOf('P');
    return MapGen.findNear(tc.x + 1, tc.y + 1, 10, (x, y) => Bld.canPlace('P', key, x, y).ok && !(avoid && avoid(x, y)));
  };
  Deck.FX.__builds = { apply() {
    const sp = spotFor('house');
    const b = sp && Bld.place('P', 'house', sp.x, sp.y, { free: true, noAutoAssign: true });
    if (!b) return { ok: false, why: 'no ground' };
    Bld.finish(b);
    return { ok: true };
  } };
  Deck.FX.__upgrades = { apply() {
    const h = S.buildings.find(b => b.owner === 'P' && b.key === 'tc');
    h.upgrading = 1; Bld.finishUpgrade(h);
    return { ok: true };
  } };
  for (const id of ['__builds', '__upgrades'])
    Deck.CATALOG.push({ id, tier: 'stone', cat: 'econ', target: 'none', name: 'b', text: 't', flavor: 'f', when: 'w' });
  Deck._byId = null;
  // THE LEDGER: every deed is booked to the call that moved it
  let orderedBuild = new Set(), orderedUpg = new Set(), explained = 0;
  const real = { place: Bld.place, finish: Bld.finish, finishUpgrade: Bld.finishUpgrade };
  Bld.place = function (owner, key, x, y, opts) {
    const d0 = Deck.deeds().n, b = real.place.call(this, owner, key, x, y, opts);
    if (b && owner === 'P' && !(opts && opts.free)) { orderedBuild.add(b.id); explained += Deck.deeds().n - d0; }
    return b;
  };
  Bld.finish = function (b, ...r) {
    const d0 = Deck.deeds().n, v = real.finish.call(this, b, ...r);
    if (b && orderedBuild.has(b.id)) explained += Deck.deeds().n - d0;
    return v;
  };
  Bld.finishUpgrade = function (b, ...r) {
    const d0 = Deck.deeds().n, v = real.finishUpgrade.call(this, b, ...r);
    if (b && orderedUpg.has(b.id)) explained += Deck.deeds().n - d0;
    return v;
  };
  try {
    const ids = Object.keys(Deck.FX).filter(k => Deck.card(k) && !k.startsWith('__')).sort();
    for (const id of ids.concat('__builds', '__upgrades')) {
      Screens._demo = false;
      G.newGame('no-card-buys-' + id, 'moderate', 'medium');
      Screens.show('playing'); S.paused = false;
      Combat.scanT = 0; Units.herdClock = 0;
      for (const k of ['food', 'wood', 'stone', 'gold']) S.res[k] = 5000;
      Deck._col = null; Deck._del(Deck.KEY);
      Deck._add(id, 1);
      orderedBuild = new Set(); orderedUpg = new Set(); explained = 0;
      // the player's own work, standing when the card is played
      const s1 = spotFor('house'), site = Bld.place('P', 'house', s1.x, s1.y, { noAutoAssign: true });
      const s2 = spotFor('house', (x, y) => Math.abs(x - s1.x) + Math.abs(y - s1.y) < 3);
      const upg = Bld.place('P', 'house', s2.x, s2.y, { free: true, instant: true, noAutoAssign: true });
      upg.upgrading = upg.upgTotal = 3; orderedUpg.add(upg.id);
      const c = Deck.card(id), tc = Bld.tcOf('P');
      let tgt = null;
      if (c.target !== 'none') {
        const sp = MapGen.findNear(tc.x + 1, tc.y + 1, 12, (x, y) => Deck.validTarget(id, x + 0.5, y + 0.5) &&
          Math.hypot(x - tc.x, y - tc.y) > 4);
        if (sp) tgt = { x: sp.x + 0.5, y: sp.y + 0.5 };
      }
      const d0 = Deck.deeds().n, a0 = S.stats.actDays, e0 = explained;
      const r = Deck.play(id, tgt);
      if (!r.ok) { out.refused.push(id + ': ' + r.why); continue; }
      const a1 = S.stats.actDays;
      // …then the player lays one more house, through the real confirm
      const s3 = spotFor('house', (x, y) => Math.abs(x - s1.x) + Math.abs(y - s1.y) < 3 || Math.abs(x - s2.x) + Math.abs(y - s2.y) < 3);
      UI.enterPlacement('house');
      if (UI.placeGhost) { UI.placeGhost.x = s3.x; UI.placeGhost.y = s3.y; UI.placeGhost.set = true; }
      UI.confirmPlacement();
      UI.exitPlacement();
      const laid = S.buildings.some(b => b.owner === 'P' && b.key === 'house' && b.x === s3.x && b.y === s3.y);
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
      const moved = Deck.deeds().n - d0, mine = explained - e0, conjured = moved - mine;
      if (id.startsWith('__')) { out.control[id] = conjured; continue; }
      out.measured.push(id);
      if (!laid) out.moved.push(`${id}: the player's own placement never landed`);
      if (conjured !== 0 || a1 !== a0)
        out.moved.push(`${id}: deeds ${moved > 0 ? '+' : ''}${moved}, the player's own work explains ${mine}; days ${a0}→${a1} at the play ${JSON.stringify(Deck.deeds().parts)}`);
      if (mine) out.hastened.push(`${id} +${mine}`);
    }
  } finally {
    Object.assign(Bld, real);
  }
  return out;
});
ck('noCardPlayIsADeed', nc.moved.length === 0 && nc.measured.length >= 5 && nc.control.__builds === 1 && nc.control.__upgrades === 1,
  `${nc.measured.length} cards played over a staged site, a staged upgrade and a placement after the play, run three days: ` +
  `${nc.moved.join('; ') || 'no deed but the player\'s own'}${nc.hastened.length ? ' (the player\'s own work: ' + nc.hastened.join(', ') + ')' : ''}; ` +
  `the controls (a free house through Bld.finish, a free upgrade through finishUpgrade) read +${nc.control.__builds} / +${nc.control.__upgrades}` +
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
  const REAL = JSON.stringify({ v: 1, counts: { swift_raiders: 2, gold_nugget: 1 }, seen: { swift_raiders: 1 }, pity: 9,
    starter: 5, runs: { k1: [{ id: 'swift_raiders', tier: 'iron' }] }, queue: [{ op: 'grant', at: 7 }], medians: {} });
  await p2.evaluate((REAL) => { Deck._set(Deck.KEY, REAL); }, REAL);
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
    // EARNED IS EARNED: the win is banked in the set-aside real collection too
    o.cards = (g.cards || []).map(c => c.id);
    o.legend = (g.cards || []).some(c => c.tier === 'enlight');
    o.toy = Deck.total();
    o.stashRaw = Deck._get(Deck.REAL_KEY);
    o.stash = JSON.parse(o.stashRaw || 'null');
    o.reSettle = Deck.settle(Object.assign(Deck.report(true, 'razed_rival_tc'), { key: 'cards-all-win' })).again === true;
    o.stashAfterAgain = Deck._get(Deck.REAL_KEY);
    return o;
  });
  // …and every card it deals can be played: each has its effect built
  const unbuilt = await p2.evaluate(() => Deck.CATALOG.filter(c => !Deck.FX[c.id]).map(c => c.id));
  ck('everyCardInTheCatalogIsBuilt', unbuilt.length === 0, unbuilt.join(',') || 'all 36');
  ck('theTestLinkDealsTheWholeCatalog', a1.on && a1.dev === '1' && a1.total === 36 && a1.all && a1.test,
    `on ${a1.on}, device ${a1.dev}, ${a1.total} cards, one of each ${a1.all}`);
  ck('andResetsTheCollectionFirst', a1.runs === 0 && a1.pity === 0 && a1.queue === 0 && a1.starter && a1.again === false,
    `ledger ${a1.runs}, pity ${a1.pity}, queue ${a1.queue}, starter marked ${a1.starter} (a second ask deals ${a1.again})`);
  ck('aTestDeckWritesNothingForTheCloud', a1.played && a1.granted && a1.queued === 0, `played ${a1.played}, granted ${a1.granted}, queued ${a1.queued}`);
  /* EARNED IS EARNED (the playtest's test-link slice): a WIN settled while
     the toy deck is held used to be granted into the toy alone — queued
     nowhere, wiped by ?cards=0. It lands in the toy AND in the set-aside
     real collection, its grant op queued in that collection's own queue
     behind what it was already waiting to send; everything the stash held
     is kept, and settling the run again pays nobody twice. */
  {
    const R0 = JSON.parse(REAL), st = a1.stash || {};
    const want = {};
    for (const id in R0.counts) want[id] = R0.counts[id];
    for (const id of a1.cards) want[id] = (want[id] || 0) + 1;
    const countsOk = !!a1.stash && Object.keys(want).every(id => st.counts[id] === want[id]) &&
      Object.keys(st.counts).every(id => want[id] === st.counts[id]);
    const q = st.queue || [];
    const opOk = q.length === 2 && q[0].op === 'grant' && q[0].at === 7 && q[1].op === 'grant' && q[1].key === 'cards-all-win' &&
      JSON.stringify(q[1].cards) === JSON.stringify(a1.cards);
    const keptOk = st.starter === 5 && st.seen.swift_raiders === 1 && !!st.runs.k1 && !!st.runs['cards-all-win'] &&
      a1.cards.every(id => st.seen[id] > 0) && !st.test;
    // the REAL count moves (9 → 10 on a win, 0 on a legend), never the toy's alone
    const pityOk = st.pity === (a1.legend ? 0 : R0.pity + 1);
    ck('aCardEarnedOnATestDeckIsBankedInTheRealCollection',
      a1.cards.length >= 1 && countsOk && opOk && keptOk && pityOk && a1.toy === 35 + a1.cards.length,
      `granted ${a1.cards.join('+')}; real counts ${JSON.stringify(st.counts)}; its queue ${q.map(o => o.op + (o.key ? ':' + o.key : '')).join(', ')}; ` +
      `kept ${keptOk}, pity ${st.pity}; the toy holds ${a1.toy}`);
    ck('andSettlingTheRunAgainBanksNothing', a1.reSettle && a1.stashAfterAgain === a1.stashRaw, `again ${a1.reSettle}`);
  }
  // every load carrying it deals afresh — and the switch thrown at launch must
  // not stop the link being read (an on() that asked the switch first never
  // read the address at all)
  await load('?cards=all');
  const a2 = await p2.evaluate(() => {
    const o = { reloaded: (Deck.ensureStarter(), Deck.total()) };
    // the re-dealt toy forgot the run it banked: settled again, the real
    // collection is never paid twice
    const st0 = Deck._get(Deck.REAL_KEY);
    const g2 = Deck.settle(Object.assign(Deck.report(true, 'razed_rival_tc'), { key: 'cards-all-win' }));
    o.rebank = { again: g2.again === true, same: Deck._get(Deck.REAL_KEY) === st0, toy: Deck.total() };
    Deck._add('gold_nugget', -1); Deck.saveCol();
    o.spent = Deck.total();
    Deck._dev = null; Deck._all = false; CFG.CARDS.ON = true;
    Deck.on(); Deck.ensureStarter();
    o.switchOn = Deck.total();
    return o;
  });
  ck('everyLoadOfTheLinkDealsAfresh', a2.reloaded === 36, `${a2.reloaded} after a reload`);
  ck('andARedealtToyNeverBanksARunTwice', a2.rebank.again && a2.rebank.same && a2.rebank.toy === 36, JSON.stringify(a2.rebank));
  ck('andTheLinkIsReadWithTheSwitchOn', a2.spent === 35 && a2.switchOn === 36, `${a2.spent} → ${a2.switchOn} with CFG.CARDS.ON`);
  // a load WITHOUT it keeps the deck it dealt and the device's switch — and
  // a TEST deck never hides behind the lesson: a tester on a fresh device gets
  // the tutorial switched on by itself, and the link must not read as broken
  await load('');
  const a3 = await p2.evaluate(() => {
    Deck.ensureStarter();
    const tut0 = S.tut; S.tut = { on: true, phase: 1, step: 3, done: {}, fired: {} };
    const o = { on: Deck.on(), total: Deck.total(), held: Deck.lessonHolds() };
    S.tut = tut0;
    return o;
  });
  ck('andAPlainLoadKeepsIt', a3.on && a3.total === 36, `on ${a3.on}, ${a3.total}`);
  ck('andATestDeckNeverWaitsForTheLesson', a3.held === false, `held behind the spine: ${a3.held}`);
  /* ?cards=0 forgets the device switch AND the toy deck (a test deck never
     syncs, so a device left holding one would never sync again) — and hands
     back the REAL collection the link put aside, exactly as it was stored:
     its cards, its pity, its run ledger and the cloud op still waiting */
  await load('?cards=0');
  const a4 = await p2.evaluate(() => ({ on: Deck.on(), stored: Deck._get(Deck.KEY), stash: Deck._get(Deck.REAL_KEY) }));
  // …exactly as it was set aside — with the card earned on the toy deck in it
  ck('andCardsZeroGivesTheRealCollectionBack', !a4.on && a4.stored === a1.stashRaw && a4.stash === null,
    `off ${!a4.on}; the real collection back exactly, earnings and all: ${a4.stored === a1.stashRaw}${a4.stored === a1.stashRaw ? '' : ' (' + String(a4.stored).slice(0, 90) + ')'}; stash cleared ${a4.stash === null}`);
  // …and a device that had NO collection before the link starts afresh: the
  // toy deck gone, and ?cards=1 deals the starter hand to a real collection
  await p2.evaluate(() => { Deck._del(Deck.KEY); Deck._del(Deck.REAL_KEY); });
  await load('?cards=all');
  await p2.evaluate(() => Deck.ensureStarter());
  await load('?cards=0');
  const a5a = await p2.evaluate(() => ({ stored: Deck._get(Deck.KEY), stash: Deck._get(Deck.REAL_KEY) }));
  await load('?cards=1');
  const a5 = await p2.evaluate(() => { Deck.ensureStarter(); return { on: Deck.on(), total: Deck.total(), test: Deck.isTest(), queue: Deck.col().queue.length }; });
  ck('andCardsZeroForgetsTheToyDeck', a5a.stored === null && a5a.stash === null && a5.on && a5.total === 3 && !a5.test && a5.queue === 1,
    `stored ${a5a.stored === null ? 'gone' : 'kept'}; then ?cards=1: ${a5.total} cards, test ${a5.test}, queued ${a5.queue}`);
  // …while a REAL collection survives ?cards=0 untouched
  await p2.evaluate(() => { Deck._add('swift_raiders', 2); Deck.saveCol(); });
  await load('?cards=0');
  const a6 = await p2.evaluate(() => { const c = JSON.parse(Deck._get(Deck.KEY) || 'null'); return c && c.counts && c.counts.swift_raiders; });
  ck('butARealCollectionSurvivesIt', a6 === 2, `swift raiders kept: ${a6}`);
  /* …and the playtest's own repro, on a device that had NO real collection:
     ?cards=all, then a PLAIN visit (the toy deck still held — a phone
     relaunch drops the query), a win there, ?cards=0, ?cards=1 — the won
     cards are still the player's, with the grant waiting to sync and the
     starter hand marked as given (the test deck's mark), no toys left */
  await p2.evaluate(() => { Deck._del(Deck.KEY); Deck._del(Deck.REAL_KEY); });
  await load('?cards=all');
  await p2.evaluate(() => Deck.ensureStarter());
  await load('');
  const a7 = await p2.evaluate(() => {
    Deck.ensureStarter();
    Screens._demo = false;
    G.newGame('cards-plain-win', 'moderate', 'medium');
    Screens.show('playing'); S.paused = true;
    const g = Deck.settle(Object.assign(Deck.report(true, 'razed_rival_tc'), { key: 'plain-visit-win' }));
    return { test: Deck.isTest(), cards: (g.cards || []).map(c => c.id), toyQueue: Deck.col().queue.length };
  });
  await load('?cards=0');
  await load('?cards=1');
  const a8 = await p2.evaluate(() => {
    const dealt = Deck.ensureStarter(), c = Deck.col();
    return { test: Deck.isTest(), total: Deck.total(), counts: c.counts, starter: !!c.starter, dealt,
      queue: c.queue.map(o => ({ op: o.op, key: o.key, cards: o.cards })) };
  });
  const sumOk = a7.cards.length >= 1 && a7.cards.every(id => a8.counts[id] >= 1) && a8.total === a7.cards.length;
  ck('andAWinOnAPlainVisitIsStillThePlayersAfterCardsZero',
    a7.test && a7.toyQueue === 0 && !a8.test && sumOk && a8.starter && a8.dealt === false &&
    a8.queue.length === 1 && a8.queue[0].op === 'grant' && a8.queue[0].key === 'plain-visit-win' &&
    JSON.stringify(a8.queue[0].cards) === JSON.stringify(a7.cards),
    `won on the toy deck: ${a7.cards.join('+')} (toy queue ${a7.toyQueue}); after ?cards=0 and ?cards=1: ${a8.total} cards ${JSON.stringify(a8.counts)}, ` +
    `test ${a8.test}, starter marked ${a8.starter} (dealt again ${a8.dealt}), queued ${JSON.stringify(a8.queue)}`);
  await ctx2.close();
}

/* ONE WORD, ONE THING (the playtest): "the deck" is the card collection
   now — the HUD button, the sheet, the deck's own lesson. The origin draft
   used to say it dealt "three cards from the deck", so the word named two
   different piles of cards on two screens a minute apart. The draft's help,
   as the page renders it, deals ORIGIN cards and never says "deck". */
{
  const help = await p.evaluate(() => { const el = document.getElementById('draftOverlay'); return el ? el.textContent.replace(/\s+/g, ' ').trim() : ''; });
  ck('theOriginDraftNeverCallsItsCardsTheDeck', !!help && !/\bdeck\b/i.test(help) && /three origin cards/i.test(help), help.slice(0, 140));
}

for (const [k, v] of Object.entries(res)) console.log((v.startsWith('PASS') ? ' ' : '✗') + ' ' + k + ': ' + v);
if (errs.length) console.log('PAGE ERRORS:', errs.slice(0, 4));
await b.close();
if (fails.length || errs.length) { console.log('FAILURES:', fails.join(', ') || 'pageerrors'); process.exit(1); }
console.log('ALL DECK-CORE CHECKS PASS');
