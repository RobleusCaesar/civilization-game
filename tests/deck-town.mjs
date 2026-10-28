/* THE CARD SYSTEM — the TOWN (js/deckfx-town.js): goods and the town's own
   defences, nine cards, each measured doing exactly what its card says, and
   every trap the survey found pinned by a check that would FAIL on the
   obvious implementation — each with its CONTROL beside it, so the probe can
   be seen to see.

     THE SWITCH        off, nothing plays and no hook moves a number: a siege
                       on a walled town with three kinds of tower shooting,
                       a catapult, axes on the hall and the summer's fire on a
                       roof are byte-identical with the hooks, with no Deck at
                       all, and with the switch on but no card played — the
                       floats and the run's RNG included; and a ✓ with no
                       charge in hand lays a site and sends a builder exactly
                       as it always did
     THE GOODS         +200 wood, +150 stone, +60 gold, and +250 food +250
                       wood +100 gold — to the stockpile and nowhere else:
                       never the harvest the score counts, never a roll of
                       the run's RNG; the goods fly to the chips the card's
                       own text names; each lands in a moment at the hall
     MENDING           every finished building to full, walls and gates and
                       a building in its upgrade included, fires out with the
                       hp; a work site left as it was, the rival's untouched;
                       refused in its own words with nothing to mend — and a
                       damaged SITE alone is nothing to mend
     MASTER BUILDERS   three charges, a second card three more; the next
                       buildings placed through the ✓ stand complete at full
                       strength, paid for, with no builder pulled off anything
                       to walk to a finished site — and a station takes its
                       hand (the one chosen, or the nearest idle); never a wall
                       line (one drag is never three charges), never a gate,
                       never the Wonder (finishing one IS the win), never the
                       rival's ten placements; the last charge clears its key;
                       the chip on the strip and the chip on the ghost say so
     WATCHFIRES        the player's towers and War Camps reach 50% farther
                       and hit 50% harder, 6 days; the rival's towers never;
                       the level-1 fumble draws exactly as it always did
                       (the run's RNG moves the same, the misses fall on the
                       same shots); refused with no FINISHED tower or camp
     STONE SKIN        half of every blow on the player's works for 8 days —
                       a siege stone, an axe, the summer's fire — and the
                       float says the half, never the blow (critic §2.21); a
                       building that would have fallen stands; the rival's
                       works take blows in full
     UNBREAKABLE HALL  12 days in which the player's hall stops at a sliver
                       (2% of its strength) on the attack path and the wilds'
                       fire alike, "Held!" for a blow swallowed whole, never
                       raised from below; every other building still falls;
                       the rival's Wonder still ends the run; and on day 13
                       the hall can fall again
     TIMED CARDS       a second play lengthens, never strengthens; each ends
                       on its day and says so
     SAVES             timers, charges and the hooks' answers ride a save
     NO RNG / NO SCORE no card draws S.rngState; only the Master Builders'
                       PAID building scores (as any raised building does)
     THE PICTURE       every show draws at every beat of every layer, every
                       running card's look draws, a frame with no card pays
                       nothing, the shows are render state only, every voice
                       is synthesized; the looks answer blows and never the
                       summer's fire; the burning arrow is the player's alone
                       (another card's factor on the rival's arrows never
                       dresses them as the watchfires) and so is the fog gate
     WHAT IT STANDS ON a burned building wears its own picture under a
                       card's light, laid at the device's size in a few shared
                       scratches (never a copy per sprite or colour); the
                       goods bring the hall on screen; the
                       caravan's road is land the cart can carry, shortened
                       before water, off the row people stand on, and with
                       no road the load still comes; a charge kept under
                       another key (the pact's) still wears its card's chip

   Run after touching: js/deckfx-town.js, Bld.damage's card hook and its
   return, Combat.hitBuilding's float, the tower fire in Combat.update,
   UI.confirmPlacement / _placeCheck's Master Builders lines, DeckUI's charge
   chip (_timers / _alsoRunning / _chip).

     node tests/deck-town.mjs      # exits non-zero on any regression */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });
const ctx = await b.newContext({ viewport: { width: 430, height: 880 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_FILE_NOT_FOUND')) errs.push('console: ' + m.text()); });
await p.goto('file://' + join(root, 'index.html'), { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.Deck && window.Screens && Screens.current === 'title', null, { timeout: 120000 });

const res = {}, fails = [];
const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };

const TOWN = ['fallen_timber', 'loose_stone', 'gold_nugget', 'trade_caravan', 'mending', 'master_builders',
  'watchfires', 'stone_skin', 'unbreakable_hall'];

await p.evaluate(({ TOWN }) => {
  Boot.force(); Screens._demo = false;
  // the RAF loop stands down: a test drives the sim and the picture itself
  window.requestAnimationFrame = () => 0;
  const W = () => CFG.W, H = () => CFG.H;
  window.__tw = {
    TOWN,
    seed(n) { let s = n || 7; Math.random = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; Combat.scanT = 0; Units.herdClock = 0; },
    // a fresh run with the switch ON and a hand of every town card
    fresh(seed, mode) {
      CFG.CARDS.ON = true;
      G.newGame(seed, mode || 'moderate', 'medium');
      S.paused = true;
      Deck._col = null; Deck._del(Deck.KEY);
      for (const id of TOWN) Deck._add(id, 9);
      R.cardShows = [];
      return S;
    },
    // a flat, fully known world with only the two halls on it: every number
    // below is measured on ground the test built, so no seed can flatter it
    flat() {
      for (let i = 0; i < W() * H(); i++) { S.map.terrain[i] = T.GRASS; S.map.explored[i] = 1; S.map.resAmount[i] = 0; }
      S.units = []; S.buildings = S.buildings.filter(z => z.key === 'tc');
      const P = Bld.tcOf('P'), A = Bld.tcOf('A');
      P.x = 8; P.y = 8; A.x = W() - 6; A.y = H() - 6;
      Bld._block = null;
      R.cardShows = []; R.floats = [];
      return P;
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
    lift(bb, lv) { bb.level = lv; bb.hp = bb.maxhp = Bld.lv(bb).hp; return bb; },
    // the placement confirm, exactly as the ✓ runs it
    confirm(key, x, y, builderId) {
      UI.placing = key; UI.builderFor = builderId || null;
      UI.placeGhost = { x, y, set: true };
      UI.confirmPlacement();
      const nb = S.buildings.find(z => z.owner === 'P' && z.key === key && z.x === x && z.y === y);
      if (UI.placing) UI.exitPlacement();
      return nb || null;
    },
    floatsDuring(fn) {
      const seen = [], f0 = R.float;
      R.float = function (x, y, txt, col) { seen.push(txt); return f0.call(this, x, y, txt, col); };
      try { fn(); } finally { R.float = f0; }
      return seen;
    },
    // the end screen, stood down while a check reads S.over
    quietEnd(fn) {
      const se = UI.showEnd, fr = window.Backend && Backend.finalizeRun;
      UI.showEnd = () => {}; if (fr) Backend.finalizeRun = () => {};
      try { return fn(); } finally { UI.showEnd = se; if (fr) Backend.finalizeRun = fr; }
    },
    // game days pass: the timers' clock is S.day, and Deck.tick expires
    days(n) { S.day += n; Deck.tick(); },
    lastLog() { return (S.log[0] && S.log[0].msg) || ''; },
  };
}, { TOWN });

// ---------------- 0. THE SWITCH: off, nothing moves ----------------
{
  const r = await p.evaluate(() => {
    const out = {};
    G.newGame('town-off', 'moderate', 'medium'); S.paused = true;
    CFG.CARDS.ON = false; Deck._dev = false;
    out.off = CFG.CARDS.ON === false && !Deck.on();
    out.refused = __tw.TOWN.every(id => { const rr = Deck.play(id); return !rr.ok && rr.why === 'Cards are not available.'; });
    /* one deterministic siege, run four ways: hooks reachable with the switch
       off, window.Deck gone (every hook's guard — the game as it was), the
       switch ON with nothing played, and a CONTROL with the town's three
       defences running — which must move it, or the probe sees nothing */
    const run = (mode) => {
      __tw.seed(11);
      G.newGame('town-hooks', 'moderate', 'medium'); S.paused = true;
      if (mode === 'idle' || mode === 'control') { CFG.CARDS.ON = true; Deck._col = null; Deck._del(Deck.KEY); for (const id of __tw.TOWN) Deck._add(id, 1); }
      const tc = __tw.flat();
      tc.hp = tc.maxhp = 5000;
      const t1 = __tw.bld('P', 'tower', 14, 9);
      const t2 = __tw.lift(__tw.bld('P', 'tower', 9, 14), 2);
      const wc = __tw.bld('P', 'warcamp', 15, 13);
      const house = __tw.bld('P', 'house', 12, 12);
      const roof = __tw.bld('P', 'house', 5, 12);
      __tw.bld('P', 'wall', 12, 13); __tw.bld('P', 'wall', 13, 13);
      // a band at the reach a card would lengthen, a battery on the house, axes on the hall
      for (let i = 0; i < 4; i++) __tw.unit('defender', 'A', 20.5 + i * 0.7, 10.5 + i * 1.5, 120);
      const cat = __tw.unit('catapult', 'A', 12.5, 19.5);
      cat.tBld = house.id; cat.task = { type: 'attackBld' };
      for (let i = 0; i < 3; i++) { const ax = __tw.unit('axeman', 'A', 10.5 + i, 11.5, 300); ax.tBld = tc.id; ax.task = { type: 'attackBld' }; }
      if (mode === 'control') {
        const now = Deck.now();
        for (const id of ['watchfires', 'stone_skin', 'unbreakable_hall']) S.deck.fx.push({ id, from: now, until: now + 50 });
      }
      const floats = __tw.floatsDuring(() => {
        for (let i = 0; i < 320; i++) {
          Units.update(0.05); Combat.update(0.05);
          if (Bld.get(roof.id)) Bld.damage(roof, 0.37, 'fire');   // the summer on a roof
        }
      });
      return JSON.stringify([S.buildings.map(z => [z.id, z.key, +z.hp.toFixed(4)]),
        S.units.map(u => [u.id, u.kind, +u.x.toFixed(3), +u.y.toFixed(3), +u.hp.toFixed(3)]),
        floats, S.rngState, !!S.over, S.log.slice(0, 10).map(l => l.msg)]);
    };
    const realRandom = Math.random;
    const hooks = run('off');
    const keep = window.Deck; window.Deck = undefined;
    const bare = run('off');
    window.Deck = keep;
    const idle = run('idle');
    const control = run('control');
    CFG.CARDS.ON = false; Deck._dev = false;
    Math.random = realRandom;
    out.same = hooks === bare && idle === bare;
    out.seen = control !== bare;
    out.diff = hooks === bare ? (idle === bare ? '' : 'idle') : 'hooks';
    out.sample = bare.slice(0, 140);
    out.floatsBare = JSON.parse(bare)[2].length;
    /* …and the ✓ with nothing in hand: a site, a builder sent, exactly as
       before cards (and as the switch-on-but-idle game) */
    const site = (mode) => {
      G.newGame('town-confirm', 'moderate', 'medium'); S.paused = true;
      if (mode === 'idle') { CFG.CARDS.ON = true; Deck._col = null; Deck._del(Deck.KEY); for (const id of __tw.TOWN) Deck._add(id, 1); }
      const tc = __tw.flat();
      S.res.wood = S.res.stone = 1000;
      const v = __tw.unit('villager', 'P', tc.x + 3.5, tc.y + 5.5);
      const nb = __tw.confirm('house', tc.x + 4, tc.y + 4);
      const o = JSON.stringify([nb && nb.construction > 0, nb && nb.hp, v.task, S.res.wood, __tw.lastLog()]);
      CFG.CARDS.ON = false; Deck._dev = false;
      return o;
    };
    const sOff = site('off');
    window.Deck = undefined; const sBare = site('off'); window.Deck = keep;
    const sIdle = site('idle');
    out.siteSame = sOff === sBare && sIdle === sBare;
    out.site = sBare;
    return out;
  });
  ck('offTheSwitchShipsOffAndNoTownCardPlays', r.off && r.refused, `off ${r.off}, all nine refused in their words ${r.refused}`);
  ck('noHookMovesANumberWithNoCardInPlay', r.same && r.seen && r.floatsBare > 20,
    r.same ? `a siege (${r.floatsBare} floats, three kinds of tower, a battery, axes, a roof afire) byte-identical off / without Deck / on-but-idle; the three defences move it: ${r.seen}`
      : `differs (${r.diff}): ${r.sample}`);
  ck('aConfirmWithNothingInHandIsTheOldConfirm', r.siteSame && /"type":"build"/.test(r.site), r.site);
}

// ---------------- 1. THE GOODS ----------------
{
  const r = await p.evaluate(() => {
    const GOODS = {
      fallen_timber: { wood: 200 }, loose_stone: { stone: 150 }, gold_nugget: { gold: 60 },
      trade_caravan: { food: 250, wood: 250, gold: 100 },
    };
    const out = {};
    for (const id in GOODS) {
      __tw.fresh('town-goods-' + id);
      const res0 = Object.assign({}, S.res), gath0 = S.stats.gathered || 0, rng0 = S.rngState, n0 = Deck.count(id);
      const sub0 = Score.compute(false).subtotal;
      const rr = Deck.play(id);
      const delta = {};
      for (const k of ['food', 'wood', 'stone', 'gold']) delta[k] = S.res[k] - res0[k];
      const want = GOODS[id], exact = ['food', 'wood', 'stone', 'gold'].every(k => delta[k] === (want[k] || 0));
      const fly = rr.fly || {}, flyOk = Object.keys(want).every(k => fly[k] === want[k]) && Object.keys(fly).length === Object.keys(want).length;
      // the play animation reads the goods off the card's own text: the text and the fly agree
      const named = DeckUI._goods(id).sort().join(','), flyKeys = Object.keys(fly).sort().join(',');
      const show = R.cardShows.find(s => s.id === id);
      out[id] = {
        ok: rr.ok, exact, flyOk, delta, named, flyKeys,
        gathered: (S.stats.gathered || 0) === gath0, rng: S.rngState === rng0, spent: Deck.count(id) === n0 - 1,
        score: Score.compute(false).subtotal === sub0, at: Deck.FX[id].at,
        log: __tw.lastLog(), show: !!show && show.tc === Bld.tcOf('P').id,
        tier: Deck.card(id).tier,
      };
    }
    return out;
  });
  for (const [id, want] of [['fallen_timber', '+200 wood'], ['loose_stone', '+150 stone'], ['gold_nugget', '+60 gold'],
    ['trade_caravan', '+250 food, +250 wood and +100 gold']]) {
    const x = r[id];
    ck(id + 'AddsExactlyItsGoods', x.ok && x.exact && x.flyOk && x.at === 'bar' && x.named === x.flyKeys && x.spent,
      `${want}: Δ ${JSON.stringify(x.delta)}, fly ${x.flyKeys} = text ${x.named}, card spent ${x.spent}`);
    ck(id + 'IsAGiftNotAHarvest', x.gathered && x.score && x.rng, `gathered untouched ${x.gathered}, score unmoved ${x.score}, no RNG ${x.rng}`);
    ck(id + 'IsToldAndLandsAtTheHall', x.show && /^\S+ .+\+\d/.test(x.log), x.log);
  }
}

// ---------------- 2. MENDING ----------------
{
  const r = await p.evaluate(() => {
    const out = {};
    __tw.fresh('town-mend');
    const tc = __tw.flat();
    // nothing hurt: refused, in the card's own words, and kept
    const n0 = Deck.count('mending');
    const none = Deck.play('mending');
    out.none = none.ok === false && none.why === 'Nothing needs mending.' && Deck.count('mending') === n0 &&
      Deck.canPlay('mending').why === 'Nothing needs mending.';
    // a damaged SITE alone is nothing to mend: a work site is fragile by design
    const site = Bld.place('P', 'house', 20, 20, { free: true });
    site.hp = Math.max(1, site.hp - 10);
    const siteHp = site.hp;
    out.siteAlone = Deck.play('mending').ok === false && site.hp === siteHp;
    // …nor is the rival's
    const rh = __tw.bld('A', 'house', 30, 30); rh.hp = 20;
    out.rivalAlone = Deck.play('mending').ok === false && rh.hp === 20;
    // the town after a raid: the hall, a house ablaze, a wall broken open, a
    // gate, a tower in its upgrade — and the site, and the rival's house
    tc.hp = Math.round(tc.maxhp * 0.5);
    const house = __tw.bld('P', 'house', 13, 9); house.hp = Math.round(house.maxhp * 0.3);
    const wall = __tw.bld('P', 'wall', 13, 13); wall.hp = Math.max(1, Math.round(wall.maxhp * 0.05));
    const gate = __tw.bld('P', 'gate', 14, 13); gate.hp = Math.round(gate.maxhp * 0.6);
    const tower = __tw.bld('P', 'tower', 16, 10); tower.upgrading = 1.5; tower.hp = Math.round(tower.maxhp * 0.4);
    const whole = __tw.bld('P', 'house', 17, 13);
    const hurt = [tc, house, wall, gate, tower];
    const fires0 = hurt.filter(z => Bld.burnPhase(z) >= 0).length;
    out.burning = Bld.burnPhase(house) >= 0 && Bld.burnPhase(wall) === 2;
    const rng0 = S.rngState;
    const rr = Deck.play('mending');
    out.ok = rr.ok && Deck.FX.mending.at === 'tc';
    out.full = hurt.every(z => z.hp === z.maxhp) && whole.hp === whole.maxhp;
    out.firesOut = hurt.every(z => Bld.burnPhase(z) === -1);
    out.siteKept = site.hp === siteHp && site.construction > 0;
    out.rivalKept = rh.hp === 20;
    out.rng = S.rngState === rng0;
    out.log = __tw.lastLog();
    out.logOk = out.log.includes(hurt.length + ' buildings made whole') && out.log.includes(fires0 + ' fire');
    out.fires0 = fires0;
    out.show = !!R.cardShows.find(s => s.id === 'mending' && s.hit.length === hurt.length);
    return out;
  });
  ck('mendingRefusesInItsOwnWordsWithNothingHurt', r.none, 'refused “Nothing needs mending.”, the card kept');
  ck('aDamagedSiteOrRivalIsNothingToMend', r.siteAlone && r.rivalAlone, `site alone refused and untouched ${r.siteAlone}, rival alone ${r.rivalAlone}`);
  ck('mendingMakesTheWholeTownWhole', r.ok && r.burning && r.full && r.firesOut,
    `hall, a burning house, a wall broken open, a gate, a tower mid-upgrade: all full ${r.full}, fires out ${r.firesOut}`);
  ck('butLeavesTheSiteAndTheRivalAsTheyWere', r.siteKept && r.rivalKept, `site ${r.siteKept}, rival ${r.rivalKept}`);
  ck('mendingIsToldPlainly', r.logOk && r.show && r.rng, r.log);
}

// ---------------- 3. MASTER BUILDERS ----------------
{
  const r = await p.evaluate(() => {
    const out = {};
    __tw.fresh('town-mb');
    Screens.show('playing'); S.paused = true;
    const tc = __tw.flat();
    S.res.food = S.res.wood = S.res.stone = S.res.gold = 5000;
    // three charges; a second card adds three
    const rng0 = S.rngState;
    const r1 = Deck.play('master_builders');
    out.three = r1.ok && S.deck.charges.master_builders === 3 && r1.charges === 3 && Deck.FX.master_builders.at === 'bar';
    out.rng = S.rngState === rng0;
    const r2 = Deck.play('master_builders');
    out.six = r2.ok && S.deck.charges.master_builders === 6;
    S.deck.charges.master_builders = 3;
    // the chip on the strip: a count where a timer's days would be
    DeckUI._t = 0; DeckUI.frame(1);
    const ch = DeckUI._chips.master_builders;
    out.chip = !!ch && ch.lab.textContent === '×3' && /3 buildings/.test(ch.charge.words);
    // the ghost's chip says a charge is about to be spent — and says nothing
    // of the kind with none in hand (the control)
    const ghost = () => {
      UI.placing = 'house'; UI.placeGhost = { x: tc.x + 4, y: tc.y + 6, set: true };
      UI._placeCheck(); UI._placeDomSync();
      const el = document.querySelector('#placeWhy'), t = el && el.style.display !== 'none' ? el.textContent : '';
      // the chip's 260px is its width on every phone: cut text is a lost count
      if (t) out.ghostClipped = el.scrollWidth > el.clientWidth + 1;
      UI.exitPlacement();
      return t;
    };
    out.ghostChip = ghost();
    const keepN = S.deck.charges.master_builders;
    delete S.deck.charges.master_builders;
    out.ghostBare = ghost();
    S.deck.charges.master_builders = keepN;
    // a house through the ✓: complete at full strength, paid, no builder sent
    const idle = __tw.unit('villager', 'P', tc.x + 3.5, tc.y + 5.5);
    const wood0 = S.res.wood, built0 = S.stats.built || 0;
    const house = __tw.confirm('house', tc.x + 4, tc.y + 4);
    out.house = !!house && house.construction === 0 && house.hp === house.maxhp;
    out.paid = !!house && house.paid && house.paid.wood > 0 && S.res.wood === wood0 - house.paid.wood;
    out.noBuilder = idle.task === null && !S.units.some(u => u.task && u.task.type === 'build' && u.task.id === (house && house.id));
    out.built = (S.stats.built || 0) === built0 + 1;
    out.two = S.deck.charges.master_builders === 2;
    out.mbLog = S.log.slice(0, 3).map(l => l.msg).join(' | ');
    out.mbShow = !!R.cardShows.find(s => s.id === 'master_builders' && s.bid === (house && house.id));
    // a STATION takes its hand: the one the player chose…
    const far = __tw.unit('villager', 'P', tc.x - 4.5, tc.y + 2.5);
    S.map.terrain[MapGen.idx(tc.x + 6, tc.y + 8)] = T.BARREN; Bld._block = null;
    const farm = __tw.confirm('farm', tc.x + 6, tc.y + 8, far.id);
    out.farm = !!farm && farm.construction === 0;
    out.chosen = !!farm && far.task && far.task.type === 'work' && far.task.id === farm.id && !!far.path;
    // …or the nearest idle one
    S.map.terrain[MapGen.idx(tc.x + 1, tc.y + 9)] = T.BARREN; Bld._block = null;
    const farm2 = __tw.confirm('farm', tc.x + 1, tc.y + 9);
    out.nearest = !!farm2 && farm2.construction === 0 && idle.task && idle.task.type === 'work' && idle.task.id === farm2.id;
    out.zero = !S.deck.charges.master_builders && !('master_builders' in S.deck.charges);
    DeckUI._t = 0; DeckUI.frame(1);
    out.chipGone = !DeckUI._chips.master_builders;
    // under the levy no hand is put to work, chosen or not: the levy works nothing
    S.deck.charges.master_builders = 1;
    S.levy = true;
    const levied = __tw.unit('villager', 'P', tc.x + 9.5, tc.y + 2.5);
    S.map.terrain[MapGen.idx(tc.x + 10, tc.y + 4)] = T.BARREN; Bld._block = null;
    const farm3 = __tw.confirm('farm', tc.x + 10, tc.y + 4, levied.id);
    out.levy = !!farm3 && farm3.construction === 0 && !levied.task && /needs a villager/.test(S.log.slice(0, 4).map(l => l.msg).join('|'));
    S.levy = false;
    // never a wall line, never a gate, never the rival, never the Wonder
    S.deck.charges.master_builders = 2;
    UI.wallGhost = [{ x: 20, y: 6, ok: true }, { x: 21, y: 6, ok: true }, { x: 22, y: 6, ok: true }];
    UI.commitWallDrag();
    const line = S.buildings.filter(z => z.key === 'wall' && z.y === 6);
    out.wallLine = line.length === 3 && line.every(z => z.construction > 0) && S.deck.charges.master_builders === 2;
    out.handGate = Deck.masterHand('P', 'gate') === 0 && Deck.masterHand('P', 'wall') === 0 && Deck.masterHand('P', 'wonder') === 0 &&
      Deck.masterHand('A', 'house') === 0 && Deck.masterHand('P', 'house') === 2;
    const gs = __tw.confirm('gate', 21, 10);
    out.gate = !gs || (gs.construction > 0 && S.deck.charges.master_builders === 2);
    out.gateTried = !!gs;
    const rival = Bld.place('A', 'house', 30, 30, { free: true });
    out.rival = rival.construction > 0 && S.deck.charges.master_builders === 2;
    // masterRaise never takes a finished building, a rival's, or the Wonder's site
    out.raiseRefuses = !Deck.masterRaise(rival) && !Deck.masterRaise(house) && S.deck.charges.master_builders === 2;
    // a save carries the charges
    G.loadJSON(G.saveJSON()); S.paused = true;
    out.saved = S.deck.charges.master_builders === 2;
    return out;
  });
  ck('masterBuildersHoldsThreeChargesAndASecondCardAddsThree', r.three && r.six && r.rng, `3 ${r.three}, then 6 ${r.six}, no RNG ${r.rng}`);
  ck('theChargesWearAChipOnTheStrip', r.chip && r.chipGone, `×3 with its words ${r.chip}; gone with the last ${r.chipGone}`);
  // whole, never "⚒ Master Builders: stands compl…" (playtest g2)
  ck('andTheGhostSaysAChargeIsAboutToBeSpent', /Stands at once · 3 left/.test(r.ghostChip) && !r.ghostClipped && !/Stands at once/.test(r.ghostBare),
    `“${r.ghostChip}”${r.ghostClipped ? ' CLIPPED' : ''}; with none in hand “${r.ghostBare}”`);
  ck('aConfirmedBuildingStandsCompleteAtFullStrengthAndPaid', r.house && r.paid && r.two && r.mbShow,
    `complete & full ${r.house}, paid ${r.paid}, one charge spent ${r.two}, its moment ${r.mbShow}`);
  ck('noBuilderWalksToASiteAlreadyStanding', r.noBuilder, 'the idle villager stays idle; no build task names the house');
  ck('aStationTakesItsHand', r.farm && r.chosen && r.nearest, `the chosen hand walks to work ${r.chosen}; else the nearest idle one ${r.nearest}`);
  ck('butNeverALeviedHand', r.levy, 'raised at once under the levy, and it says it needs a villager');
  ck('theLastChargeClearsItsKey', r.zero);
  ck('neverAWallLineAGateTheRivalOrTheWonder', r.wallLine && r.handGate && r.gate && r.rival && r.raiseRefuses,
    `a three-section drag spends nothing ${r.wallLine}, hands ${r.handGate}, a gate site${r.gateTried ? '' : ' (no gate ground)'} ${r.gate}, rival ${r.rival}, raise refuses ${r.raiseRefuses}`);
  ck('aPaidBuildingScoresAsAnyRaisedBuildingDoes', r.built, 'stats.built +1 — the card saves days, not goods');
  ck('theChargesRideASave', r.saved);
}

// ---------------- 3b. MASTER BUILDERS NEVER RAISES THE WONDER ----------------
{
  const r = await p.evaluate(() => {
    const out = {};
    __tw.fresh('town-mb-wonder', 'calm');
    const tc = __tw.flat();
    S.res.food = S.res.wood = S.res.stone = S.res.gold = 99999;
    Deck.play('master_builders');
    let spot = null;
    for (let y = tc.y - 2; y < tc.y + 10 && !spot; y++) for (let x = tc.x - 2; x < tc.x + 10 && !spot; x++)
      if (Bld.canPlace('P', 'wonder', x, y).ok) spot = { x, y };
    out.spot = !!spot;
    const w = spot ? __tw.quietEnd(() => __tw.confirm('wonder', spot.x, spot.y)) : null;
    out.site = !!w && w.construction > 0 && !S.over && S.deck.charges.master_builders === 3;
    return out;
  });
  ck('theWonderIsNeverRaisedByACard', r.spot && r.site, `a Wonder site laid, works still to do, no ending, three charges kept: ${r.site}`);
}

// ---------------- 4. WATCHFIRES ----------------
{
  const r = await p.evaluate(() => {
    const out = {};
    __tw.fresh('town-wf');
    __tw.flat();
    const n0 = Deck.count('watchfires');
    const none = Deck.play('watchfires');
    // a tower SITE is no tower; nor is the rival's
    Bld.place('P', 'tower', 20, 20, { free: true });
    __tw.bld('A', 'tower', 30, 30);
    const site = Deck.play('watchfires');
    out.refused = !none.ok && none.why === 'You need a finished tower or War Camp.' && !site.ok &&
      site.why === none.why && Deck.count('watchfires') === n0;
    /* what one of the player's forts does to a foe standing `dist` from it
       for four seconds, with or without the card: the foe is held on its
       spot (whatever it wants to do about the tower) so only the arrows move */
    /* `soft` injects ANOTHER card's multipliers for the rival's forts — a
       stand-in for the rival group's Swallowed Sun, which softens the
       rival's towers on the same Deck.mult kinds ({towerAtk: 0.7}) — so the
       contract sees what a merge would: the watchfires' look and its fog
       gate must stay the player's, whatever else multiplies in */
    const shoot = (key, lvl, owner, foeOwner, dist, card, sec, hide, soft) => {
      __tw.fresh('town-wf-shoot');
      __tw.flat();
      if (owner !== 'P' || card) __tw.bld('P', 'tower', 3, 28);   // a fort of the player's own, to play it with
      const t = __tw.lift(__tw.bld(owner, key, 20, 20), lvl);
      if (card) Deck.play('watchfires');
      if (soft) {
        Deck.FX.__soft = { mult: {} };
        for (const k in soft) Deck.FX.__soft.mult[k] = o => o === 'A' ? soft[k] : 1;
        S.deck.fx.push({ id: '__soft', from: Deck.now(), until: Deck.now() + 50 });
      }
      const fx = t.x + 0.5 + dist, fy = t.y + 0.5;
      const foe = __tw.unit('defender', foeOwner, fx, fy, 1000);
      // the player's sight as it stands; `hide` puts the foe's ground in the fog
      G.updateVisibility();
      if (hide) G.vis[MapGen.idx(fx | 0, fy | 0)] = 0;
      const rng0 = S.rngState;
      // every arrow the fort looses, as it is loosed (its own origin)
      const shots = [], push0 = Combat.shots.push;
      Combat.shots.push = function (...a) { for (const sh of a) if (Math.abs(sh.x1 - (t.x + 0.5)) < 1e-9) shots.push(sh); return push0.apply(this, a); };
      let floats;
      try {
        floats = __tw.floatsDuring(() => {
          for (let i = 0; i < (sec || 4) * 20; i++) {
            Combat.update(0.05);
            foe.x = fx; foe.y = fy; foe.path = null; foe.tBld = 0; foe.tUnit = 0; foe.task = null;
          }
        });
      } finally {
        delete Combat.shots.push;
        if (soft) { delete Deck.FX.__soft; S.deck.fx = S.deck.fx.filter(e => e.id !== '__soft'); }
      }
      return { lost: 1000 - foe.hp, floats, rngMoved: S.rngState !== rng0, rng: S.rngState,
        shots: shots.length, fire: shots.filter(sh => sh.fire).length };
    };
    const L2 = Bld.lv({ key: 'tower', level: 2 }), def = CFG.UNITS.defender.def;
    // the reach: a foe between the old range and the new
    const far0 = shoot('tower', 2, 'P', 'A', L2.range * 1.3, false);
    const far1 = shoot('tower', 2, 'P', 'A', L2.range * 1.3, true);
    const per = Math.round(L2.atk * 1.5) - def;
    out.reach = far0.lost === 0 && far1.lost > 0 && far1.lost % per === 0;
    out.per = per; out.far1 = far1.lost;
    // …and not past it
    const past = shoot('tower', 2, 'P', 'A', L2.range * 1.55, true);
    out.notPast = past.lost === 0;
    /* …and the farther band only takes what the watch can SEE: the same foe
       with its ground in the fog draws no arrow (an engine never shells
       ground it can't watch), while inside the old range the fog changes
       nothing — that is the tower's own reach, as it always was */
    const fog = shoot('tower', 2, 'P', 'A', L2.range * 1.3, true, 4, true);
    const fogNear = shoot('tower', 2, 'P', 'A', 3, true, 4, true);
    out.fog = fog.lost === 0 && fog.floats.length === 0 && fogNear.lost > 0;
    // the arrows: inside the old range, 50% harder
    const near0 = shoot('tower', 2, 'P', 'A', 3, false), near1 = shoot('tower', 2, 'P', 'A', 3, true);
    out.harder = near0.lost > 0 && near0.lost % (L2.atk - def) === 0 && near1.lost % per === 0 &&
      near1.lost / per === near0.lost / (L2.atk - def);
    out.near = [near0.lost, near1.lost];
    // a War Camp too
    const wcL = Bld.lv({ key: 'warcamp', level: 1 });
    const wc0 = shoot('warcamp', 1, 'P', 'A', wcL.range * 1.3, false), wc1 = shoot('warcamp', 1, 'P', 'A', wcL.range * 1.3, true);
    out.camp = wc0.lost === 0 && wc1.lost > 0;
    // the rival's towers never
    const riv0 = shoot('tower', 2, 'A', 'P', 3, false), riv1 = shoot('tower', 2, 'A', 'P', 3, true);
    const rivFar = shoot('tower', 2, 'A', 'P', L2.range * 1.3, true);
    out.rival = riv0.lost === riv1.lost && riv1.lost > 0 && rivFar.lost === 0;
    /* THE BURNING ARROW IS WATCHFIRES' OWN LOOK, AND THE PLAYER'S: every
       arrow a player tower looses under the card burns, none without it, and
       a rival tower never does — not with the card running, and not with
       ANOTHER card's multiplier on its arrows, under 1 or over (the review's
       merge hazard: a look keyed on "any factor but 1" dressed a SOFTENED
       rival tower as buffed). The softener itself still lands, through the
       one damage expression (the rival group's: round(atk × factor)). */
    const wfOn = shoot('tower', 2, 'P', 'A', 3, true), wfOff = shoot('tower', 2, 'P', 'A', 3, false);
    const rivSoft = shoot('tower', 2, 'A', 'P', 3, true, 4, false, { towerAtk: 0.7 });
    const rivHard = shoot('tower', 2, 'A', 'P', 3, true, 4, false, { towerAtk: 1.3 });
    const pSoft = Math.max(1, Math.round(L2.atk * 0.7) - def);
    out.fireLook = wfOn.shots > 0 && wfOn.fire === wfOn.shots && wfOff.shots > 0 && wfOff.fire === 0 &&
      riv1.shots > 0 && riv1.fire === 0 && rivSoft.shots > 0 && rivSoft.fire === 0 && rivHard.shots > 0 && rivHard.fire === 0;
    out.fireN = [wfOn.fire + '/' + wfOn.shots, wfOff.fire + '/' + wfOff.shots, riv1.fire + '/' + riv1.shots,
      rivSoft.fire + '/' + rivSoft.shots, rivHard.fire + '/' + rivHard.shots];
    out.soft = rivSoft.lost > 0 && rivSoft.lost % pSoft === 0 && rivSoft.lost / pSoft === riv1.lost / (L2.atk - def);
    out.softN = [rivSoft.lost, pSoft];
    /* …and the fog gate is the PLAYER's sight, asked of the player's towers
       only: a rival tower whose reach another card lengthened takes a mark
       out there whatever the player's fog says (on the first cut it read
       the player's vision for whoever owned the tower) */
    const rivReach = shoot('tower', 2, 'A', 'P', L2.range * 1.3, false, 4, true, { towerRange: 1.5 });
    out.rivFog = rivReach.lost > 0;
    /* THE LEVEL-1 FUMBLE draws exactly as it always did: the same number of
       G.rand draws (the run's RNG ends in the same state), the misses on the
       same shots — only the hits are heavier */
    const f0 = shoot('tower', 1, 'P', 'A', 3, false, 8), f1 = shoot('tower', 1, 'P', 'A', 3, true, 8);
    const miss = fl => fl.map(t => t === 'Miss!' ? 'M' : 'H').join('');
    const L1 = Bld.lv({ key: 'tower', level: 1 });
    out.fumble = f0.rngMoved && f0.rng === f1.rng && miss(f0.floats) === miss(f1.floats) && /M/.test(miss(f0.floats)) &&
      f0.floats.filter(t => t !== 'Miss!').every(t => t === '-' + (L1.atk - def)) &&
      f1.floats.filter(t => t !== 'Miss!').every(t => t === '-' + (Math.round(L1.atk * 1.5) - def));
    out.fumbleSeq = miss(f0.floats) + ' / ' + miss(f1.floats);
    // the numbers, the days, the extension, the end
    __tw.fresh('town-wf-days'); __tw.flat();
    const t = __tw.bld('P', 'tower', 12, 12);
    const rng0 = S.rngState;
    const rr = Deck.play('watchfires');
    const e = Deck.timed('watchfires');
    out.days = rr.ok && Math.abs(e.until - e.from - 6) < 1e-9 && Deck.card('watchfires').days === 6 && S.rngState === rng0;
    out.mult = Deck.mult('towerRange', 'P', t) === 1.5 && Deck.mult('towerAtk', 'P', t) === 1.5 &&
      Deck.mult('towerRange', 'A', t) === 1 && Deck.mult('towerAtk', 'A', t) === 1;
    out.show = !!R.cardShows.find(s => s.id === 'watchfires' && s.list.length === 1 && s.list[0].r1 === Bld.lv(t).range * 1.5);
    const until = e.until;
    Deck.play('watchfires');
    out.longer = Math.abs(Deck.timed('watchfires').until - (until + 6)) < 1e-9 && Deck.mult('towerAtk', 'P', t) === 1.5;
    __tw.days(11.9);
    out.still = !!Deck.timed('watchfires');
    __tw.days(0.2);
    out.over = !Deck.timed('watchfires') && Deck.mult('towerRange', 'P', t) === 1 && /watchfires burn down/.test(__tw.lastLog());
    return out;
  });
  ck('watchfiresRefusedWithNoFinishedFort', r.refused, 'no fort, a tower site, the rival\'s tower: refused “You need a finished tower or War Camp.”, kept');
  ck('watchfiresReachHalfAgainAsFar', r.reach && r.notPast, `a foe at 1.3× the old range takes ${r.far1} (shots of ${r.per}); at 1.55× nothing ${r.notPast}`);
  ck('andHitHalfAgainAsHard', r.harder, `inside the old range: ${r.near[0]} → ${r.near[1]}`);
  ck('theFartherReachTakesOnlyWhatTheWatchCanSee', r.fog, 'a foe in the fog past the old range draws no arrow and no float; inside it the tower shoots as ever');
  ck('aWarCampBurnsToo', r.camp);
  ck('theRivalsTowersNever', r.rival);
  ck('theBurningArrowIsTheWatchfiresAndThePlayersAlone', r.fireLook,
    `burning/loosed — player with the card ${r.fireN[0]}, without ${r.fireN[1]}; rival with the card running ${r.fireN[2]}, ` +
    `softened ×0.7 ${r.fireN[3]}, hardened ×1.3 ${r.fireN[4]}`);
  ck('anotherCardsFactorOnTheRivalsArrowsStillLands', r.soft, `a softened rival tower took ${r.softN[0]} in shots of ${r.softN[1]}`);
  ck('theFogGateIsAskedOfThePlayersTowersOnly', r.rivFog, 'a rival tower reaching farther by another card shoots past the player\'s fog');
  ck('theLevelOneFumbleDrawsAsItAlwaysDid', r.fumble, `misses (M) and hits (H) without / with: ${r.fumbleSeq}`);
  ck('watchfiresBurnSixDaysAndASecondCardLengthens', r.days && r.mult && r.show && r.longer && r.still && r.over,
    `6 days ${r.days}, ×1.5/×1.5 the player's only ${r.mult}, the play's ring at the new reach ${r.show}, +6 not ×2 ${r.longer}, burns down on its day ${r.over}`);
}

// ---------------- 5. STONE SKIN ----------------
{
  const r = await p.evaluate(() => {
    const out = {};
    __tw.fresh('town-ss');
    const tc = __tw.flat();
    const house = __tw.bld('P', 'house', 12, 12, 1000);
    const rh = __tw.bld('A', 'house', 30, 30, 1000);
    const rng0 = S.rngState;
    const rr = Deck.play('stone_skin');
    const e = Deck.timed('stone_skin');
    out.days = rr.ok && Math.abs(e.until - e.from - 8) < 1e-9 && Deck.card('stone_skin').days === 8 && S.rngState === rng0 &&
      Deck.mult('bldHurt', 'P', house) === 0.5 && Deck.mult('bldHurt', 'A', rh) === 1;
    // a blow, and the float says what was TAKEN (critic §2.21)
    let fl = __tw.floatsDuring(() => Combat.hitBuilding(house, 40));
    out.half = house.hp === 980 && fl[0] === '-20';
    out.float = fl[0];
    // an ODD blow: the hp keeps the exact half, the float a whole number like every float in the game
    fl = __tw.floatsDuring(() => Combat.hitBuilding(house, 33));
    out.odd = house.hp === 963.5 && fl[0] === '-17';
    out.oddF = fl[0];
    house.hp = 980;
    // a siege stone, through the projectile's landing
    fl = __tw.floatsDuring(() => Combat.impact({ tgt: { kind: 'bld', id: house.id, dmg: 110 }, x2: 12.5, y2: 12.5, kind: 'stone' }));
    out.stone = house.hp === 925 && fl[0] === '-55';
    // the summer's fire
    Bld.damage(house, 10, 'fire');
    out.fire = house.hp === 920;
    // the rival's works take blows in full
    fl = __tw.floatsDuring(() => Combat.hitBuilding(rh, 40));
    out.rival = rh.hp === 960 && fl[0] === '-40';
    // a building that would have fallen stands
    const hut = __tw.bld('P', 'house', 14, 12, 30);
    Combat.hitBuilding(hut, 50);
    out.stands = !!Bld.get(hut.id) && hut.hp === 5;
    // a real fight: axes on a house for ten seconds, the card against none
    const axes = (card) => {
      __tw.seed(5);
      __tw.fresh('town-ss-axe'); __tw.flat();
      const h = __tw.bld('P', 'house', 12, 12, 5000);
      if (card) Deck.play('stone_skin');
      for (let i = 0; i < 2; i++) { const ax = __tw.unit('axeman', 'A', 12.5 + i, 14.5, 300); ax.tBld = h.id; ax.task = { type: 'attackBld' }; }
      for (let i = 0; i < 200; i++) { Units.update(0.05); Combat.update(0.05); }
      return 5000 - h.hp;
    };
    const a0 = axes(false), a1 = axes(true);
    out.axes = a0 > 0 && Math.abs(a1 * 2 - a0) < 1e-6;
    out.axesN = [a0, a1];
    // a second card lengthens it and never doubles it; it ends on its day
    __tw.fresh('town-ss-days'); __tw.flat();
    Deck.play('stone_skin');
    const until = Deck.timed('stone_skin').until;
    Deck.play('stone_skin');
    out.longer = Math.abs(Deck.timed('stone_skin').until - (until + 8)) < 1e-9 && Deck.mult('bldHurt', 'P', Bld.tcOf('P')) === 0.5;
    __tw.days(16.1);
    const h2 = __tw.bld('P', 'house', 12, 12, 1000);
    Combat.hitBuilding(h2, 40);
    out.over = !Deck.timed('stone_skin') && h2.hp === 960 && /Stone Skin wears off/.test(S.log.map(l => l.msg).join('|'));
    return out;
  });
  ck('stoneSkinRunsEightDaysOnThePlayersWorks', r.days, '8 days, ×0.5 for the player and ×1 for the rival');
  ck('aBlowIsHalvedAndTheFloatSaysTheHalf', r.half, `a 40 blow took 20, the float read “${r.float}” (the blow itself would read -40)`);
  ck('anOddBlowFloatsAWholeNumber', r.odd, `a 33 blow took 16.5 of the hp, the float read “${r.oddF}” (never “-16.5”)`);
  ck('aSiegeStoneAndTheSummersFireAreHalvedToo', r.stone && r.fire, `110 → 55 ${r.stone}; fire 10 → 5 ${r.fire}`);
  ck('theRivalsWorksTakeBlowsInFull', r.rival);
  ck('aBuildingThatWouldHaveFallenStands', r.stands, 'a 30-hp house under a 50 blow keeps 5');
  ck('aRealFightLandsHalf', r.axes, `two axemen for ten seconds: ${r.axesN[0]} without, ${r.axesN[1]} with`);
  ck('stoneSkinLengthensAndWearsOff', r.longer && r.over, `+8 not ×0.25 ${r.longer}, full blows again after ${r.over}`);
}

// ---------------- 6. THE UNBREAKABLE HALL ----------------
{
  const r = await p.evaluate(() => {
    const out = {};
    __tw.fresh('town-uh');
    const tc = __tw.flat();
    // with no hall: refused in its words (the hall is the card's whole subject)
    S.buildings = S.buildings.filter(z => z !== tc); Bld._block = null;
    const nh = Deck.play('unbreakable_hall');
    out.noHall = !nh.ok && nh.why === 'Your Town Center must stand.';
    S.buildings.push(tc); Bld._block = null;
    const rng0 = S.rngState;
    const rr = Deck.play('unbreakable_hall');
    const e = Deck.timed('unbreakable_hall');
    out.days = rr.ok && Math.abs(e.until - e.from - 12) < 1e-9 && Deck.card('unbreakable_hall').days === 12 && S.rngState === rng0 &&
      Deck.card('unbreakable_hall').tier === 'enlight';
    const sliver = Math.max(1, Math.round(tc.maxhp * 0.02));
    out.sliver = Deck.FX.unbreakable_hall.sliver(tc) === sliver;
    // the attack path: a blow ten times its strength stops at the sliver
    const full = tc.hp;
    let fl = __tw.floatsDuring(() => Combat.hitBuilding(tc, tc.maxhp * 10));
    out.held = tc.hp === sliver && !S.over && fl[0] === '-' + (full - sliver);
    fl = __tw.floatsDuring(() => Combat.hitBuilding(tc, 300));
    out.heldWhole = tc.hp === sliver && fl[0] === 'Held!';
    // a hair above the sliver: the blow takes the hair, and still reads as a hit — never "-0"
    tc.hp = sliver + 0.3;
    fl = __tw.floatsDuring(() => Combat.hitBuilding(tc, 300));
    out.hair = tc.hp === sliver && fl[0] === '-1';
    out.hairF = fl[0];
    // the wilds' fire, the other road to an ending
    __tw.quietEnd(() => Bld.damage(tc, 99999, 'fire'));
    out.fire = tc.hp === sliver && !S.over && !!Bld.get(tc.id);
    // never raised from below the sliver
    tc.hp = 1;
    Combat.hitBuilding(tc, 50);
    out.notRaised = tc.hp === 1 && !S.over;
    tc.hp = tc.maxhp;
    // the hall alone: a house still falls; the rival's hall takes its blows in full
    const house = __tw.bld('P', 'house', 13, 12);
    __tw.quietEnd(() => Combat.hitBuilding(house, 9999));
    out.houseFalls = !Bld.get(house.id) && !S.over;
    const A = Bld.tcOf('A'); A.hp = A.maxhp = 5000;
    Combat.hitBuilding(A, 100);
    out.rivalFull = A.hp === 4900;
    // with Stone Skin too: halved first, then held
    Deck.play('stone_skin');
    tc.hp = tc.maxhp;
    Combat.hitBuilding(tc, 200);
    out.both = tc.hp === tc.maxhp - 100;
    Combat.hitBuilding(tc, 1e6);
    out.bothHeld = tc.hp === sliver;
    /* THE LOOKS ANSWER BLOWS, NEVER THE SUMMER: the wildfire reaches
       Bld.damage every frame it touches a roof, and a glint or a flare on
       every one of them reads as the ward strobing. Its fire still obeys the
       rules (halved, held — checked above); only the pictures rest. A blow
       moves both, so the probe can be seen to see. */
    tc.hp = tc.maxhp;
    const hh = __tw.bld('P', 'house', 15, 12, 1000);
    const SK = Deck.FX.stone_skin, UH = Deck.FX.unbreakable_hall;
    SK._glints.length = 0; UH._hit = 0;
    Bld.damage(hh, 10, 'fire'); Bld.damage(tc, 10, 'fire');
    out.summerQuiet = SK._glints.length === 0 && UH._hit === 0 && hh.hp === 995 && tc.hp === tc.maxhp - 5;
    Combat.hitBuilding(hh, 10); Combat.hitBuilding(tc, 10);
    out.blowsSeen = SK._glints.length > 0 && UH._hit > 0;
    // the rival's Wonder still ends the run: a race lost is not a hall fallen
    const w = Bld.place('A', 'wonder', 30, 10, { free: true, instant: true });
    __tw.quietEnd(() => G.wonderRaised(w));
    out.wonder = !!S.over && S.over.win === false;
    // a second card lengthens; and on day 13 the hall can fall again
    __tw.fresh('town-uh-days');
    const tc2 = __tw.flat();
    Deck.play('unbreakable_hall');
    const until = Deck.timed('unbreakable_hall').until;
    Deck.play('unbreakable_hall');
    out.longer = Math.abs(Deck.timed('unbreakable_hall').until - (until + 12)) < 1e-9;
    __tw.days(23.9);
    __tw.quietEnd(() => Combat.hitBuilding(tc2, 1e6));
    out.stillHeld = !S.over && tc2.hp === Deck.FX.unbreakable_hall.sliver(tc2);
    __tw.days(0.2);
    out.faded = !Deck.timed('unbreakable_hall') && /ward on your Town Center fades/.test(S.log.map(l => l.msg).join('|'));
    __tw.quietEnd(() => Combat.hitBuilding(tc2, 1e6));
    out.falls = !!S.over && S.over.win === false && S.over.cause === 'tc_destroyed';
    return out;
  });
  ck('theHallCardNeedsAHall', r.noHall, 'refused “Your Town Center must stand.”');
  ck('theWardRunsTwelveDays', r.days && r.sliver);
  ck('aBlowTheHallCannotTakeStopsAtASliver', r.held && r.heldWhole, `stops at 2% ${r.held}; the next blow reads “Held!” ${r.heldWhole}`);
  ck('andSoDoesTheSummersFire', r.fire, 'a fire kill would have ended the run (Bld.damage\'s wild branch)');
  ck('aHallBelowTheSliverIsNeverRaised', r.notRaised);
  ck('everyOtherBuildingStillFalls', r.houseFalls && r.rivalFull, `a house falls ${r.houseFalls}; the rival's hall takes 100 of 100 ${r.rivalFull}`);
  ck('withStoneSkinTheBlowIsHalvedThenHeld', r.both && r.bothHeld);
  ck('aHairAboveTheSliverStillReadsAsAHit', r.hair, `the float read “${r.hairF}”; “Held!” only for nothing taken`);
  ck('theLooksAnswerBlowsNeverTheSummer', r.summerQuiet && r.blowsSeen,
    `the wildfire on a house and the hall: no glint, no flare ${r.summerQuiet} (halved all the same); an axe's blow: both ${r.blowsSeen}`);
  ck('theRivalsWonderStillEndsTheRun', r.wonder);
  ck('theWardLengthensThenFadesAndTheHallCanFall', r.longer && r.stillHeld && r.faded && r.falls,
    `+12 ${r.longer}, held to day 24 ${r.stillHeld}, fades ${r.faded}, falls after ${r.falls}`);
}

// ---------------- 7. SAVES ----------------
{
  const r = await p.evaluate(() => {
    const out = {};
    __tw.fresh('town-save');
    const tc = __tw.flat();
    const t = __tw.bld('P', 'tower', 12, 12);
    for (const id of ['watchfires', 'stone_skin', 'unbreakable_hall', 'master_builders']) Deck.play(id);
    __tw.days(2.5);
    const before = JSON.stringify(S.deck.fx.map(e => [e.id, e.from, e.until])) + JSON.stringify(S.deck.charges);
    const json = G.saveJSON();
    out.noPictures = !/cardShows|_glints|"fresh"/.test(json);
    out.deckKeys = Object.keys(JSON.parse(json).deck || {}).sort().join(',');
    G.loadJSON(json); S.paused = true;
    const after = JSON.stringify(S.deck.fx.map(e => [e.id, e.from, e.until])) + JSON.stringify(S.deck.charges);
    out.same = before === after;
    const t2 = Bld.get(t.id), tc2 = Bld.tcOf('P');
    out.hooks = Deck.mult('towerRange', 'P', t2) === 1.5 && Deck.mult('bldHurt', 'P', tc2) === 0.5 && Deck.masterHand('P', 'house') === 3;
    __tw.quietEnd(() => Combat.hitBuilding(tc2, 1e6));
    out.held = !S.over && tc2.hp === Deck.FX.unbreakable_hall.sliver(tc2);
    return out;
  });
  ck('timersAndChargesRideASave', r.same && r.hooks && r.held, `timers and charges identical ${r.same}; the hooks answer after the load ${r.hooks}; the hall held ${r.held}`);
  ck('aSaveCarriesNoPicture', r.noPictures, `S.deck keys: ${r.deckKeys}`);
}

// ---------------- 8. THE TEXTS ----------------
{
  const r = await p.evaluate(() => Object.fromEntries(__tw.TOWN.map(id => [id, [Deck.card(id).text, Deck.card(id).tier, Deck.card(id).days || 0]])));
  const WANT = {
    fallen_timber: ['+200 wood.', 'stone', 0],
    loose_stone: ['+150 stone.', 'stone', 0],
    gold_nugget: ['+60 gold.', 'stone', 0],
    trade_caravan: ['+250 food, +250 wood and +100 gold.', 'bronze', 0],
    mending: ['Every building you have is repaired to full and its fires put out. Walls and gates included; work sites excluded.', 'stone', 0],
    master_builders: ['The next 3 buildings you place stand complete the moment they are placed, at full strength. You still pay for them. (Not walls, gates or the Wonder.)', 'bronze', 0],
    watchfires: ['Your towers and War Camps hit 50% harder and reach 50% farther for 6 days.', 'bronze', 6],
    stone_skin: ['Your buildings take half damage for 8 days — double their strength.', 'iron', 8],
    unbreakable_hall: ['For 12 days your Town Center cannot fall: blows may scorch it, but it never drops below a sliver of strength.', 'enlight', 12],
  };
  const bad = Object.keys(WANT).filter(id => JSON.stringify(r[id]) !== JSON.stringify(WANT[id]));
  ck('everyTextTierAndDayIsTheApprovedOne', !bad.length, bad.length ? 'differs: ' + bad.map(id => id + ' ' + JSON.stringify(r[id])).join('; ') : 'nine cards, word for word');
}

// ---------------- 9. THE PICTURE ----------------
{
  const r = await p.evaluate(() => {
    const out = { ops: {}, cover: {}, live: {}, threw: [] };
    const ce = console.error, caught = [];
    console.error = function () { caught.push(Array.from(arguments).map(String).join(' ')); return ce.apply(this, arguments); };
    // count what a show actually lays down: rects, blits, filled and stroked
    // paths and words (the operator's ruling of 2026-10-27 draws a card's
    // light as smooth paths at the device's own resolution, where this
    // counted hard rects and blits alone)
    const P2 = CanvasRenderingContext2D.prototype, fr = P2.fillRect, di = P2.drawImage;
    const fi = P2.fill, st = P2.stroke, ftx = P2.fillText, stx = P2.strokeText;
    let ops = 0;
    P2.fillRect = function () { ops++; return fr.apply(this, arguments); };
    P2.drawImage = function () { ops++; return di.apply(this, arguments); };
    P2.fill = function () { ops++; return fi.apply(this, arguments); };
    P2.stroke = function () { ops++; return st.apply(this, arguments); };
    P2.fillText = function () { ops++; return ftx.apply(this, arguments); };
    P2.strokeText = function () { ops++; return stx.apply(this, arguments); };
    try {
      __tw.fresh('town-draw');
      Screens.show('playing'); S.paused = true;
      const tc = __tw.flat();
      R.cam.z = 1.7;
      R.centerOn(Bld.cx(tc), Bld.cy(tc) + 0.5);
      S.res.food = S.res.wood = S.res.stone = S.res.gold = 5000;
      // the town a show plays over
      const towers = [__tw.bld('P', 'tower', 13, 7), __tw.bld('P', 'tower', 5, 12)];
      __tw.bld('P', 'warcamp', 12, 13);
      const hurt = [__tw.bld('P', 'house', 6, 8), __tw.bld('P', 'house', 11, 10), __tw.bld('P', 'wall', 10, 13)];
      __tw.unit('villager', 'P', 9.5, 11.5);
      // with nothing in play, a frame pays nothing for cards
      const dcw = R.drawCardWorld; let calls = 0;
      R.drawCardWorld = function () { calls++; return dcw.apply(this, arguments); };
      for (let i = 0; i < 3; i++) R.draw(1 / 30);
      S.deck.charges.master_builders = 3;            // a charge in hand draws nothing in the world
      for (let i = 0; i < 3; i++) R.draw(1 / 30);
      delete S.deck.charges.master_builders;
      out.idleCalls = calls;
      R.drawCardWorld = dcw;
      // every show, at every beat: started by its own play, then the shared
      // registry walked to each p by hand on both layers — the marks counted
      // are the show's own (inside the registry), never the frame's
      const dcs = R.drawCardShows;
      let showOps = 0;
      R.drawCardShows = function () { const o0 = ops; const v = dcs.apply(this, arguments); showOps += ops - o0; return v; };
      const PS = [0.02, 0.08, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95];
      for (const id of __tw.TOWN) {
        for (const z of hurt) z.hp = Math.round(z.maxhp * 0.4);
        R.cardShows = [];
        let started;
        if (id === 'master_builders') {
          Deck.play(id);
          const nb = __tw.confirm('house', 14, 10);
          started = R.cardShows.find(s => s.id === id && s.bid === (nb && nb.id));
        } else {
          const rr = Deck.play(id);
          started = rr.ok && R.cardShows.find(s => s.id === id);
        }
        if (!started) { out.ops[id] = -1; continue; }
        const layers = Deck.FX[id].show.layers || [Deck.FX[id].show.layer || 'world'];
        let peak = 0, kept = true;
        for (const pp of PS) {
          started.t = pp * started.ms / 1000;
          showOps = 0;
          R.draw(0);
          peak = Math.max(peak, showOps);
          if (R.cardShows.indexOf(started) < 0) { kept = false; break; }
        }
        // the same show, driven straight through its registry on each layer
        const g = R.cv.getContext('2d');
        for (const layer of layers) for (const pp of PS) {
          started.t = pp * started.ms / 1000;
          if (R.cardShows.indexOf(started) < 0) R.cardShows.push(started);
          g.save();
          try { dcs.call(R, g, 0, layer); } catch (e) { out.threw.push(id + '@' + layer + ': ' + e); }
          g.restore();
        }
        // …and the frame it covers at its height: every layer drawn alone on
        // a clean canvas through the world's own transform, the pixels it laid
        const cc = document.createElement('canvas');
        cc.width = R.cv.width; cc.height = R.cv.height;
        const gc = cc.getContext('2d'), zz = R.cam.z * (R.dpr || 1);
        let cover = 0;
        for (const pp of PS) {
          started.t = pp * started.ms / 1000;
          if (R.cardShows.indexOf(started) < 0) R.cardShows.push(started);
          gc.setTransform(1, 0, 0, 1, 0, 0); gc.clearRect(0, 0, cc.width, cc.height);
          for (const layer of layers) {
            gc.save();
            if (layer === 'sky') gc.setTransform(1, 0, 0, 1, 0, 0); else gc.setTransform(zz, 0, 0, zz, -R.cam.x * zz, -R.cam.y * zz);
            try { dcs.call(R, gc, 0, layer); } catch (e) { out.threw.push(id + '@' + layer + ': ' + e); }
            gc.restore();
          }
          const dd = gc.getImageData(0, 0, cc.width, cc.height).data;
          let n = 0;
          for (let i = 3; i < dd.length; i += 4) if (dd[i] > 0) n++;
          cover = Math.max(cover, n);
        }
        out.cover[id] = kept ? cover : 0;
        out.ops[id] = kept ? peak : 0;
      }
      R.drawCardShows = dcs;
      R.cardShows = [];
      // every running card's look: drawn while it runs, gone when it ends —
      // in the air (drawLive) or ON a building, in the building loop (drawBld:
      // Stone Skin's sleeve, under whoever stands in front of the wall) — the
      // building loop draws only what is in sight, so the sight is brought up
      // to the moved hall first, as the frame loop would
      G.updateVisibility();
      for (const id of ['watchfires', 'stone_skin', 'unbreakable_hall']) {
        const d = Deck.FX[id], dl = d.drawLive, db = d.drawBld;
        let n = 0;
        d.drawLive = function () { const o0 = ops; const v = dl.apply(this, arguments); n += ops - o0; return v; };
        if (db) d.drawBld = function () { const o0 = ops; const v = db.apply(this, arguments); n += ops - o0; return v; };
        R._liveErr = 0;
        for (let i = 0; i < 6; i++) R.draw(1 / 30);
        d.drawLive = dl;
        if (db) d.drawBld = db;
        out.live[id] = R._liveErr ? -1 : n;
      }
      // a blow glances off the skin and the ward flares: the looks answer it
      // on a FROZEN clock: a glint lives 0.4s of real time, and four frames
      // of a big map on a loaded machine (a sweep beside it) outlast that —
      // the check is whether the looks answer the blow, not how fast we draw
      const pnow = performance.now, tHit = pnow.call(performance);
      performance.now = () => tHit;
      try {
        Combat.hitBuilding(hurt[0], 30);
        Combat.hitBuilding(tc, 30);
        R._liveErr = 0;
        for (let i = 0; i < 4; i++) R.draw(1 / 30);
        out.struck = !R._liveErr && Deck.FX.stone_skin._glints.length > 0 && performance.now() - Deck.FX.unbreakable_hall._hit < 1000;
      } finally { performance.now = pnow; }
      // the shows drain away on their own clock
      for (const id of ['fallen_timber', 'trade_caravan', 'unbreakable_hall']) R.startCardShow(id, { tc: tc.id, side: 1, dir: 1, fresh: true });
      for (let i = 0; i < 200 && R.cardShows.length; i++) R.draw(1 / 30);
      out.drained = R.cardShows.length === 0;
      out.inS = /cardShows|_glints/.test(JSON.stringify(S));
    } finally {
      P2.fillRect = fr; P2.drawImage = di; P2.fill = fi; P2.stroke = st; P2.fillText = ftx; P2.strokeText = stx; console.error = ce;
    }
    out.caught = caught.filter(m => /card show|card look/.test(m));
    // every voice is synthesized, gapped, and plays without a fault
    const V = ['cardWood', 'cardStone', 'cardGold', 'cardCaravan', 'cardMend', 'cardBuild', 'cardFire', 'cardSkin', 'cardGlance', 'cardRise', 'cardHall', 'cardWard',
      'cardThud', 'cardThunk', 'cardCoin'];
    out.voices = V.every(k => typeof Sound._VOICES[k] === 'function' && Sound.GAP[k] > 0);
    let vthrew = null;
    try { for (const k of V) Sound.play(k); } catch (e) { vthrew = String(e); }
    out.vthrew = vthrew;
    return out;
  });
  const shown = Object.entries(r.ops);
  ck('everyCardHasItsOwnMomentInTheWorld', shown.length === 9 && shown.every(([, n]) => n > 0) && !r.threw.length && !r.caught.length,
    shown.map(([id, n]) => id + ' ' + (n < 0 ? 'NOT STARTED' : n === 0 ? 'DROPPED' : n + ' marks at its height')).join(', ') +
      (r.threw.length ? ' | ' + r.threw.join('; ') : '') + (r.caught.length ? ' | ' + r.caught.join('; ') : ''));
  /* (measured as the frame it COVERS at its height — device pixels the show
     alone lays down, drawn on a clean canvas through the world's transform —
     where it counted 40 hard rects: under the operator's ruling of 2026-10-27
     a band of light is one smooth path where the hard look cut it into a
     dozen cells, so a count of marks no longer says how much is seen. A
     single glint covers a few hundred device px; a moment, thousands) */
  ck('andEveryMomentIsMoreThanAGlint', Object.keys(r.cover).length === 9 && Object.values(r.cover).every(n => n >= 3000),
    'device px covered at its height: ' + Object.entries(r.cover).map(([id, n]) => id + ' ' + n).join(', '));
  ck('everyRunningCardWearsItsLook', Object.values(r.live).every(n => n > 0) && r.struck,
    JSON.stringify(r.live) + `; a blow glances and the ward flares ${r.struck}`);
  ck('aFrameWithNoCardInPlayPaysNothing', r.idleCalls === 0, `${r.idleCalls} card-world passes over six frames (three with a charge in hand)`);
  ck('theShowsAreRenderStateAndDrainAway', r.drained && !r.inS);
  ck('everyVoiceIsSynthesized', r.voices && !r.vthrew, r.vthrew || 'fifteen voices (a landing\'s thud, a block\'s thunk, a coin\'s clink among them), each with its gap');
}

// ---------------- 10. WHAT THE PICTURE STANDS ON ----------------
{
  const r = await p.evaluate(() => {
    const out = {};
    __tw.fresh('town-pic2');
    Screens.show('playing'); S.paused = true;
    const tc = __tw.flat();
    R.cam.z = 1.7; R.centerOn(Bld.cx(tc), Bld.cy(tc) + 0.5);
    const TX = Deck._townTX, TL = CFG.TILE;
    /* (a) A BURNED BUILDING WEARS ITS OWN PICTURE UNDER A CARD'S LIGHT: the
       overlays are cut from R.wornSprite — what the building pass drew —
       never from the intact sprite, whose roof would come back as a ghost */
    const burnt = __tw.bld('P', 'house', 12, 9);
    burnt.hp = Math.max(1, Math.round(burnt.maxhp * 0.05));
    const worn = R.wornSprite(burnt);
    out.worn = Bld.burnPhase(burnt) === 2 && worn !== R.bldSprite(burnt) && TX.art(burnt).spr === worn &&
      TX.crown(burnt).a.spr === worn;
    /* (b) THE LIGHT ON A BUILDING IS LAID AT THE DEVICE'S SIZE, IN A FEW
       SHARED SCRATCHES (the operator's ruling of 2026-10-27, "higher pixel
       count": the scan of light down a mended building and the stone a
       building turns to are laid through its own picture at the size its
       rect takes on the DEVICE — where this pinned one world-pixel-sized
       copy per sprite, a quarter of the art's own detail on a phone). The
       memory rule it stood for still holds, harder: a town of many kinds
       under Mending's scan, Stone Skin's casing and its look makes a fixed
       few canvases for the whole session — never one per sprite or per
       colour — each the device size of the art it serves, and bounded */
    const town = [burnt];
    const KEYS = ['house', 'barracks', 'range', 'stable', 'siege', 'sapper', 'trade', 'warcamp', 'tower', 'wall', 'gate'];
    KEYS.forEach((k, i) => { const z = __tw.bld('P', k, 3 + (i % 4) * 3, 14 + Math.floor(i / 4) * 3); if (z) town.push(z); });
    for (const z of town) z.hp = Math.max(1, Math.round(z.maxhp * 0.5));
    R.draw(0);                       // the building pass's own variants, made before anything is counted
    for (const z of town) if (Bld.get(z.id)) R.wornSprite(z);   // …off the screen too: they are the renderer's, not the card's
    const ce = Document.prototype.createElement;
    let inCard = 0, made = 0;
    Document.prototype.createElement = function (tag) { if (inCard && String(tag).toLowerCase() === 'canvas') made++; return ce.apply(this, arguments); };
    const wrap = (o, k) => { const f = o[k]; o[k] = function () { inCard++; try { return f.apply(this, arguments); } finally { inCard--; } }; return () => { o[k] = f; }; };
    const undo = [wrap(Deck.FX.mending.show, 'draw'), wrap(Deck.FX.stone_skin.show, 'draw'), wrap(Deck.FX.stone_skin, 'drawLive')];
    try {
      Deck.play('mending');
      Deck.play('stone_skin');
      for (const sh of R.cardShows.slice()) {
        for (let k = 0; k <= 20; k++) {
          sh.t = k / 20 * sh.ms / 1000 * 0.98;
          if (R.cardShows.indexOf(sh) < 0) R.cardShows.push(sh);
          R.draw(0);
        }
      }
      for (let i = 0; i < 4; i++) R.draw(1 / 30);
    } finally { Document.prototype.createElement = ce; undo.forEach(f => f()); }
    const sprites = new Set(town.filter(z => Bld.get(z.id)).map(z => TX.art(z).spr));
    out.made = made; out.K = sprites.size;
    // (a scratch made by an earlier section's play is the same one: a few for
    // the session, whatever was drawn before)
    const devs = TX._dev ? Object.values(TX._dev) : [];
    out.devs = devs.length;
    out.onePer = devs.length >= 1 && devs.length <= 4 && made <= devs.length;
    // the widest art rect served, in the DEVICE px it takes on the frame (the
    // world's transform: the zoom times the canvas's own ratio, 3.4 here) —
    // a scratch holds it whole; the world-sized copy held a third of that
    const kk = R.cam.z * (R.dpr || 1), live = town.filter(z => Bld.get(z.id));
    const need = Math.max(...live.map(z => Math.ceil(TX.art(z).rc.w * kk)));
    out.need = need; out.devW = devs.map(c => c.width + 'x' + c.height).join(' ');
    out.sized = devs.length > 0 && kk > 2 && devs.every(c => c.width <= TX.DEV_MAX && c.height <= TX.DEV_MAX) &&
      devs.some(c => c.width >= Math.min(TX.DEV_MAX, need));
    R.cardShows = []; S.deck.fx = [];
    /* (c) THE GOODS BRING THE HALL ON SCREEN: their moment lands at its door,
       so a goods card played with the camera elsewhere brings it into view
       first, as a 'tc' card does — and so does Master Builders now that its
       play marks the hall; the CONTROL is the same card with its showAtHall
       taken away, which must leave the camera alone */
    const door = () => R.onScreen(Bld.cx(tc), Bld.cy(tc) + Bld.size(tc) / 2);
    R.centerOn(CFG.W - 5, CFG.H - 5);
    const away = !door();
    DeckUI._dest('bar', 'fallen_timber');
    const brought = door();
    R.centerOn(CFG.W - 5, CFG.H - 5);
    const MBh = Deck.FX.master_builders, keepH = MBh.showAtHall;
    delete MBh.showAtHall;
    DeckUI._dest('bar', 'master_builders');
    const stayed = !door();
    MBh.showAtHall = keepH;
    R.centerOn(CFG.W - 5, CFG.H - 5);
    DeckUI._dest('bar', 'master_builders');
    out.camera = away && brought && stayed && door() &&
      ['fallen_timber', 'loose_stone', 'gold_nugget', 'trade_caravan'].every(id => Deck.FX[id].showAtHall);
    R.centerOn(Bld.cx(tc), Bld.cy(tc) + 0.5);
    /* (d) THE CARAVAN'S ROAD IS ONE THE MAP CAN CARRY: every tile the cart
       sweeps, from where it comes in to where it rolls on, is land with no
       building on it; water cuts the road short rather than being crossed;
       the row with nobody standing on it wins; and with no road at all the
       show still plays (the load comes down in the card's light) */
    const C = Deck.FX.trade_caravan;
    const swept = (rd) => {
      const tiles = [], span = cx => rd.dir > 0 ? [cx - C.CART.back, cx + C.CART.front] : [cx - C.CART.front, cx + C.CART.back];
      for (let k = -rd.inN; k <= rd.outN; k++) {
        const [a0, a1] = span(rd.stop + rd.dir * k * TL);
        for (let tx = Math.floor(a0 / TL); tx <= Math.floor((a1 - 1) / TL); tx++) tiles.push([tx, rd.ty]);
      }
      return tiles;
    };
    const clearRoad = rd => !!rd && swept(rd).every(([x, y]) => MapGen.onBoard(x, y) && Path.passable(x, y, 'P') && !Bld.at(x, y));
    S.buildings = S.buildings.filter(z => z.key === 'tc'); S.units = []; Bld._block = null;
    const side = 1, sp = TX.spot(tc, side), py0 = Math.floor(sp.y);
    const open = C.road(sp, side);
    out.open = clearRoad(open) && open.inN === 7 && open.outN === 5 && open.ty === py0 + 1 && open.dir === -side;
    // a channel across all three rows on the inbound side, three tiles out
    const stopT = Math.floor(open.stop / TL), cut = stopT - open.dir * 4;
    for (let y = py0 + 1; y <= py0 + 3; y++) S.map.terrain[MapGen.idx(cut, y)] = T.WATER;
    Bld._block = null;
    const wet = C.road(sp, side);
    out.wet = clearRoad(wet) && (wet.dir !== open.dir || wet.inN < 7);
    out.wetN = wet ? wet.dir + ':' + wet.inN + '/' + wet.outN + '@' + (wet.ty - py0) : 'none';
    for (let y = py0 + 1; y <= py0 + 3; y++) S.map.terrain[MapGen.idx(cut, y)] = T.GRASS;
    Bld._block = null;
    // people standing along the first row: the cart takes the next
    for (let x = stopT - 7; x <= stopT + 7; x += 2) __tw.unit('villager', 'P', x + 0.5, py0 + 1.5);
    const crowd = C.road(sp, side);
    out.crowd = clearRoad(crowd) && crowd.ty !== py0 + 1;
    S.units = [];
    // no road at all: every row in front of the pile is water
    for (let y = py0 + 1; y <= py0 + 3; y++) for (let x = stopT - 10; x <= stopT + 10; x++) if (MapGen.onBoard(x, y)) S.map.terrain[MapGen.idx(x, y)] = T.WATER;
    Bld._block = null;
    out.none = C.road(sp, side) === null;
    R.cardShows = [];
    const sh = R.startCardShow('trade_caravan', { tc: tc.id, side });
    const g = R.cv.getContext('2d');
    let threw = null;
    for (let k = 0; k <= 12; k++) {
      sh.t = k / 12 * sh.ms / 1000 * 0.98;
      if (R.cardShows.indexOf(sh) < 0) R.cardShows.push(sh);
      g.save();
      try { R.drawCardShows(g, 0, 'world'); } catch (e) { threw = String(e); }
      g.restore();
    }
    // …and the pile is really there: the show drawn into a clean canvas at
    // its end, the pile's ground read back (the first cut's drawing box ended
    // above the pile when there was no road, and only the coins showed)
    const cv = document.createElement('canvas'); cv.width = cv.height = 200;
    const cg = cv.getContext('2d'), spx = (sh.at || TX.spot(tc, side)), wx = spx.x * TL, wy = spx.y * TL;
    cg.setTransform(1, 0, 0, 1, 100 - wx, 100 - wy);
    sh.t = 0.86 * sh.ms / 1000;
    if (R.cardShows.indexOf(sh) < 0) R.cardShows.push(sh);
    try { R.drawCardShows(cg, 0, 'world'); } catch (e) { threw = String(e); }
    const px = cg.getImageData(70, 70, 60, 34).data;
    let solid = 0;
    for (let i = 3; i < px.length; i += 4) if (px[i] > 200) solid++;
    out.pilePx = solid;
    out.noneDraws = !threw && sh.road === null && solid > 300;
    out.threw = threw;
    /* (e) A CHARGE KEPT UNDER ANOTHER KEY IS STILL SEEN: a card may hold its
       charges under a key of its own (the rival group's Barbarian Pact keeps
       its bands under 'pact'); the strip maps the key to the card that names
       it and wears its chip — or the charge would run unseen and uncounted */
    const keep = Deck.FX.barbarian_pact;
    Deck.FX.barbarian_pact = { chargeKey: 'pact', chip(n) { return { label: '×' + n, frac: n / 3, words: n + ' bands' }; } };
    S.deck.charges.pact = 3;
    DeckUI._t = 0; DeckUI.frame(1);
    const pch = DeckUI._chips.barbarian_pact;
    out.pact = DeckUI._chargeCard('pact') === 'barbarian_pact' && !!pch && pch.lab.textContent === '×3' && DeckUI._chargeCard('nothing') === null;
    delete S.deck.charges.pact;
    DeckUI._t = 0; DeckUI.frame(1);
    out.pactGone = !DeckUI._chips.barbarian_pact;
    if (keep) Deck.FX.barbarian_pact = keep; else delete Deck.FX.barbarian_pact;
    return out;
  });
  ck('aBurnedBuildingWearsItsOwnPictureUnderTheCardsLight', r.worn, 'the overlay and the crown are cut from R.wornSprite, not the intact roof');
  ck('theLightOnABuildingIsLaidAtTheDevicesSizeInAFewScratches', r.onePer && r.sized,
    `${r.devs} shared scratches (${r.devW}) and ${r.made} canvases made for ${r.K} sprites under four looks; ` +
    `the widest art rect takes ${r.need} device px and a scratch holds it whole ${r.sized}`);
  ck('theGoodsBringTheHallOnScreen', r.camera, 'a goods card brings the hall into view, and Master Builders\' mark on it; without showAtHall the camera stays');
  ck('theCaravansRoadIsOneTheMapCanCarry', r.open && r.wet && r.crowd,
    `open ground: the full road ${r.open}; a channel across it cuts it short, never crossed ${r.wet} (${r.wetN}); a row of people: the next row ${r.crowd}`);
  ck('andWithNoRoadTheLoadStillComes', r.none && r.noneDraws, r.threw || `no row can carry the cart: the load comes down in the card's light, a pile of ${r.pilePx} solid px`);
  ck('aChargeKeptUnderAnotherKeyIsStillSeen', r.pact && r.pactGone, `the pact's bands under 'pact' wear the card's chip ${r.pact}; gone with the charge ${r.pactGone}`);
}

// ---------------- 11. THE GOODS COME DOWN WHERE THEY CAN BE SEEN ----------------
/* The playtest's phone (390×844, the operator's own path): the pile spot
   was pushed EAST off the villagers' feet and the camera only re-centred
   when the hall itself was off screen, so with the hall on the right of the
   view the logs, the stone and the nugget landed at the screen's edge and
   their counts were cut ("+200 woo", "+100 gol"); the caravan's one-line
   count lay across the hall's straw roof. The rule: the pile, the count
   over it and every number the goods raise lie INSIDE THE SAFE VIEW — below
   the top bar, the minimap and the toast column, above the bottom bar, a
   tile in from either side, measured here off the DOM on our own — and the
   caravan's three counts stack, none of them over the hall's roof. */
{
  const r = await p.evaluate(() => {
    const out = { cards: {} }, TL = CFG.TILE, TX = Deck._townTX;
    const vw0 = innerWidth;
    for (const id of ['fallen_timber', 'loose_stone', 'gold_nugget', 'trade_caravan']) {
      __tw.fresh('town-safe-' + id);
      Screens.show('playing'); S.paused = true;
      const tc = __tw.flat();
      R.cam.z = 1.7;
      // the hall on the RIGHT of the view, wholly on screen: the old spot
      // pushed east of the door ran off the edge
      const z = R.cam.z, de = document.documentElement;
      R.cam.x = (tc.x + 3.4) * TL - de.clientWidth / z;
      R.cam.y = Bld.cy(tc) * TL - de.clientHeight / z / 2;
      // villagers on the doorstep, as at a run's start
      for (let k = 0; k < 4; k++) __tw.unit('villager', 'P', tc.x + 0.5 + k, tc.y + 2.6);
      for (let i = 0; i < 3; i++) R.draw(0);
      // the safe view, read off the page by the test itself
      const rect = id => { const el = document.getElementById(id); if (!el || getComputedStyle(el).display === 'none') return null; const q = el.getBoundingClientRect(); return q.width > 0 ? q : null; };
      let top = 0, bot = de.clientHeight;
      const tb = rect('topbar'), mm = rect('miniWrap'), bb = rect('bottombar'), ts = rect('toasts');
      if (tb && tb.height) top = Math.max(top, tb.bottom);
      if (mm && mm.height) top = Math.max(top, mm.bottom);
      if (ts) top = Math.max(top, ts.top + 60);
      if (bb && bb.height) bot = Math.min(bot, bb.top);
      const toScr = (wx, wy) => ({ x: (wx - R.cam.x) * R.cam.z, y: (wy - R.cam.y) * R.cam.z });
      const inside = (wx0, wy0, wx1, wy1) => {
        const a = toScr(wx0, wy0), b2 = toScr(wx1, wy1);
        return a.x >= TL * z - 1 && b2.x <= de.clientWidth - TL * z + 1 && a.y >= top - 1 && b2.y <= bot + 1;
      };
      const before = R.floats.length;
      const rr = Deck.play(id);
      const sh = R.cardShows.find(s => s.id === id);
      // run the show to its end, keeping every number it raised
      const nums = [];
      for (let k = 0; k <= 60 && sh && R.cardShows.indexOf(sh) >= 0; k++) {
        R.draw(sh.ms / 1000 / 60);
        if (sh.lab) for (const key in sh.lab) nums.push(Object.assign({ key }, sh.lab[key]));
      }
      const fl = R.floats.slice(before).filter(f => /^\+\d/.test(f.txt));
      const sp = sh && sh.at;
      const g = R.cv.getContext('2d'); g.font = 'bold 9px sans-serif';
      const W = t => g.measureText(t).width + 4;
      const want = { fallen_timber: ['+200 wood'], loose_stone: ['+150 stone'], gold_nugget: ['+60 gold'], trade_caravan: ['+250 food', '+250 wood', '+100 gold'] }[id];
      const wmax = Math.max(...want.map(W)), lines = want.length;
      const a = TX.art(tc), roof = { x0: a.rc.x + a.box.l * a.rc.w, x1: a.rc.x + a.box.r * a.rc.w, y0: a.rc.y + a.box.t * a.rc.h, y1: a.foot };
      const last = nums[nums.length - 1];
      out.cards[id] = {
        ok: rr.ok,
        pile: !!sp && inside((sp.x - 1) * TL, (sp.y - 1.6) * TL, (sp.x + 1) * TL, (sp.y + 0.3) * TL),
        nearHall: !!sp && Math.hypot(sp.x - Bld.cx(tc), sp.y - Bld.cy(tc)) <= 5,
        oldFloats: fl.map(f => f.txt),
        counted: !!last && fl.length === 0,
        countIn: !!last && inside(last.x - wmax / 2, last.y - TX.RISE, last.x + wmax / 2, last.y + lines * 11),
        clearOfRoof: !!last && (last.x + wmax / 2 <= roof.x0 || last.x - wmax / 2 >= roof.x1 || last.y + lines * 11 <= roof.y0 || last.y - TX.RISE >= roof.y1),
        at: sp && [+sp.x.toFixed(2), +sp.y.toFixed(2)], tc: [tc.x, tc.y],
      };
    }
    S.units = []; R.cardShows = [];
    return out;
  });
  const C = r.cards;
  ck('theGoodsComeDownInsideTheSafeView', Object.values(C).every(c => c.ok && c.pile && c.nearHall),
    Object.entries(C).map(([id, c]) => `${id} at ${JSON.stringify(c.at)} (hall ${c.tc}) inside ${c.pile}`).join('; '));
  ck('andEveryCountIsFittedToIt', Object.values(C).every(c => c.counted && c.countIn),
    Object.entries(C).map(([id, c]) => `${id} ${c.countIn}${c.oldFloats.length ? ' (a bare float: ' + c.oldFloats.join('|') + ')' : ''}`).join('; '));
  ck('theCaravansCountsStackClearOfTheRoof', C.trade_caravan.counted && C.trade_caravan.clearOfRoof && Object.values(C).every(c => c.clearOfRoof),
    Object.entries(C).map(([id, c]) => `${id} clear ${c.clearOfRoof}`).join('; '));
}

// ---------------- 12. PAID ON IMPACT ----------------
/* The playtest: the wood read 447 while the logs were still in the air, and
   the caravan's numbers ran 2.5 s ahead of its goods. S.res is credited at
   the play — the truth, for saves and every rule — but the NUMBER ON THE BAR
   is held until the goods land and steps up as each piece does. Driven
   through the real landing (DeckUI._land, the line that hands the effect's
   {pay} to the bar), with real time let pass first so an ordinary count-up
   would already have finished: the old bar read the full total before a
   single log was down. Culled (the camera elsewhere) the pieces still pay;
   and whatever happens, the bar ends on the stockpile. */
{
  const r = await p.evaluate(async () => {
    const out = {}, wait = ms => new Promise(res2 => setTimeout(res2, ms));
    const EL = { food: 'rFood', wood: 'rWood', stone: 'rStone', gold: 'rGold' };
    for (const id of ['fallen_timber', 'loose_stone', 'gold_nugget', 'trade_caravan']) {
      for (const away of [false, true]) {
        __tw.fresh('town-pay-' + id);
        Screens.show('playing'); S.paused = true;
        const tc = __tw.flat();
        R.cam.z = 1.7;
        if (away) R.centerOn(CFG.W - 6, CFG.H - 6); else R.centerOn(Bld.cx(tc), Bld.cy(tc) + 1);
        const before = Object.assign({}, S.res);
        DeckUI.reset();
        const L = document.createElement('div'); document.body.appendChild(L);
        const P = DeckUI.playing = { id, world: S, layer: L, dest: { kind: 'bar', chips: [] }, landed: true };
        DeckUI._land(P, null, false);
        const gained = Object.keys(EL).filter(k => S.res[k] > before[k]);
        const read = k => +String(document.getElementById(EL[k]).textContent).replace(/[^\d]/g, '');
        await wait(420);                         // longer than any count-up: the old bar is done
        DeckUI._tickNumbers();
        const sh = R.cardShows.find(s => s.id === id);
        const list = Deck._townTX.pays ? Deck._townTX.pays(id, sh) : [[0.3]];
        const first = Math.min(...list.map(e => e[0]));
        // the show, up to just before its first piece lands — driven through
        // the shows' own pass (a whole frame of the world sixty times a second
        // on a loaded machine outran the bar's own failsafe, real time)
        const g0 = R.cv.getContext('2d'), step = () => { g0.save(); R.drawCardShows(g0, 1 / 60, 'world'); g0.restore(); };
        while (sh.t + 1 / 60 < first) { step(); DeckUI._tickNumbers(); }
        const held = gained.every(k => read(k) === before[k]);
        // …then through to its end, every number read as it steps
        const seen = {}; gained.forEach(k => seen[k] = new Set([read(k)]));
        for (let i = 0; i < 600 && R.cardShows.indexOf(sh) >= 0; i++) {
          step(); DeckUI._tickNumbers();
          gained.forEach(k => seen[k].add(read(k)));
        }
        // a piece that flies to the bar (the nugget's coins) pays when it arrives:
        // waited for by its result, never a fixed timer (bounded by the failsafe)
        for (let i = 0; i < 160 && DeckUI._ticks.length; i++) { await wait(40); DeckUI._tickNumbers(); gained.forEach(k => seen[k].add(read(k))); }
        const end = gained.every(k => read(k) === S.res[k]);
        // a step is a held number moving between two pieces: more than one value short of the total
        // (asked only of a resource that lands in two or more pieces)
        const steps = gained.map(k => list.filter(e => e[1] === k).length < 2 ? 1 : [...seen[k]].filter(v => v > before[k] && v < S.res[k]).length);
        out[id + (away ? '@away' : '')] = { held, end, steps, pieces: list.length, gained, before: gained.map(k => before[k]), now: gained.map(k => S.res[k]) };
        L.remove(); DeckUI.reset();
      }
    }
    R.cardShows = [];
    return out;
  });
  const E = Object.entries(r);
  ck('theBarWaitsForTheGoodsToLand', E.every(([, x]) => x.held),
    E.map(([id, x]) => `${id}: held ${x.held} (${x.before} → ${x.now})`).join('; '));
  ck('andStepsUpAsEachPieceLands', E.every(([, x]) => x.pieces < 2 || x.steps.every(n => n >= 1)), E.map(([id, x]) => `${id} ${x.steps} over ${x.pieces} pieces`).join('; '));
  ck('andAlwaysEndsOnTheStockpile', E.every(([, x]) => x.end), E.map(([id, x]) => `${id} ${x.end}`).join('; '));
}

// ---------------- 13. THE LIGHT FROM THE SKY, AND THE WEIGHT OF WHAT LANDS ----------------
/* The critics: the goods' beam was "a hard cream RECTANGLE with a flat
   bottom and a flat top cut ~250 px above the ground — a stray UI bar, and
   over grass it reads olive"; the pieces landed with no weight. Measured on
   the show itself, drawn over flat meadow at the moment every piece is
   down and the light still held: the shaft runs to the TOP of the view, it
   TAPERS (narrower up there than at the ground), and — the operator's
   ruling of 2026-10-27 on the map's effects, "higher pixel count", where
   this pinned every pixel as one of the tier's ink colours laid opaque in
   2px cells — it is SMOOTH LIGHT that is never olive: dozens of levels
   across it, a fair share of it part-lit, and of what it brightens at most
   2% yellow-green (the landing's own measure). Each piece lands with its
   own dust (a place-poof), Loose Stone's biggest with a jolt, the nugget's
   coins fly to the gold chip; and the pile LEAVES AS ONE PICTURE, taken
   down smoothly (one composite at a falling alpha — never two
   half-transparent layers, a ghost, and no longer a dither of holes on the
   2px grain). */
{
  const r = await p.evaluate(() => {
    const out = {}, TL = CFG.TILE, TX = Deck._townTX;
    const GRASS = [91, 132, 57];
    for (const id of ['fallen_timber', 'loose_stone', 'gold_nugget']) {
      __tw.fresh('town-shaft-' + id);
      Screens.show('playing'); S.paused = true;
      const tc = __tw.flat();
      R.cam.z = 1.7; R.centerOn(Bld.cx(tc), Bld.cy(tc) + 1);
      R.placePoofs = []; R.cardShows = [];
      let shakes = 0, flown = 0;
      const sk = R.shakeAt, fl = TX && TX.flyToBar;
      R.shakeAt = function () { shakes++; return sk.apply(this, arguments); };
      if (fl) TX.flyToBar = function () { flown++; };
      try {
        Deck.play(id);
        const sh = R.cardShows.find(s => s.id === id);
        const K = Deck.FX[id].show;
        // walk the show through to the moment the last piece is down
        const lastDown = K.land ? K.land((K.LOGS || K.BLOCKS).length - 1) + 0.05 : (K.LAND + K.B1 + K.B2 + 0.02);
        while (sh.t < lastDown) R.drawCardShows(R.cv.getContext('2d'), 1 / 60, 'world');
        const poofs = R.placePoofs.length;
        // the show alone, over flat meadow, in a world-px canvas covering the view
        const vw = Math.ceil(R.viewW() / R.cam.z), vh = Math.ceil(R.viewH() / R.cam.z);
        const cv = document.createElement('canvas'); cv.width = vw; cv.height = vh;
        const cg = cv.getContext('2d');
        cg.fillStyle = 'rgb(' + GRASS + ')'; cg.fillRect(0, 0, vw, vh);
        cg.setTransform(1, 0, 0, 1, -Math.round(R.cam.x), -Math.round(R.cam.y));
        R.drawCardShows(cg, 0, 'world');
        const sp = sh.at, px = Math.round(sp.x * TL - R.cam.x), py = Math.round(sp.y * TL - R.cam.y);
        const d = cg.getImageData(0, 0, vw, vh).data;
        const lum = (a, b2, e) => 0.299 * a + 0.587 * b2 + 0.114 * e, L0 = lum(...GRASS);
        const olive = i => {
          const L = lum(d[i], d[i + 1], d[i + 2]), mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]), q = mx - mn;
          if (!(L - L0 >= 10 && mx && q && q / mx >= 0.2)) return false;
          let h = mx === d[i] ? ((d[i + 1] - d[i + 2]) / q) % 6 : mx === d[i + 1] ? (d[i + 2] - d[i]) / q + 2 : (d[i] - d[i + 1]) / q + 4;
          h *= 60; if (h < 0) h += 360;
          return h >= 48 && h <= 115;
        };
        let lit = 0, topLit = 0, bright = 0, ol = 0, part = 0;
        const levels = new Set();
        const rowW = y => { let n = 0; for (let x = px - 30; x <= px + 30; x++) { const i = (y * vw + x) * 4; if (d[i] !== GRASS[0] || d[i + 1] !== GRASS[1] || d[i + 2] !== GRASS[2]) n++; } return n; };
        const yTop = 0, yBot = Math.max(1, py - Math.round(TL * 2.4));
        for (let y = yTop; y < yBot; y++) for (let x = px - 30; x <= px + 30; x++) {
          if (x < 0 || x >= vw) continue;
          const i = (y * vw + x) * 4;
          if (d[i] === GRASS[0] && d[i + 1] === GRASS[1] && d[i + 2] === GRASS[2]) continue;
          lit++;
          if (y < 24) topLit++;
          const L = lum(d[i], d[i + 1], d[i + 2]);
          levels.add(Math.round(L));
          if (L > L0 + 0.5) { bright++; if (olive(i)) ol++; }
          if (L < L0 + 25) part++;
        }
        let wTop = 0, wBot = 0;
        for (let y = 0; y < 24; y++) wTop = Math.max(wTop, rowW(y));
        for (let y = yBot - 24; y < yBot; y++) wBot = Math.max(wBot, rowW(y));
        // the pile leaves as one picture: through its going, the composite the
        // pieces are laid in (TX.inked) is blitted ONCE a frame, at an alpha
        // that falls smoothly — never two half-clear layers, never in steps
        const cv2 = document.createElement('canvas'); cv2.width = vw; cv2.height = vh;
        const c2 = cv2.getContext('2d');
        const inks = () => (TX._ink || []).map(K => K && K.c).filter(Boolean);
        const P2 = CanvasRenderingContext2D.prototype, di = P2.drawImage, leave = [];
        let blits = null;
        P2.drawImage = function (img) { if (blits && this === c2 && inks().includes(img)) blits.push(this.globalAlpha); return di.apply(this, arguments); };
        const lab = TX.label; TX.label = () => {};   // the count is type: not the pile
        try {
          for (const q of [0.84, 0.87, 0.9, 0.93, 0.96, 0.99]) {
            sh.t = q * sh.ms / 1000;
            if (R.cardShows.indexOf(sh) < 0) R.cardShows.push(sh);
            blits = [];
            c2.setTransform(1, 0, 0, 1, 0, 0); c2.clearRect(0, 0, vw, vh);
            c2.setTransform(1, 0, 0, 1, -Math.round(R.cam.x), -Math.round(R.cam.y));
            R.drawCardShows(c2, 0, 'world');
            leave.push(blits.slice());
          }
        } finally { TX.label = lab; P2.drawImage = di; blits = null; }
        const al = leave.map(b => b.length ? b[0] : null);
        const once = leave.slice(1, -1).every(b => b.length === 1);
        const falls = al.slice(1).every((a, i) => a == null || al[i] == null || a < al[i]) && al.filter(a => a != null && a > 0.02 && a < 0.98).length >= 3;
        out[id] = { lit, topLit, wTop, wBot, poofs, shakes, flown, olive: bright ? ol / bright : 1, levels: levels.size, part: lit ? part / lit : 0,
          once, falls, alphas: al.map(a => a == null ? '-' : +a.toFixed(2)).join(' ') };
      } finally { R.shakeAt = sk; if (fl) TX.flyToBar = fl; }
    }
    R.cardShows = []; R.placePoofs = [];
    return out;
  });
  const E = Object.entries(r);
  ck('theLightRunsDownFromTheTopOfTheView', E.every(([, x]) => x.topLit > 0 && x.lit > 200),
    E.map(([id, x]) => `${id}: ${x.lit} lit px above the pile, ${x.topLit} in the view's top rows`).join('; '));
  ck('andTapersToTheSky', E.every(([, x]) => x.wTop > 0 && x.wTop < x.wBot), E.map(([id, x]) => `${id} ${x.wTop} px wide up top, ${x.wBot} at the ground`).join('; '));
  ck('theShaftIsSmoothLightNeverOlive', E.every(([, x]) => x.lit > 0 && x.levels >= 24 && x.part > 0.15 && x.olive <= 0.02),
    E.map(([id, x]) => `${id}: ${x.levels} levels, ${(100 * x.part).toFixed(0)}% part-lit, ${(100 * x.olive).toFixed(2)}% of what it brightens olive`).join('; '));
  ck('eachPieceLandsInItsOwnDust', r.fallen_timber.poofs >= 4 && r.loose_stone.poofs >= 4 && r.gold_nugget.poofs >= 1,
    E.map(([id, x]) => `${id} ${x.poofs} poofs`).join('; '));
  ck('theStoneJoltsAndTheNuggetsCoinsFly', r.loose_stone.shakes >= 1 && r.gold_nugget.flown >= 3 && r.gold_nugget.flown <= 5,
    `stone shakes ${r.loose_stone.shakes}, coins flown ${r.gold_nugget.flown}`);
  ck('thePileLeavesAsOnePictureSmoothly', E.every(([, x]) => x.once && x.falls),
    E.map(([id, x]) => `${id}: one composite a frame ${x.once}, its alpha falling ${x.alphas}`).join('; '));
}

// ---------------- 14. THE CARAVAN IS THE GAME'S OWN CAST ----------------
/* The critics: the ox, drover and cart were drawn in 2px blocks four times
   coarser than the units, oversized (an ox ~1.5 tiles long), and read as
   placeholder art. The ox is the map's own cattle and the drover a villager
   of the tribe — both drawn through R.unitSprite, the renderer's own unit
   art — and the cart and its load at one world pixel a cell. Measured on the
   caravan alone, stopped at the door before a crate is set down: the cast
   was asked for (a cow and a villager), the picture is NOT confined to the
   2px grid (a share of its edges fall on odd world pixels, where a 2px
   drawing has none), and the whole of it is under 2.75 tiles long. */
{
  const r = await p.evaluate(() => {
    const out = {}, TL = CFG.TILE;
    __tw.fresh('town-cast');
    Screens.show('playing'); S.paused = true;
    const tc = __tw.flat();
    R.cam.z = 1.7; R.centerOn(Bld.cx(tc), Bld.cy(tc) + 1.5);
    const asked = {}, us = R.unitSprite;
    R.unitSprite = function (u) { if (u && !S.units.includes(u)) asked[u.kind] = (asked[u.kind] || 0) + 1; return us.apply(this, arguments); };
    try {
      Deck.play('trade_caravan');
      const sh = R.cardShows.find(s => s.id === 'trade_caravan');
      const K = Deck.FX.trade_caravan.show;
      const g0 = R.cv.getContext('2d');
      for (const q of [0.05, 0.15, 0.25, K.IN + 0.02]) { sh.t = q * sh.ms / 1000; g0.save(); R.drawCardShows(g0, 0, 'world'); g0.restore(); }
      const rd = sh.road;
      out.road = !!rd;
      if (rd) {
        const rowY = (rd.ty + 0.8) * TL, X0 = Math.round((rd.stop - 200) / 2) * 2, Y0 = Math.round((rowY - 100) / 2) * 2;
        const cv = document.createElement('canvas'); cv.width = 400; cv.height = 160;
        const cg = cv.getContext('2d');
        cg.setTransform(1, 0, 0, 1, -X0, -Y0);
        sh.t = (K.IN + 0.02) * sh.ms / 1000;
        if (R.cardShows.indexOf(sh) < 0) R.cardShows.push(sh);
        R.drawCardShows(cg, 0, 'world');
        const d = cg.getImageData(0, 0, 400, 160).data;
        let minX = 1e9, maxX = -1, odd = 0, all = 0;
        for (let y = 0; y < 160; y++) {
          let prev = null;
          for (let x = 0; x < 400; x++) {
            const i = (y * 400 + x) * 4, on = d[i + 3] === 255;
            if (on) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
            const key = on ? d[i] + ',' + d[i + 1] + ',' + d[i + 2] : '';
            if (prev !== null && key !== prev) { all++; if (x % 2) odd++; }
            prev = key;
          }
        }
        out.len = maxX - minX + 1; out.oddShare = all ? odd / all : 0;
      }
    } finally { R.unitSprite = us; }
    out.asked = asked; out.TL = TL;
    R.cardShows = [];
    return out;
  });
  ck('theOxIsTheMapsCattleAndTheDroverAVillager', (r.asked.cow || 0) > 0 && (r.asked.villager || 0) > 0, JSON.stringify(r.asked));
  ck('andTheCaravanIsDrawnAtTheCastsDensity', r.road && r.oddShare > 0.3, `${(100 * r.oddShare).toFixed(0)}% of its edges on odd world pixels (the 2px drawing: 15%, its wheel's off-grid rim alone)`);
  ck('andItIsNoLongerOversized', r.road && r.len > 0 && r.len <= r.TL * 2.75, `${r.len} world px end to end (${(r.len / r.TL).toFixed(2)} tiles)`);
}

// ---------------- 15. THE HOUSE STYLE: MENDING AND THE WATCHFIRES ----------------
/* The critics: Mending washed the hall out with a smooth white radial disc
   and flashed every damaged building as a flat cream SILHOUETTE ("art that
   failed to load"), the hall tinted solid yellow; the Watchfires kept a
   large flat translucent orange disc round every tower top for six days,
   its lower half over the meadow, and the longer reach was never seen
   again after the play. Now a building being mended is SCANNED by a band
   of gold light running down it (smooth, laid through its own picture at
   the device's size — the operator's ruling of 2026-10-27) — at no beat
   does the light cover more than a band of its silhouette; the landing's flash is hard rings with
   nothing over the middle; a beacon lights nothing below its brazier; and a
   tower the player selects while the fires burn shows its longer reach —
   as the ORBIT (R.drawOrbit, pinned in tests/deck-growth.mjs §10b), the
   operator's one reminder for every card that marks a radius. */
{
  const r = await p.evaluate(() => {
    const out = {}, TL = CFG.TILE, TX = Deck._townTX;
    __tw.fresh('town-style');
    Screens.show('playing'); S.paused = true;
    const tc = __tw.flat();
    R.cam.z = 1.7; R.centerOn(Bld.cx(tc), Bld.cy(tc) + 1);
    const house = __tw.bld('P', 'house', tc.x + 3, tc.y + 3);
    house.hp = Math.round(house.maxhp * 0.3);
    R.cardShows = [];
    Deck.play('mending');
    const sh = R.cardShows.find(s => s.id === 'mending');
    const a = TX.art(house), X0 = Math.floor(a.rc.x) - 4, Y0 = Math.floor(a.rc.y) - 4, Wd = Math.ceil(a.rc.w) + 8, Ht = Math.ceil(a.rc.h) + 8;
    // the silhouette, in its own canvas: what the light may at most cover
    const sil = document.createElement('canvas'); sil.width = Wd; sil.height = Ht;
    // (the building's own picture where it is drawn — the shape any overlay of it may cover)
    const sg = sil.getContext('2d'); sg.translate(-X0, -Y0); sg.drawImage(a.spr, a.rc.x, a.rc.y, a.rc.w, a.rc.h);
    const sd = sg.getImageData(0, 0, Wd, Ht).data;
    let silN = 0; for (let i = 3; i < sd.length; i += 4) if (sd[i] > 128) silN++;
    // the mending's light over the house at every beat it plays there — the
    // light laid ON it (the scan); the wave's ring passing over it, the glints
    // and the '+' over its roof are stood down for the read. Light is smooth
    // now (the operator's ruling of 2026-10-27), so a pixel counts as lit at
    // a quarter of its strength, not at its faintest edge
    const h = sh.hit.find(e => e.id === house.id);
    let worst = 0;
    const keep = { halo: TX.halo, spark: TX.spark, plus: TX.plus };
    TX.halo = TX.spark = TX.plus = () => {};
    try {
      for (let k = 0; k <= 10; k++) {
        const age = k / 10 * 0.6;
        sh.t = (h.d + age * sh.speed) / sh.speed;
        const cv = document.createElement('canvas'); cv.width = Wd; cv.height = Ht;
        const cg = cv.getContext('2d'); cg.translate(-X0, -Y0);
        if (R.cardShows.indexOf(sh) < 0) R.cardShows.push(sh);
        R.drawCardShows(cg, 0, 'world');
        const d = cg.getImageData(0, 0, Wd, Ht).data;
        let on = 0;
        for (let i = 3; i < d.length; i += 4) if (d[i] >= 64 && sd[i] > 128) on++;
        worst = Math.max(worst, on / Math.max(1, silN));
      }
    } finally { Object.assign(TX, keep); }
    out.worst = worst; out.silN = silN;
    // the landing's flash: hard rings, nothing laid over its middle
    const rules = [...document.styleSheets].flatMap(ss => { try { return [...ss.cssRules]; } catch (e) { return []; } });
    // (no rule of the flying layer lays a soft disc or a screen blend over
    // the WORLD. The one blend in it is the card's own glaze as it burns into
    // light — a rule INSIDE the card's holder, which is an isolated group, so
    // it screens over the card's face alone; the operator's ruling of
    // 2026-10-27 drew the flight's lights smooth and the card leaves in light,
    // where this read "the lights are pixel canvases, no rule may blend")
    const flyR = rules.filter(rr => rr.selectorText && /#dkFly/.test(rr.selectorText));
    const iso = flyR.some(rr => rr.selectorText.trim() === '#dkFly .dkFCard' && /isolation:\s*isolate/.test(rr.cssText));
    const fly = flyR.filter(rr => !(iso && /\.dkFCard\s+\./.test(rr.selectorText))).map(rr => rr.cssText);
    const soft = fly.filter(t => /radial-gradient|mix-blend-mode:\s*screen|blur\(/.test(t));
    out.hitHard = fly.length > 0 && soft.length === 0;
    out.ringSoft = true;
    out.hitCss = soft.length ? soft.join(' ').slice(0, 160) : fly.length + ' #dkFly rules, none soft';
    // the beacon: nothing below its brazier
    R.cardShows = []; S.deck.fx = [];
    const tw = __tw.bld('P', 'tower', tc.x - 3, tc.y + 2);
    Deck.play('watchfires'); R.cardShows = [];
    const e = Deck.timed('watchfires'), WF = Deck.FX.watchfires, c = TX.crown(tw);
    const cv = document.createElement('canvas'); cv.width = 160; cv.height = 160;
    const cg = cv.getContext('2d'); cg.translate(-(Math.round(c.x) - 80), -(Math.round(c.y) - 80));
    UI.sel = null;
    WF.drawLive(cg, e);
    const d = cg.getImageData(0, 0, 160, 160).data;
    let above = 0, below = 0;
    for (let y = 0; y < 160; y++) for (let x = 0; x < 160; x++) { if (!d[(y * 160 + x) * 4 + 3]) continue; if (y > 80 + 6) below++; else above++; }
    out.above = above; out.below = below;
    // …and selected, it shows its reach: the ORBIT on the ring at range × 1.5
    // (the operator's ruling on every area card — one bead of gold and its
    // fading thread, in the GROUND pass, where the two rings of fire-dots
    // were "a little pixelated and low quality")
    const big = document.createElement('canvas'), R1 = Bld.lv(tw).range * WF.mult.towerRange * TL, S2 = Math.ceil(R1 * 2 + 40);
    big.width = big.height = S2;
    const bg = big.getContext('2d'); bg.translate(-(Bld.cx(tw) * TL - S2 / 2), -(Bld.cy(tw) * TL - S2 / 2));
    const reach = () => { bg.save(); bg.setTransform(1, 0, 0, 1, 0, 0); bg.clearRect(0, 0, S2, S2); bg.restore();
      WF.drawLive(bg, e); if (WF.drawGround) WF.drawGround(bg, e);
      const dd = bg.getImageData(0, 0, S2, S2).data; let n = 0;
      for (let y = 0; y < S2; y++) for (let x = 0; x < S2; x++) { if (!dd[(y * S2 + x) * 4 + 3]) continue; if (Math.abs(Math.hypot(x - S2 / 2, y - S2 / 2) - R1) < 3) n++; } return n; };
    UI.sel = null; out.ringOff = reach();
    UI.sel = { type: 'bld', id: tw.id }; out.ringOn = reach();
    UI.sel = null;
    S.deck.fx = []; R.cardShows = [];
    return out;
  });
  ck('mendingScansTheBuildingNeverFlashesItsSilhouette', r.silN > 100 && r.worst > 0 && r.worst <= 0.6,
    `at its height the light covers ${(100 * r.worst).toFixed(0)}% of the house's ${r.silN} silhouette pixels (a flat flash: all of them)`);
  ck('theLandingFlashIsHardRingsNotADisc', r.hitHard && r.ringSoft, r.hitCss);
  ck('aBeaconLightsNothingBelowItsBrazier', r.above > 30 && r.below === 0, `${r.above} px of flame and embers above, ${r.below} below the brazier`);
  ck('andASelectedTowerShowsItsLongerReach', r.ringOff === 0 && r.ringOn > 40, `the orbit's pixels at range × 1.5: ${r.ringOff} unselected, ${r.ringOn} selected`);
}

// ---------------- 16. MASTER BUILDERS: THE MARK, AND A BUILD RATHER THAN A SWAP ----------------
/* The playtest's critics: playing the card "does nothing on the map, only a
   toast and the ×3 chip"; on placement "the beam is a solid gold rectangle
   that hides the building completely", a bronze card wearing a GOLD beam, and
   the "2 left" float olive on grass and illegible. Now: the play marks the
   hall (three hammers and a '⚒×3') and the Build tab ('⚒×3' while charges
   last); a placement plays the building's own three raising stages in its
   place (R.cardVeil) under a BRONZE column no wider than half the footprint,
   and the count left floats cream on a hard dark rim (TX.label). */
{
  const r = await p.evaluate(() => {
    const out = {};
    __tw.fresh('town-mb-look');
    Screens.show('playing'); S.paused = true;
    const tc = __tw.flat(), TL = CFG.TILE, MB = Deck.FX.master_builders;
    S.res.food = S.res.wood = S.res.stone = S.res.gold = 5000;
    R.cam.z = 2; R.centerOn(Bld.cx(tc) + 2, Bld.cy(tc) + 2);
    R.cardShows = [];
    // THE PLAY: a show at the hall, and the tab's badge
    Deck.play('master_builders');
    const sp = R.cardShows.find(z => z.id === 'master_builders' && z.play);
    out.playShow = !!sp && sp.hall === tc.id;
    const tab = document.getElementById('bmToggle');
    out.badge = tab ? tab.getAttribute('data-mb') : null;
    out.badgeRule = !!document.getElementById('dkMBcss');
    // the play draws its hammers ON the hall (the masons' mark, TX.hammer —
    // drawn at the device's own resolution; it was inked cells, counted so)
    let hamDraws = 0;
    const g = R.cv.getContext('2d'), hammer = Deck._townTX.hammer;
    Deck._townTX.hammer = function () { hamDraws++; return hammer.apply(this, arguments); };
    try { if (sp) for (const pp of [0.3, 0.5, 0.7]) { sp.t = pp * sp.ms / 1000; g.save(); MB.show.draw.call(MB, g, sp, pp); g.restore(); } }
    finally { Deck._townTX.hammer = hammer; }
    out.hamDraws = hamDraws;
    // A PLACEMENT: the stages in its place, under a bronze column
    R.cardShows = [];
    const house = __tw.confirm('barracks', tc.x + 4, tc.y + 4);
    const s = R.cardShows.find(z => z.id === 'master_builders' && z.bid === (house && house.id));
    out.raised = !!house && house.construction === 0 && !!s;
    if (s) {
      const veils = [], drawn = [];
      const di = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function (img) { drawn.push(img); return di.apply(this, arguments); };
      try {
        for (const pp of [0.05, 0.17, 0.29, 0.5]) {
          drawn.length = 0;
          const bx = house.x * TL, by = house.y * TL, bw = Bld.size(house) * TL;
          s.t = pp * s.ms / 1000;
          const v = R.cardVeil ? R.cardVeil(g, house, bx, by, bw) : false;
          veils.push({ p: pp, v, src: drawn[drawn.length - 1] || null });
        }
      } finally { CanvasRenderingContext2D.prototype.drawImage = di; }
      out.veils = veils.map(x => x.v);
      out.stagesDiffer = new Set(veils.slice(0, 3).map(x => x.src)).size === 3 && veils.slice(0, 3).every(x => x.src && x.src !== R.bldSprite(house));
      // …and the building loop really asks it: the finished picture stands down under the stages
      const cv = R.cardVeil || (() => false); let asked = 0, took = 0;
      R.cardVeil = function (gg, b) { const v = cv.apply(this, arguments); if (b === house) { asked++; if (v) took++; } return v; };
      try { G.updateVisibility(); s.t = 0.1 * s.ms / 1000; R.draw(0); } finally { R.cardVeil = cv; }
      out.loop = { asked, took };
      // THE COLUMN: the bronze, and no wider than half the footprint — a
      // smooth beam of the tier's light at the device's own resolution now
      // (R.fxBeam: the operator's ruling of 2026-10-27, where this read the
      // widths of the 2px rects a stepped column was cut in)
      const beam = R.fxBeam, tones = new Set(); let widest = 0;
      R.fxBeam = function (gg, x, foot, top, w, a, tone) {
        tones.add(typeof tone === 'string' ? tone : 'object');
        widest = Math.max(widest, w);
        return beam.apply(this, arguments);
      };
      try { for (const pp of [0.03, 0.15, 0.3, 0.45]) { s.t = pp * s.ms / 1000; g.save(); MB.show.draw.call(MB, g, s, pp); g.restore(); } }
      finally { R.fxBeam = beam; }
      out.tones = [...tones]; out.widest = widest; out.half = Bld.size(house) * TL / 2;
      // THE COUNT: cream on a dark rim (TX.label), never a gold R.float
      const lab = Deck._townTX.label, fl = R.float, said = [];
      Deck._townTX.label = function (gg, ss, key, x, y, lines) { said.push(lines.map(l => l.t + '|' + l.col).join(',')); return lab.apply(this, arguments); };
      R.float = function (x, y, txt, col) { said.push('float:' + txt + '|' + col); return fl.apply(this, arguments); };
      try { for (const pp of [0.55, 0.7]) { s.t = pp * s.ms / 1000; g.save(); MB.show.draw.call(MB, g, s, pp); g.restore(); } }
      finally { Deck._townTX.label = lab; R.float = fl; }
      out.said = said;
    }
    // the badge comes down with the last charge, and is never there with none
    S.deck.charges.master_builders = 1;
    const last = __tw.confirm('house', tc.x - 3, tc.y + 4);
    out.badgeGone = !!last && last.construction === 0 && !tab.hasAttribute('data-mb');
    R.cardShows = [];
    return out;
  });
  ck('thePlayMarksTheHallAndTheBuildTab', r.playShow && r.badge === '⚒×3' && r.badgeRule && r.hamDraws >= 6 && r.badgeGone,
    `a show at the hall ${r.playShow} (${r.hamDraws} hammer draws); the tab says "${r.badge}"; gone with the last charge ${r.badgeGone}`);
  ck('aPlacementPlaysItsThreeStagesInItsPlace', r.raised && JSON.stringify(r.veils) === '[true,true,true,false]' && r.stagesDiffer && r.loop && r.loop.asked > 0 && r.loop.took > 0,
    `stand-in at p .05/.17/.29/.5: ${JSON.stringify(r.veils)}; three different pictures ${r.stagesDiffer}; the loop asked ${r.loop && r.loop.asked}, took ${r.loop && r.loop.took}`);
  ck('underABronzeColumnHalfTheFootprintWide', r.tones && r.tones.length === 1 && r.tones[0] === 'bronze' && r.widest > 0 && r.widest <= r.half,
    `tones ${JSON.stringify(r.tones)}; widest ${r.widest}px against half the footprint ${r.half}px`);
  ck('andTheCountFloatsCreamOnADarkRim', r.said && r.said.length && r.said.every(t => /\|#f2e6cd$/.test(t)) && r.said.some(t => /2 left/.test(t)),
    JSON.stringify(r.said && r.said.slice(0, 3)));
}

// ---------------- 11. THE LOOKS SPEAK THE HOUSE STYLE (the five-player playtest's judges) ----------------
{
  const r = await p.evaluate(() => {
    const out = {};
    __tw.fresh('town-style');
    Screens.show('playing'); S.paused = true;
    const tc = __tw.flat();
    R.cam.z = 1.7; R.centerOn(Bld.cx(tc), Bld.cy(tc) + 0.5);
    const town = [__tw.bld('P', 'house', 6, 8), __tw.bld('P', 'house', 11, 10), __tw.bld('P', 'barracks', 12, 6)];
    for (const z of town) z.hp = z.maxhp = 5000;
    // every mark a card lays ON THE FRAME (R.cv's own context — a scratch
    // canvas may blend as it likes), with its composite, alpha and colour
    // (and every filled or stroked path: the skin's runes, rings and chips are
    // smooth paths at the device's own resolution now — the operator's ruling
    // of 2026-10-27 — where they were 2px rects)
    const P2 = CanvasRenderingContext2D.prototype, fr = P2.fillRect, di = P2.drawImage, rc = P2.rect, pf = P2.fill, ps = P2.stroke;
    let depth = 0, marks = [], rects = null;
    P2.fillRect = function () { if (depth && this.canvas === R.cv) marks.push(['f', this.globalCompositeOperation, this.globalAlpha, String(this.fillStyle)]); return fr.apply(this, arguments); };
    P2.drawImage = function () { if (depth && this.canvas === R.cv) marks.push(['d', this.globalCompositeOperation, this.globalAlpha]); return di.apply(this, arguments); };
    P2.fill = function () { if (depth && this.canvas === R.cv) marks.push(['p', this.globalCompositeOperation, this.globalAlpha, String(this.fillStyle)]); return pf.apply(this, arguments); };
    P2.stroke = function () { if (depth && this.canvas === R.cv) marks.push(['s', this.globalCompositeOperation, this.globalAlpha, String(this.strokeStyle)]); return ps.apply(this, arguments); };
    P2.rect = function () { if (rects) rects.push(Array.from(arguments)); return rc.apply(this, arguments); };
    const inCard = (o, k) => { const f = o && o[k]; if (!f) return () => {}; o[k] = function () { depth++; try { return f.apply(this, arguments); } finally { depth--; } }; return () => { o[k] = f; }; };
    const SK = Deck.FX.stone_skin;
    try {
      /* (a) STONE SKIN IS STONE, NOT LIGHT: the play's wave and casing, the
         eight days' sleeve and sheen, and a blow glancing off — every mark
         laid on the frame is opaque and source-over. The first cut ADDED cold
         white ('lighter') at fractional alpha: mint over the meadow, a
         "selected" ring round every roof, a flat white bar of a sheen. */
      const undo = [inCard(SK.show, 'draw'), inCard(SK.show, 'drawBld'), inCard(SK, 'drawLive'), inCard(SK, 'drawBld')];
      try {
        Deck.play('stone_skin');
        const sh = R.cardShows.find(s => s.id === 'stone_skin');
        for (let k = 0; k <= 16 && sh; k++) {
          sh.t = k / 16 * sh.ms / 1000 * 0.98;
          if (R.cardShows.indexOf(sh) < 0) R.cardShows.push(sh);
          R.draw(0);
        }
        R.cardShows = [];
        const pn = performance.now;
        try {
          for (let k = 0; k < 24; k++) { performance.now = () => 1000 + k * 150; R.draw(1 / 30); }   // the sheen's turn comes round
          performance.now = () => 9000;
          Combat.hitBuilding(town[0], 40);
          R.draw(1 / 30);
          const f = R.floats[R.floats.length - 1];
          out.dyed = !!SK.HIT && !!f && f.txt === '-20' && f.col === SK.HIT;
          out.floatCol = f && f.col;
          performance.now = () => 9150;
          const m0 = marks.length;
          R.draw(1 / 30);
          const ST = SK.STONE || [];
          out.chips = marks.slice(m0).filter(m => (m[0] === 'f' || m[0] === 'p') && ST.includes(m[3])).length;
        } finally { performance.now = pn; }
      } finally { undo.forEach(f => f()); }
      out.marks = marks.length;
      out.light = marks.filter(m => m[1] !== 'source-over' || m[2] < 1).map(m => m.join(':')).slice(0, 4);
      /* (b) THE SHEEN IS A SMOOTH DIAGONAL, NEVER A BAR (the operator's ruling
         of 2026-10-27, where this pinned a staircase of 2px cells, one a row):
         the barracks' sleeve of stone drawn at the device's size twice, with
         the sheen and without, and the difference read — the band runs on the
         diagonal (its middle moves across as it goes down), it is never as
         wide as the stone (a bar), and it is soft (many levels of light, where
         the cells were one colour) */
      {
        const a = Deck._townTX.art(town[2]), K3 = 3;
        const shot = (sheen) => {
          const c = document.createElement('canvas'); c.width = Math.ceil(a.rc.w * K3); c.height = Math.ceil(a.rc.h * K3);
          const g3 = c.getContext('2d'); g3.setTransform(K3, 0, 0, K3, -a.rc.x * K3, -a.rc.y * K3);
          SK.stone(g3, town[2], a, SK._sleeve(a), 1, null, null);
          if (sheen != null) SK.sheen(g3, town[2], a, sheen);
          return { c, d: g3.getImageData(0, 0, c.width, c.height).data };
        };
        const A0 = shot(null), A1 = shot(0.5), Wc = A0.c.width, Hc = A0.c.height, levels = new Set();
        const rowsX = [];
        let widest = 0;
        for (let y = 0; y < Hc; y++) {
          let n = 0, sx = 0, x0 = Infinity, x1 = -1;
          for (let x = 0; x < Wc; x++) {
            const i = (y * Wc + x) * 4, dl = (A1.d[i] + A1.d[i + 1] + A1.d[i + 2]) - (A0.d[i] + A0.d[i + 1] + A0.d[i + 2]);
            if (dl > 9) { n++; sx += x; x0 = Math.min(x0, x); x1 = Math.max(x1, x); levels.add(Math.round(dl / 3)); }
          }
          if (n) { rowsX.push([y, sx / n]); widest = Math.max(widest, x1 - x0 + 1); }
        }
        // the band's middle against its row: a straight run across (correlation)
        const nR = rowsX.length, my = rowsX.reduce((s, r) => s + r[0], 0) / Math.max(1, nR), mx = rowsX.reduce((s, r) => s + r[1], 0) / Math.max(1, nR);
        let sxy = 0, sxx = 0, syy = 0;
        for (const [y, x] of rowsX) { sxy += (y - my) * (x - mx); syy += (y - my) * (y - my); sxx += (x - mx) * (x - mx); }
        const corr = sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
        const artW = (a.box.r - a.box.l) * a.rc.w * K3;
        out.sheen = { rows: nR, corr: +corr.toFixed(2), widest, artW: Math.round(artW), levels: levels.size };
        out.diagonal = nR >= 6 && Math.abs(corr) >= 0.8;
        out.notABar = widest > 0 && widest < artW * 0.6;
        out.smoothSheen = levels.size >= 12;
      }

      /* (c) THE UNBREAKABLE HALL'S LANCE TAPERS ONTO THE ROOF: at the blow,
         the light's rows narrow toward their foot, and the foot is the hall's
         ROOF — the first cut's pillar was half a screen wide, one width top to
         bottom, its flat foot floating at the ground line */
      const U = Deck.FX.unbreakable_hall;
      R.cardShows = []; S.deck.fx = [];
      tc.hp = tc.maxhp;
      Deck.play('unbreakable_hall');
      const sh = R.cardShows.find(s => s.id === 'unbreakable_hall');
      const D = U.geom(tc), TX = Deck._townTX, W = R.cv.width, ground = TX.scr(D.cx, D.gy), roof = TX.scr(D.cx, D.roof != null ? D.roof : D.gy);
      sh.t = U.IMPACT * sh.ms / 1000;
      /* read off the PIXELS of the sky drawn alone on a clean canvas (the
         lance is a smooth taper at the device's own resolution now — the
         operator's ruling of 2026-10-27 — where this read the widths of the
         2px rows it was cut in): the glow its point burns in is stood down
         for the read, so the lance's own foot is what is measured */
      const lc = document.createElement('canvas'); lc.width = W; lc.height = R.cv.height;
      const g2 = lc.getContext('2d'), fg = R.fxGlow;
      R.fxGlow = function () {};
      try { U.show.draw.call(U, g2, sh, U.IMPACT, 0, 'sky'); } finally { R.fxGlow = fg; }
      const ld = g2.getImageData(0, 0, W, lc.height).data, half = 4 * CFG.TILE * ground.z, rowW = [];
      for (let y = 0; y < lc.height; y++) {
        let n = 0;
        for (let x = Math.max(0, Math.floor(ground.x - half)); x < Math.min(W, ground.x + half); x++) {
          const i = (y * W + x) * 4;
          if ((ld[i] + ld[i + 1] + ld[i + 2]) * ld[i + 3] / 255 > 240) n++;   // lit: a light, not the dark the sky darkens to
        }
        rowW.push(n);
      }
      let foot = 0;
      rowW.forEach((n, y) => { if (n > 0) foot = y; });
      const widest = Math.max(...rowW);
      const topW = Math.max(0, ...rowW.filter((n, y) => y < foot * 0.15));
      const lowW = Math.max(0, ...rowW.filter((n, y) => y > foot * 0.8 && y <= foot));
      out.lance = { foot: Math.round(foot), roof: Math.round(roof.y), ground: Math.round(ground.y), widest: Math.round(widest), tile: Math.round(CFG.TILE * ground.z), topW, lowW };
      out.onTheRoof = D.roof != null && foot > 0 && Math.abs(foot - roof.y) <= 8 * ground.z * 2 && foot < ground.y - CFG.TILE * ground.z * 0.5;
      out.tapers = topW > 0 && lowW > 0 && lowW < topW * 0.7 && widest <= 1.6 * CFG.TILE * ground.z;

      /* (d) A SWALLOWED BLOW FLASHES THE DOME'S OUTLINE, NEVER A FILL — read
         off the pixels of the ward at its flash, drawn alone on a clean
         canvas through the world's transform (its ribs are fine lines of
         light at the device's own resolution now, the operator's ruling of
         2026-10-27, where this counted 2px cells): the band along its outline
         is lit, and the dome's middle stays clear of light (the first cut
         filled an amber half-dome cut flat along the ground) */
      R.cardShows = [];
      const pn = performance.now;
      try {
        performance.now = () => 50000;
        tc.hp = U.sliver(tc);
        R.floats = [];
        Combat.hitBuilding(tc, 400);                       // swallowed whole: "Held!"
        const z = R.cam.z * (R.dpr || 1), fc = document.createElement('canvas');
        fc.width = R.cv.width; fc.height = R.cv.height;
        const fg = fc.getContext('2d');
        fg.setTransform(z, 0, 0, z, -R.cam.x * z, -R.cam.y * z);
        U.dome(fg, D, 1, 1, 50);
        const fd = fg.getImageData(0, 0, fc.width, fc.height).data;
        const lit = (wx, wy) => {
          const sx = Math.round((wx - R.cam.x) * z), sy = Math.round((wy - R.cam.y) * z);
          if (sx < 0 || sy < 0 || sx >= fc.width || sy >= fc.height) return null;
          return fd[(sy * fc.width + sx) * 4 + 3] > 40;
        };
        let rim = 0, rimLit = 0, mid = 0, midLit = 0;
        // points on the dome's own outline (its upper half)
        for (let k = 0; k <= 400; k++) {
          const th = Math.PI + k / 400 * Math.PI, v = lit(D.cx + Math.cos(th) * D.rx, D.gy + Math.sin(th) * D.hd);
          if (v != null) { rim++; if (v) rimLit++; }
        }
        // …and the whole of its body inside it, on a grid: a fill lights all of
        // it, an outline and its few fine ribs a small share
        for (let gy0 = 0; gy0 < 60; gy0++) for (let gx0 = 0; gx0 < 60; gx0++) {
          const u = gx0 / 59 * 2 - 1, w = gy0 / 59, wx = D.cx + u * D.rx * 0.85, wy = D.gy - 4 - w * (D.hd * 0.85 - 4);
          if (u * u + Math.pow((D.gy - wy) / D.hd, 2) > 0.85 * 0.85) continue;
          const v = lit(wx, wy);
          if (v != null) { mid++; if (v) midLit++; }
        }
        out.flashRim = rim ? rimLit / rim : 0;
        out.flashMid = mid ? midLit / mid : 1;
        /* (e) …and it is HELD! in gold over a dark edge — the letters stroked
           round in ink at the device's own resolution (eight copies a cell
           apart, the hard rim this pinned, were a smear on a phone) — taking
           over the pale float the blow wrote ("Held!" stays the contract's word) */
        const texts = [], ft = P2.fillText, stt = P2.strokeText;
        P2.fillText = function (t) { if (depth && this.canvas === R.cv) texts.push([t, String(this.fillStyle), 'fill']); return ft.apply(this, arguments); };
        P2.strokeText = function (t) { if (depth && this.canvas === R.cv) texts.push([t, String(this.strokeStyle), 'stroke']); return stt.apply(this, arguments); };
        const undoU = inCard(U, 'drawLive');
        try { R.draw(1 / 30); } finally { undoU(); P2.fillText = ft; P2.strokeText = stt; }
        const held = texts.filter(t => t[0] === 'HELD!');
        out.heldGold = held.some(t => t[2] === 'fill' && (t[1] === U.HELD.col || t[1] === U.HELD.hot)) && held.some(t => t[2] === 'stroke' && t[1] === U.HELD.ink);
        out.paleGone = !R.floats.some(f => f.txt === 'Held!');
        out.heldTexts = held.length;
      } finally { performance.now = pn; P2.fillRect = fr; }

      /* (f) THE WARD'S END IS NEWS: a note on the screen (never the red alarm),
         and the dome breaks where it stood */
      const box = document.getElementById('toasts'), n0 = box.children.length;
      R.cardShows = [];
      const e = Deck.timed('unbreakable_hall');
      e.until = Deck.now() - 1e-6;
      Deck.tick();
      const last = box.children[box.children.length - 1];
      out.endToast = box.children.length > n0 && /ward on your Town Center fades/.test(last.textContent) && !last.classList.contains('warn');
      out.endFall = R.cardShows.some(s => s.id === 'unbreakable_hall' && s.fall);
      R.cardShows = [];
    } finally { P2.fillRect = fr; P2.drawImage = di; P2.rect = rc; P2.fill = pf; P2.stroke = ps; }
    return out;
  });
  ck('stoneSkinIsStoneNotLight', r.marks > 200 && r.light.length === 0,
    `${r.marks} marks on the frame; added or translucent: ${r.light.length ? r.light.join(' | ') : 'none'}`);
  ck('aHalvedBlowFloatsInTheSkinsBlueAndThrowsStone', r.dyed && r.chips >= 5, `the float ${r.floatCol}; ${r.chips} chips of stone`);
  ck('theSkinsSheenIsASmoothDiagonalNeverABar', r.diagonal && r.notABar && r.smoothSheen,
    `${JSON.stringify(r.sheen)}: on the diagonal ${r.diagonal}, never as wide as the stone ${r.notABar}, soft ${r.smoothSheen}`);
  ck('theHallsLanceTapersOntoTheRoof', r.onTheRoof && r.tapers, JSON.stringify(r.lance));
  ck('aSwallowedBlowFlashesTheDomesOutlineNeverAFill', r.flashRim >= 0.6 && r.flashMid <= 0.35,
    `${(100 * r.flashRim).toFixed(0)}% of its outline lit, ${(100 * r.flashMid).toFixed(0)}% of the body inside it (a fill: all of it)`);
  ck('heldIsGoldWithADarkEdge', r.heldGold && r.paleGone, `HELD! drawn ${r.heldTexts}× (gold over a dark edge stroked round it ${r.heldGold}); the pale float taken over ${r.paleGone}`);
  ck('theWardsEndIsNewsOnTheScreen', r.endToast && r.endFall, `a note toast ${r.endToast}; the dome breaks ${r.endFall}`);
}

// ---------------- 17. EVERY ACT IS DRAWN AT THE DEVICE'S OWN RESOLUTION ----------------
/* The operator's ruling of 2026-10-27, on the map's special effects: "This
   one for example looks pixelated… higher pixel count." The world's ART
   stays pixel art — the logs, the stones, the cart, the cast, the buildings
   turned to stone — but every act's LIGHT, and everything thrown off the art
   (dust, chips, leaves, embers), is drawn smooth at the device's own
   resolution. Every town act (and Forager's Cache, whose moment lives here),
   played over the meadow and walked through its beats on every layer it
   draws — and every running card's look — through the world's transform at
   a phone's density: NOT ONE RECT is laid on the frame (the hard pixel's
   tool: 2px cells, ink squares, dithered bands — the pieces are blitted from
   their own pictures, the light is paths and gradients), and of what the
   light alone brightens at most 2% turns yellow-green (the landing's own
   olive measure — the light is still gold, never lime). */
{
  const r = await p.evaluate(() => {
    const out = { acts: {}, live: {} };
    __tw.fresh('town-device');
    Screens.show('playing'); S.paused = true;
    Deck._add('forager_cache', 3);
    const tc = __tw.flat();
    R.cam.z = 1.7; R.centerOn(Bld.cx(tc), Bld.cy(tc) + 1);
    S.res.food = S.res.wood = S.res.stone = S.res.gold = 5000;
    __tw.bld('P', 'tower', tc.x + 5, tc.y - 1); __tw.bld('P', 'warcamp', tc.x - 5, tc.y + 3);
    const hurt = [__tw.bld('P', 'house', tc.x + 3, tc.y + 3), __tw.bld('P', 'house', tc.x - 3, tc.y + 1), __tw.bld('P', 'wall', tc.x + 1, tc.y + 5)];
    G.updateVisibility();
    const BG = [75, 129, 51], z = R.cam.z * (R.dpr || 1);
    const c = document.createElement('canvas'); c.width = R.cv.width; c.height = R.cv.height;
    const g = c.getContext('2d');
    const P2 = CanvasRenderingContext2D.prototype, fr = P2.fillRect;
    let rects = 0, on = false;
    P2.fillRect = function () { if (on && this === g) rects++; if (lightOnly && !inLight && this === g) return; return fr.apply(this, arguments); };
    /* THE LIGHT ALONE, for the olive read: a second pass in which only what
       the light helpers lay reaches the probe — the art (leaves, coins, the
       runes' pale stone) is stood down, since an object's antialiased edge
       over the meadow is not light and is not what the rule is about */
    let lightOnly = false, inLight = 0;
    const TXh = Deck._townTX, wrapL = (o, k) => { const f = o[k]; if (typeof f !== 'function') return () => {}; o[k] = function () { inLight++; try { return f.apply(this, arguments); } finally { inLight--; } }; return () => { o[k] = f; }; };
    const undoL = ['fxGlow', 'fxRays', 'fxBeam', 'fxRing', 'fxSpark', 'fxDot', 'fxLight', 'fxMotes', 'glow', 'glowHot', 'drawOrbit'].map(k => wrapL(R, k))
      .concat(['taper', 'line', 'lit'].map(k => wrapL(TXh, k)));
    const gate = {};
    for (const k of ['fill', 'stroke', 'drawImage', 'fillText', 'strokeText']) {
      const f = P2[k]; gate[k] = f;
      P2[k] = function () { if (lightOnly && !inLight && this === g) return; return f.apply(this, arguments); };
    }
    const lum = (a, b2, e) => 0.299 * a + 0.587 * b2 + 0.114 * e, L0 = lum(...BG);
    const read = (o) => {
      const d = g.getImageData(0, 0, c.width, c.height).data;
      for (let i = 0; i < d.length; i += 16) {
        if (d[i] === BG[0] && d[i + 1] === BG[1] && d[i + 2] === BG[2]) continue;
        const L = lum(d[i], d[i + 1], d[i + 2]);
        if (!(L > L0 + 0.5)) continue;
        o.bright++;
        const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]), q = mx - mn;
        if (L - L0 >= 10 && mx && q && q / mx >= 0.2) {
          let h = mx === d[i] ? ((d[i + 1] - d[i + 2]) / q) % 6 : mx === d[i + 1] ? (d[i + 2] - d[i]) / q + 2 : (d[i] - d[i + 1]) / q + 4;
          h *= 60; if (h < 0) h += 360;
          if (h >= 48 && h <= 115) o.olive++;
        }
      }
    };
    const meadow = () => { g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.fillStyle = `rgb(${BG})`; fr.call(g, 0, 0, c.width, c.height); };
    const world = () => g.setTransform(z, 0, 0, z, -R.cam.x * z, -R.cam.y * z);
    const PS = [0.04, 0.12, 0.22, 0.34, 0.46, 0.58, 0.7, 0.82, 0.94];
    try {
      for (const id of __tw.TOWN.concat(['forager_cache'])) {
        for (const h of hurt) h.hp = Math.round(h.maxhp * 0.4);
        R.cardShows = [];
        let sh;
        if (id === 'master_builders') { Deck.play(id); const nb = __tw.confirm('house', tc.x - 4, tc.y - 3); sh = R.cardShows.find(s => s.id === id && s.bid === (nb && nb.id)); }
        else { const rr = Deck.play(id); sh = rr.ok && R.cardShows.find(s => s.id === id); }
        const o = out.acts[id] = { rects: 0, bright: 0, olive: 0, drawn: !!sh };
        if (!sh) continue;
        const layers = Deck.FX[id].show.layers || [Deck.FX[id].show.layer || 'world'];
        for (const pp of PS) for (const pass of ['all', 'light']) {
          sh.t = pp * sh.ms / 1000;
          if (R.cardShows.indexOf(sh) < 0) R.cardShows.push(sh);
          meadow();
          rects = 0; on = pass === 'all'; lightOnly = pass === 'light';
          for (const L of layers) {
            g.save();
            if (L === 'sky') g.setTransform(1, 0, 0, 1, 0, 0); else world();
            try { R.drawCardShows(g, 0, L); } catch (e) { o.threw = String(e); }
            g.restore();
          }
          on = false; lightOnly = false;
          if (pass === 'all') o.rects += rects; else read(o);
        }
      }
      // every running card's look, on the frame's own beats
      R.cardShows = [];
      const pn = performance.now;
      for (const id of ['watchfires', 'stone_skin', 'unbreakable_hall']) {
        const d = Deck.FX[id], e = Deck.timed(id), o = out.live[id] = { rects: 0, bright: 0, olive: 0 };
        if (!e) { o.missing = true; continue; }
        if (id === 'stone_skin') { Combat.hitBuilding(hurt[0], 30); }
        if (id === 'unbreakable_hall') { tc.hp = d.sliver(tc); Combat.hitBuilding(tc, 400); }
        for (let k = 0; k < 6; k++) for (const pass of ['all', 'light']) {
          const t0 = pn.call(performance);
          performance.now = () => t0 + k * 230;
          meadow(); world();
          rects = 0; on = pass === 'all'; lightOnly = pass === 'light';
          try {
            if (d.drawLive) d.drawLive(g, e);
            if (d.drawBld) for (const b of S.buildings) if (b.owner === 'P') d.drawBld(g, b, e);
            if (d.drawGround) d.drawGround(g, e);
          } finally { on = false; lightOnly = false; performance.now = pn; }
          if (pass === 'all') o.rects += rects; else read(o);
        }
      }
    } finally { P2.fillRect = fr; Object.assign(P2, gate); undoL.forEach(f => f()); }
    R.cardShows = [];
    return out;
  });
  const A = Object.entries(r.acts), Lv = Object.entries(r.live);
  ck('everyTownActIsDrawnAtTheDevicesOwnResolution', A.length === 10 && A.every(([, o]) => o.drawn && !o.threw && o.rects === 0) && Lv.every(([, o]) => !o.missing && o.rects === 0),
    A.map(([id, o]) => `${id} ${o.drawn ? o.rects + ' rects' : 'NOT DRAWN'}${o.threw ? ' THREW ' + o.threw : ''}`).join(', ') + ' | looks: ' + Lv.map(([id, o]) => `${id} ${o.missing ? 'NOT RUNNING' : o.rects + ' rects'}`).join(', '));
  ck('andItsLightIsNeverOlive', A.concat(Lv).every(([, o]) => !o.bright || o.olive / o.bright <= 0.02),
    A.concat(Lv).map(([id, o]) => `${id} ${o.bright ? (100 * o.olive / o.bright).toFixed(2) + '%' : '-'}`).join(', '));
}

for (const [k, v] of Object.entries(res)) console.log((v.startsWith('PASS') ? ' ' : '✗') + ' ' + k + ': ' + v);
if (errs.length) console.log('PAGE ERRORS:', errs.slice(0, 4));
await b.close();
if (fails.length || errs.length) { console.log('FAILURES:', fails.join(', ') || 'pageerrors'); process.exit(1); }
console.log('ALL DECK-TOWN CHECKS PASS');
