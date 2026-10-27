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
                       is synthesized

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
  ck('andTheGhostSaysAChargeIsAboutToBeSpent', /Master Builders.*3 in hand/.test(r.ghostChip) && !/Master Builders/.test(r.ghostBare),
    `“${r.ghostChip}”; with none in hand “${r.ghostBare}”`);
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
    const out = { ops: {}, live: {}, threw: [] };
    const ce = console.error, caught = [];
    console.error = function () { caught.push(Array.from(arguments).map(String).join(' ')); return ce.apply(this, arguments); };
    // count what a show actually lays down: hard rects and blits
    const P2 = CanvasRenderingContext2D.prototype, fr = P2.fillRect, di = P2.drawImage;
    let ops = 0;
    P2.fillRect = function () { ops++; return fr.apply(this, arguments); };
    P2.drawImage = function () { ops++; return di.apply(this, arguments); };
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
        out.ops[id] = kept ? peak : 0;
      }
      R.drawCardShows = dcs;
      R.cardShows = [];
      // every running card's look: drawn while it runs, gone when it ends
      for (const id of ['watchfires', 'stone_skin', 'unbreakable_hall']) {
        const d = Deck.FX[id], dl = d.drawLive;
        let n = 0;
        d.drawLive = function () { const o0 = ops; const v = dl.apply(this, arguments); n += ops - o0; return v; };
        R._liveErr = 0;
        for (let i = 0; i < 6; i++) R.draw(1 / 30);
        d.drawLive = dl;
        out.live[id] = R._liveErr ? -1 : n;
      }
      // a blow glances off the skin and the ward flares: the looks answer it
      Combat.hitBuilding(hurt[0], 30);
      Combat.hitBuilding(tc, 30);
      R._liveErr = 0;
      for (let i = 0; i < 4; i++) R.draw(1 / 30);
      out.struck = !R._liveErr && Deck.FX.stone_skin._glints.length > 0 && performance.now() - Deck.FX.unbreakable_hall._hit < 1000;
      // the shows drain away on their own clock
      for (const id of ['fallen_timber', 'trade_caravan', 'unbreakable_hall']) R.startCardShow(id, { tc: tc.id, side: 1, dir: 1, fresh: true });
      for (let i = 0; i < 200 && R.cardShows.length; i++) R.draw(1 / 30);
      out.drained = R.cardShows.length === 0;
      out.inS = /cardShows|_glints/.test(JSON.stringify(S));
    } finally {
      P2.fillRect = fr; P2.drawImage = di; console.error = ce;
    }
    out.caught = caught.filter(m => /card show|card look/.test(m));
    // every voice is synthesized, gapped, and plays without a fault
    const V = ['cardWood', 'cardStone', 'cardGold', 'cardCaravan', 'cardMend', 'cardBuild', 'cardFire', 'cardSkin', 'cardGlance', 'cardRise', 'cardHall', 'cardWard'];
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
  ck('andEveryMomentIsMoreThanAGlint', shown.every(([, n]) => n >= 40), 'at least 40 hard marks at its height, every one');
  ck('everyRunningCardWearsItsLook', Object.values(r.live).every(n => n > 0) && r.struck,
    JSON.stringify(r.live) + `; a blow glances and the ward flares ${r.struck}`);
  ck('aFrameWithNoCardInPlayPaysNothing', r.idleCalls === 0, `${r.idleCalls} card-world passes over six frames (three with a charge in hand)`);
  ck('theShowsAreRenderStateAndDrainAway', r.drained && !r.inS);
  ck('everyVoiceIsSynthesized', r.voices && !r.vthrew, r.vthrew || 'twelve voices, each with its gap');
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
    /* (b) ONE WORLD-SIZED COPY PER SPRITE, whatever the colours: a town of
       many kinds under Mending's flare, Stone Skin's casing and its look
       (four colours between them) — the canvases the card draws make are
       counted, and every copy is the size of its art rect, not the PNG's */
    const town = [burnt];
    const KEYS = ['house', 'barracks', 'range', 'stable', 'siege', 'sapper', 'trade', 'warcamp', 'tower', 'wall', 'gate'];
    KEYS.forEach((k, i) => { const z = __tw.bld('P', k, 3 + (i % 4) * 3, 14 + Math.floor(i / 4) * 3); if (z) town.push(z); });
    for (const z of town) z.hp = Math.max(1, Math.round(z.maxhp * 0.5));
    R.draw(0);                       // the building pass's own variants, made before anything is counted
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
    out.onePer = made > 0 && made <= 2 * sprites.size + 2;
    out.sized = town.filter(z => Bld.get(z.id)).every(z => {
      const a = TX.art(z), m = TX._mask.get(a.spr);
      return !m || (m.c.width === Math.max(1, Math.round(a.rc.w)) && m.c.height === Math.max(1, Math.round(a.rc.h)));
    });
    R.cardShows = []; S.deck.fx = [];
    /* (c) THE GOODS BRING THE HALL ON SCREEN: their moment lands at its door,
       so a goods card played with the camera elsewhere brings it into view
       first, as a 'tc' card does — and a card with no moment there (Master
       Builders, also at the bar) leaves the camera alone */
    const door = () => R.onScreen(Bld.cx(tc), Bld.cy(tc) + Bld.size(tc) / 2);
    R.centerOn(CFG.W - 5, CFG.H - 5);
    const away = !door();
    DeckUI._dest('bar', 'fallen_timber');
    const brought = door();
    R.centerOn(CFG.W - 5, CFG.H - 5);
    DeckUI._dest('bar', 'master_builders');
    out.camera = away && brought && !door() &&
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
    out.noneDraws = !threw && sh.road === null;
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
  ck('oneWorldSizedCopyPerSpriteWhateverTheColours', r.onePer && r.sized,
    `${r.made} canvases for ${r.K} sprites under four colours (at most two each); every copy the size of its art rect ${r.sized}`);
  ck('theGoodsBringTheHallOnScreen', r.camera, 'a goods card brings the hall into view; Master Builders leaves the camera alone');
  ck('theCaravansRoadIsOneTheMapCanCarry', r.open && r.wet && r.crowd,
    `open ground: the full road ${r.open}; a channel across it cuts it short, never crossed ${r.wet} (${r.wetN}); a row of people: the next row ${r.crowd}`);
  ck('andWithNoRoadTheLoadStillComes', r.none && r.noneDraws, r.threw || 'no row can carry the cart: the load comes down in the card\'s light');
  ck('aChargeKeptUnderAnotherKeyIsStillSeen', r.pact && r.pactGone, `the pact's bands under 'pact' wear the card's chip ${r.pact}; gone with the charge ${r.pactGone}`);
}

for (const [k, v] of Object.entries(res)) console.log((v.startsWith('PASS') ? ' ' : '✗') + ' ' + k + ': ' + v);
if (errs.length) console.log('PAGE ERRORS:', errs.slice(0, 4));
await b.close();
if (fails.length || errs.length) { console.log('FAILURES:', fails.join(', ') || 'pageerrors'); process.exit(1); }
console.log('ALL DECK-TOWN CHECKS PASS');
