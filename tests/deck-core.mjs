/* THE CARD SYSTEM — the core (js/deck.js): what a card is, who earns one,
   where it is kept, and the one door it is played through.

   This file pins:

     THE CATALOG     36 cards, 8/8/7/7/6 by tier, every one with a name, an
                     exact effect, a flavor line, a play condition, a kind
                     and a targeting rule — exactly the Gate 1 catalog
     THE SWITCH      CFG.CARDS.ON ships false: off, nothing is granted, no
                     starter hand is dealt and nothing can be played
     THE DROPS       the approved tables, each summing to 100; the gates
                     (a struck banner, under ten minutes, under 500 before
                     the multiplier) earn nothing; a great victory earns a
                     second card; 15 wins without a legend guarantee one;
                     a measured roll lands on the table it was asked for
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

   Run after touching: js/deck.js, CFG.CARDS, S.deck in game.js.

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
  const rep = (o) => Object.assign({ win: true, cause: 'razed_rival_tc', mode: 'moderate', day: 400, seconds: 900, subtotal: 4000, runId: null }, o);
  // gates
  out.banner = Deck.settle(rep({ win: false, cause: 'struck_banner', key: 'g1' }), rng).ok;
  out.short = Deck.settle(rep({ seconds: 599, key: 'g2' }), rng).ok;
  out.low = Deck.settle(rep({ subtotal: 499, key: 'g3' }), rng);
  out.lossOk = Deck.settle(rep({ win: false, cause: 'tc_destroyed', key: 'g4' }), rng);
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
ck('aStruckBannerEarnsNothing', c.banner === false);
ck('tenMinutesAreRequired', c.short === false);
ck('fiveHundredBeforeTheMultiplier', c.low.ok === false && /Score 500/.test(c.low.why), c.low.why);
ck('aLossEarnsACard', c.lossOk.ok && c.lossOk.cards.length === 1 && ['stone', 'bronze'].includes(c.lossOk.cards[0].tier), JSON.stringify(c.lossOk.cards));
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
ck('theRunRemembersWhatItPlayed', JSON.parse(d.played).length === 1 && d.consumeQueued === 1, d.played);
ck('nothingDrawsFromTheRunsRng', d.rngSame);
ck('theRunStateRidesASave', d.rides && d.backfill, `rides ${d.rides}, backfill ${d.backfill}`);
ck('aSecondPlayExtendsNotStacks', d.extends === 2 && d.oneEntry === 1, `+${d.extends} days, ${d.oneEntry} entry`);
ck('timersCountGameDays', d.pausedLeft === 0 && d.notYet === 0 && d.ended === 1 && d.gone === 0,
  `paused drift ${d.pausedLeft}, ended ${d.ended}`);
ck('everyFaceIsAWholeMultiple', d.faces.every(k => Number.isInteger(k) && k >= 1) && Math.abs(d.faceW - Math.round(d.faceW)) < 0.01,
  `dpr ${d.dpr}: ${d.faces.join(', ')}; drawn ${d.faceW}`);
ck('aDuplicateWearsItsCount', d.badge === '×3', String(d.badge));

/* THE REVIEW LINK (gate review only — delete with the param at launch):
   ?cards=slice turns the deck on for the device and tops the hand up to one
   of each card whose effect is BUILT, never a card that would only refuse */
{
  const ctx2 = await b.newContext({ viewport: { width: 430, height: 880 } });
  const p2 = await ctx2.newPage();
  p2.on('pageerror', e => errs.push(String(e)));
  await p2.goto(url + '?cards=slice', { waitUntil: 'domcontentloaded' });
  await p2.waitForFunction(() => window.Deck && window.Screens && Screens.current, null, { timeout: 15000 });
  const sl = await p2.evaluate(() => {
    Deck.ensureStarter();
    const built = Object.keys(Deck.FX).filter(id => Deck.card(id)).sort();
    return { on: Deck.on(), built: built.join(','), held: built.every(id => Deck.count(id) >= 1),
      unbuilt: Deck.CATALOG.filter(c => !Deck.FX[c.id] && Deck.count(c.id) > 0 && !CFG.CARDS.STARTER.includes(c.id)).map(c => c.id) };
  });
  ck('theReviewLinkDealsTheBuiltCards', sl.on && sl.held && sl.unbuilt.length === 0 &&
    // the gate-2 five, the town group's nine and the army group's nine
    sl.built === 'ancestors_host,dragonfire,fallen_timber,forager_cache,gold_nugget,harvest_festival,hunters_pack,iron_legion,legion_marches,loose_stone,master_builders,mending,siege_train,starfall,stone_skin,swift_raiders,trade_caravan,trebuchet_battery,unbreakable_hall,veterans,war_band,watchfires,willing_hands',
    `on ${sl.on}; dealt ${sl.built}; unbuilt dealt ${sl.unbuilt.join(',') || 'none'}`);
  await ctx2.close();
}

for (const [k, v] of Object.entries(res)) console.log((v.startsWith('PASS') ? ' ' : '✗') + ' ' + k + ': ' + v);
if (errs.length) console.log('PAGE ERRORS:', errs.slice(0, 4));
await b.close();
if (fails.length || errs.length) { console.log('FAILURES:', fails.join(', ') || 'pageerrors'); process.exit(1); }
console.log('ALL DECK-CORE CHECKS PASS');
