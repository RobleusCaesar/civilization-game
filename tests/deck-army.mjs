/* THE CARD SYSTEM — the ARMY (js/deckfx-army.js) and the muster every
   summoning card shares (Deck.summon, js/deckfx.js): nine cards, each
   measured doing exactly what its card says, and every trap the survey
   found (scratchpad critic §0.6, §0.8, §0.10, §2.12, §2.20, §2.36) pinned
   by a check that would FAIL on the obvious implementation — each one with
   its CONTROL beside it, so the probe can be seen to see.

     THE SWITCH        off, nothing plays and no hook moves a number: a
                       fight, a famine, a bombardment and the casualty log
                       are byte-identical with the hooks, without Deck at
                       all, and with the switch on but no card played
     THE MUSTER        fifteen on fifteen tiles (the yards' own search answers
                       one tile fifteen times), never across water from the
                       doorstep, flashes staggered with each unit hidden until
                       its own, a held beat that marches as one, no sky-iron
                       for a card's soldier (a trained one takes it), the
                       origin card's stamps kept, no "trained" point, every
                       summoning card refused AND KEPT with no hall or no
                       ground, in its own words
     THE NUMBERS       every number of every card: 3 villagers; 5 of the best
                       FINISHED barracks' infantry (a site and an upgrade
                       counted right); 3 war-wolves at 70/10 and faster than a
                       defender; 6 champions; a catapult and a ballista;
                       5/4/3 with the Fire Archer the range's top rank; 2
                       trebuchets and a tower; 15 spectral champions for 6
                       days; and the approved texts, word for word
     POPULATION        the soldiers count and eat and may pass the cap — at
                       the hall's ceiling too, where training then waits;
                       wolves and ghosts neither count nor eat, a ghost below
                       deck included; the tribe's greatest size is its
                       population (popUsed), never its beasts and ghosts
     THE WAR-WOLVES    yours and nobody's game; go for a foe near the hall
                       and not one past it; let a runner go at the edge of
                       home (the Houndmaster's beast chases forever); strike
                       back; come home after a fight; an order is obeyed, then
                       home; the truce holds; the tribe's dye at their feet
     VETERANS          every rank of every land kind, health in proportion,
                       the origin card and the sky-iron carried over, the
                       soldiers below deck too, never stacked, a veteran
                       engine's stone a quarter heavier, the promoted
                       catapult healable, the panel naming the new rank, and
                       the two refusals
     THE HOST          no famine takes a ghost, no Heal offered, no alarm when
                       one falls, its kills are kills, all fade on the day —
                       the ones aboard a hull too — and a second host
                       lengthens the first; each ghost under the ground until
                       its beat in the rising
     SAVES             a muster mid-beat, the pack's home, a veteran and a
                       host on the march all ride a save
     NO RNG / NO SCORE no card draws S.rngState; playing one scores nothing
     THE TRUCE         a summoning never breaks the Calm peace
     THE PICTURE       every show draws at every beat of every layer, the
                       host's live look and every card unit's own look, whole
                       frames run clean, the shows are render state only, and
                       every voice is synthesized (no audio file)

   Run after touching: js/deckfx-army.js, Deck.summon / swift_raiders in
   js/deckfx.js, Units.spawn's card opt, Units.mortal (popUsed, foodUpkeep,
   desertHungry), Units.damage's casualty line and retaliation,
   Units.resolveAfterFight, the 'muster' task, Combat's war-wolf branches and
   the veteran's bldAtk, G.dayTick's peakPop, CFG.HEAL_FOOD, R.startSummon /
   _unborn and the unit pass's card look, UI's panel name/hint/heal.

     node tests/deck-army.mjs      # exits non-zero on any regression */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdirSync, statSync } from 'node:fs';
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

const ARMY = ['willing_hands', 'war_band', 'hunters_pack', 'iron_legion', 'siege_train', 'veterans',
  'legion_marches', 'trebuchet_battery', 'ancestors_host'];
const SUMMONERS = ARMY.filter(id => id !== 'veterans').concat(['swift_raiders']);

await p.evaluate(({ ARMY }) => {
  Boot.force(); Screens._demo = false;
  // the RAF loop stands down: a test drives the sim and the picture itself
  window.requestAnimationFrame = () => 0;
  const W = () => CFG.W, H = () => CFG.H;
  window.__ar = {
    seed(n) { let s = n || 7; Math.random = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; Combat.scanT = 0; Units.herdClock = 0; },
    // a fresh run with the switch ON and a hand of every army card
    fresh(seed, mode) {
      CFG.CARDS.ON = true;
      G.newGame(seed, mode || 'moderate', 'medium');
      S.paused = true;
      Deck._col = null; Deck._del(Deck.KEY);
      for (const id of ARMY.concat(['swift_raiders'])) Deck._add(id, 9);
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
      R.summons = []; R.cardShows = []; R._unborn = null;
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
    // what a play brings: the units that were not there before it
    play(id, tgt) {
      const ids0 = new Set(S.units.map(u => u.id));
      const r = Deck.play(id, tgt);
      return { r, units: S.units.filter(u => !ids0.has(u.id)) };
    },
    sim(sec, dt) { dt = dt || 0.1; for (let t = 0; t < sec - 1e-9; t += dt) { Units.update(dt); Combat.update(dt); } },
    drown() {
      const tc = Bld.tcOf('P');
      for (let dy = -9; dy <= 10; dy++) for (let dx = -9; dx <= 10; dx++) {
        const x = tc.x + dx, y = tc.y + dy;
        if (MapGen.inB(x, y) && !Bld.at(x, y)) S.map.terrain[MapGen.idx(x, y)] = T.WATER;
      }
      Bld._block = null;
    },
    kinds(list) { return list.map(u => u.kind).sort().join(','); },
  };
}, { ARMY });

// ---------------- 0. THE SWITCH: off, nothing moves ----------------
{
  const r = await p.evaluate(({ ARMY }) => {
    const out = {};
    out.off = CFG.CARDS.ON === false && !Deck.on();
    G.newGame('army-off', 'moderate', 'medium'); S.paused = true;
    out.refused = ARMY.every(id => !Deck.play(id).ok);
    /* one deterministic scene, run four ways: hooks reachable with the switch
       off, window.Deck gone (every hook's guard — the game as it was), the
       switch ON with nothing played, and a CONTROL with a card's people in it */
    const run = (mode) => {
      __ar.seed(11);
      G.newGame('army-hooks', 'moderate', 'medium'); S.paused = true;
      if (mode === 'idle') { CFG.CARDS.ON = true; Deck._col = null; Deck._del(Deck.KEY); for (const id of ARMY) Deck._add(id, 1); }
      __ar.flat();
      const tc = Bld.tcOf('P');
      // a band at the gate and a garrison to meet it
      const ds = [0, 1, 2].map(i => __ar.unit('defender', 'P', tc.x + 1 + i, tc.y + 4.5));
      const arc = __ar.unit('archer', 'P', tc.x + 0.5, tc.y + 5.5);
      const wolf = __ar.unit('wolf', 'P', tc.x - 1.5, tc.y + 3.5);    // the Houndmaster's kind of beast
      for (let i = 0; i < 4; i++) { const r2 = __ar.unit('raider', 'R', tc.x + 1 + i, tc.y + 8.5); r2.hostileTo = 'P'; }
      if (mode === 'control') { ds[0].vet = 1.25; ds[0].atk *= 1.25; wolf.warWolf = true; wolf.den = { x: tc.x - 2, y: tc.y + 3 }; }
      // a catapult on a rival hut
      const hut = __ar.bld('A', 'house', tc.x + 12, tc.y + 2, 4000);
      const cat = __ar.unit('catapult', 'P', tc.x + 8.5, tc.y + 2.5);
      cat.task = { type: 'attack' }; cat.tBld = hut.id;
      for (let i = 0; i < 200; i++) { Units.update(0.05); Combat.update(0.05); }
      // a famine: who walks off first
      S.res.food = 0;
      const dep = [Units.desertHungry('P'), Units.desertHungry('P')];
      return JSON.stringify([S.units.map(u => [u.id, u.kind, +u.x.toFixed(3), +u.y.toFixed(3), +u.hp.toFixed(3), u.tUnit, u.task && u.task.type]),
        hut.hp, Units.popUsed('P'), Units.foodUpkeep('P'), S.log.slice(0, 12).map(l => l.msg), S.stats.kills, dep]);
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
    out.sample = bare.slice(0, 160);
    out.diff = hooks === bare ? (idle === bare ? '' : 'idle') : 'hooks';
    return out;
  }, { ARMY });
  ck('offTheSwitchShipsOffAndNoArmyCardPlays', r.off && r.refused, `off ${r.off}, all nine refused ${r.refused}`);
  ck('noHookMovesANumberWithNoCardInPlay', r.same && r.seen,
    r.same ? `a fight, a bombardment, a famine and the casualty log byte-identical off / without Deck / on-but-idle; a card's people move them: ${r.seen}` : `differs (${r.diff}): ${r.sample}`);
}

// ---------------- 1. THE MUSTER (Deck.summon) ----------------
{
  const r = await p.evaluate(() => {
    const out = {};
    __ar.fresh('army-muster'); __ar.flat();
    const tc = Bld.tcOf('P'), W = CFG.W, door = { x: tc.x, y: tc.y + Bld.size(tc) };
    // the CONTROL: the yards' own search, asked fifteen times, answers one tile
    out.yard = new Set(Array.from({ length: 15 }, () => { const s = Bld.spawnSpotAt('P', 'elite', door.x, door.y); return s.x + ',' + s.y; })).size;
    const { r: play, units } = __ar.play('ancestors_host');
    out.n = units.length;
    out.tiles = new Set(units.map(u => (u.x | 0) + ',' + (u.y | 0))).size;
    out.open = units.every(u => Bld.spawnRoom('P', 'land', u.x | 0, u.y | 0));
    out.near = Math.max(...units.map(u => Math.hypot(u.x - door.x - 0.5, u.y - door.y - 0.5)));
    // NEVER ACROSS THE WATER: a channel one row below the doorstep, the whole
    // width of the map — the far bank is open ground in reach of the search
    // and no foot from the door can walk to it
    __ar.fresh('army-river'); __ar.flat();
    for (let x = 0; x < W; x++) S.map.terrain[MapGen.idx(x, door.y + 1)] = T.WATER;
    Bld._block = null;
    const reach = Path.reachFrom([door]);
    // the naive search (the yards' rule, a tile each, no road asked): it
    // reaches the far bank before it runs out of room
    const used = new Set(), naive = [];
    for (let i = 0; i < 15; i++) {
      const s = MapGen.findNear(door.x, door.y, Bld.SPAWN_R, (x, y) => !used.has(y * W + x) && Bld.spawnRoom('P', 'land', x, y));
      if (!s) break; used.add(s.y * W + s.x); naive.push(s);
    }
    out.naiveFar = naive.filter(s => !reach[s.y * W + s.x]).length;
    const legion = __ar.play('legion_marches').units;
    out.far = legion.filter(u => !reach[(u.y | 0) * W + (u.x | 0)]).length;
    out.legionTiles = new Set(legion.map(u => (u.x | 0) + ',' + (u.y | 0))).size;
    return out;
  });
  ck('fifteenStandOnFifteenTiles', r.yard === 1 && r.n === 15 && r.tiles === 15 && r.open && r.near <= 6.8,
    `the yards' search: ${r.yard} tile for 15 asks; the host: ${r.n} on ${r.tiles} tiles, all really open ${r.open}, farthest ${r.near.toFixed(2)} from the door`);
  ck('neverAcrossTheWaterFromTheDoor', r.naiveFar > 0 && r.far === 0 && r.legionTiles === 12,
    `a search that asks no road puts ${r.naiveFar} of 15 on the far bank; the legion puts ${r.far} there, on ${r.legionTiles} tiles`);
}
{
  const r = await p.evaluate(() => {
    const out = {};
    __ar.fresh('army-beat'); __ar.flat();
    // STAGGERED: the war band's flashes come one after another, each unit
    // unseen until its own, and each marches on its own beat
    const { units: wb } = __ar.play('war_band');
    const F = Deck.FX.war_band;
    out.flashT = R.summons.slice(-5).map(s => +(-s.t).toFixed(3));
    out.flashWant = [0, 1, 2, 3, 4].map(i => +(i * F.STAGGER / 1000).toFixed(3));
    out.flashIds = R.summons.slice(-5).map(s => s.id).join(',') === wb.map(u => u.id).join(',');
    out.hidden = R._unborn ? wb.filter(u => R._unborn.has(u.id)).length : 0;
    out.waits = wb.map(u => u.task && u.task.type === 'muster' ? +u.task.wait.toFixed(3) : null);
    out.waitWant = wb.map((u, i) => +(F.HOLD + i * F.STAGGER / 1000).toFixed(3));
    // the picture's clock: once every flash has started nobody is hidden
    const g = R.g; g.save(); R.drawSummons(g, 0.7); g.restore();
    out.allOut = !R._unborn || wb.every(u => !R._unborn.has(u.id));
    __ar.sim(0.6);
    out.firstGone = wb[0].task && wb[0].task.type === 'move' && wb[4].task && wb[4].task.type === 'muster';
    __ar.sim(1.2);
    out.allGone = wb.every(u => !(u.task && u.task.type === 'muster'));
    // TOGETHER: the legion stands until its last is out, then marches as one
    __ar.fresh('army-together'); __ar.flat();
    const { units: lg } = __ar.play('legion_marches');
    const L = Deck.FX.legion_marches;
    out.together = [...new Set(lg.map(u => u.task && u.task.wait != null ? u.task.wait.toFixed(3) : 'x'))];
    out.togetherWant = (L.HOLD + 11 * L.STAGGER / 1000).toFixed(3);
    __ar.sim(2.3);
    out.stillHeld = lg.every(u => u.task && u.task.type === 'muster');
    __ar.sim(0.3);
    out.marched = lg.every(u => u.task && u.task.type === 'move' && u.path && u.path.length);
    // Swift Raiders keep their pinned arrival: all at once, straight out
    __ar.fresh('army-raid'); __ar.flat();
    const { units: sr } = __ar.play('swift_raiders');
    out.raidersAtOnce = R.summons.slice(-5).every(s => s.t === 0) && sr.every(u => u.task && u.task.type === 'move' && u.path && u.path.length);
    return out;
  });
  ck('aStaggeredMusterStepsOutOneAtATime', JSON.stringify(r.flashT) === JSON.stringify(r.flashWant) && r.flashIds && r.hidden === 4 && r.allOut,
    `flashes at ${r.flashT.join('/')}s, ${r.hidden} of 5 unseen until their own, all out once begun ${r.allOut}`);
  ck('andEachMarchesOnItsOwnBeat', JSON.stringify(r.waits) === JSON.stringify(r.waitWant) && r.firstGone && r.allGone,
    `waits ${r.waits.join('/')}s; the first gone at 0.6s and the last still standing ${r.firstGone}; all gone by 1.8s ${r.allGone}`);
  ck('theLegionHoldsItsBeatAndMarchesAsOne', r.together.length === 1 && r.together[0] === r.togetherWant && r.stillHeld && r.marched,
    `every one waits ${r.together.join('|')}s (want ${r.togetherWant}); held at 2.3s ${r.stillHeld}; all marching at 2.6s ${r.marched}`);
  ck('swiftRaidersKeepTheirArrival', r.raidersAtOnce, 'all five flash at once and ride straight out');
}
{
  const r = await p.evaluate(({ SUMMONERS }) => {
    const out = {};
    __ar.fresh('army-iron'); __ar.flat();
    const tc = Bld.tcOf('P');
    // STARFALL'S SKY-IRON is for soldiers the yards raise: six blades waiting
    S.starfall = { avail: false, done: true, phase: null, iron: { P: 6, A: 0 }, x: -1, y: -1 };
    const trained0 = S.stats.trained;
    const got = {};
    for (const id of SUMMONERS) got[id] = __ar.play(id).units;
    out.iron = S.starfall.iron.P;
    out.anyIron = Object.values(got).some(l => l.some(u => u.skyIron));
    out.trained = S.stats.trained - trained0;
    // the CONTROL: a soldier the yards raise takes one
    const t = Units.spawn('elite', 'P', tc.x + 3, tc.y + 6);
    out.trainedTakes = S.starfall.iron.P === 5 && t.skyIron && t.atk === CFG.UNITS.elite.atk + 1;
    // …and the origin card's stamps ARE kept (Ironhand's toughness)
    __ar.fresh('army-iron2'); __ar.flat();
    S.boons.P = { train: { hpMult: 1.2, costMult: 1 } };
    const wb = __ar.play('war_band').units;
    out.ironhand = wb.map(u => u.maxhp);
    out.ironhandWant = Math.round(CFG.UNITS.defender.hp * 1.2);
    return out;
  }, { SUMMONERS });
  ck('aCardsSoldierNeverTakesTheSkyIron', r.iron === 6 && !r.anyIron && r.trainedTakes,
    `six blades waiting: ${r.iron} left after every summoning card; a soldier the yards raise takes one: ${r.trainedTakes}`);
  ck('butKeepsTheOriginCardsStamps', r.ironhand.every(h => h === r.ironhandWant), `Ironhand defenders at ${r.ironhand.join('/')} hp (want ${r.ironhandWant})`);
  ck('raisingThemIsNotTraining', r.trained === 0, `units trained +${r.trained}`);
}
{
  const r = await p.evaluate(({ SUMMONERS }) => {
    const out = { noHall: {}, noGround: {} };
    for (const id of SUMMONERS) {
      __ar.fresh('army-no-' + id); __ar.flat();
      __ar.drown();
      const n0 = Deck.count(id), u0 = S.units.length;
      const a = Deck.play(id);
      out.noGround[id] = !a.ok && a.why === 'There is no open ground beside your Town Center.' && Deck.count(id) === n0 && S.units.length === u0;
      S.buildings = S.buildings.filter(z => !(z.owner === 'P' && z.key === 'tc')); Bld._block = null;
      const b2 = Deck.play(id);
      out.noHall[id] = !b2.ok && b2.why === 'Your Town Center must stand.' && Deck.count(id) === n0;
    }
    return out;
  }, { SUMMONERS });
  ck('noGroundKeepsEverySummoningCard', Object.values(r.noGround).every(Boolean), JSON.stringify(r.noGround));
  ck('noHallKeepsEverySummoningCard', Object.values(r.noHall).every(Boolean), JSON.stringify(r.noHall));
}

// ---------------- 2. THE NUMBERS ----------------
{
  const r = await p.evaluate(() => {
    const out = {};
    const kinds = (id, setup) => { __ar.fresh('army-n-' + id); __ar.flat(); if (setup) setup(); const x = __ar.play(id); return { ok: x.r.ok, k: __ar.kinds(x.units), units: x.units, r: x.r }; };
    out.hands = kinds('willing_hands').k;
    // the War Band, by the best FINISHED barracks
    const bar = (lv, extra) => () => {
      if (lv) { const bb = __ar.bld('P', 'barracks', 14, 8); bb.level = lv; }
      if (extra) extra();
    };
    out.band = {
      none: kinds('war_band').k,
      l1: kinds('war_band', bar(1)).k,
      l2: kinds('war_band', bar(2)).k,
      l3: kinds('war_band', bar(3)).k,
      // a level-3 SITE still being raised is no barracks yet
      site: kinds('war_band', bar(1, () => { const s = Bld.place('P', 'barracks', 18, 8, { free: true }); s.level = 3; Bld._block = null; })).k,
      // a level-2 hall mid-upgrade still trains at level 2
      upgrading: kinds('war_band', bar(2, () => { const bb = S.buildings.find(z => z.key === 'barracks'); bb.upgrading = 3; })).k,
    };
    out.bandMsg = kinds('war_band', bar(2)).r.msg;
    const wolves = kinds('hunters_pack');
    out.wolves = wolves.units.map(u => [u.kind, u.owner, u.hp, u.maxhp, u.atk, u.speed, !!u.warWolf].join(':'));
    out.wolfFaster = wolves.units.every(u => u.speed > CFG.UNITS.defender.speed);
    // the CONTROL: opts.scale moves health and attack together — 70 health
    // that way is not 10 attack
    out.scaled = Math.round(CFG.UNITS.wolf.atk * 70 / CFG.UNITS.wolf.hp);
    out.legion = kinds('iron_legion').k;
    out.siege = kinds('siege_train').k;
    out.marches = kinds('legion_marches').k;
    out.fireArcher = CFG.UNITS.marksman.name;
    out.battery = kinds('trebuchet_battery').k;
    const host = kinds('ancestors_host');
    out.host = host.k;
    out.spectral = host.units.every(u => u.spectral === true);
    out.hostDays = +(Deck.timed('ancestors_host').until - Deck.now()).toFixed(6);
    return out;
  });
  const five = k => Array(5).fill(k).join(',');
  ck('willingHandsIsThreeVillagers', r.hands === 'villager,villager,villager', r.hands);
  const bd = r.band;
  ck('theWarBandIsTheBestFinishedBarracksInfantry', bd.none === five('defender') && bd.l1 === five('defender') && bd.l2 === five('axeman') &&
    bd.l3 === five('elite') && bd.site === five('defender') && bd.upgrading === five('axeman') && /five Axemen/.test(r.bandMsg),
    `none ${bd.none.split(',')[0]}, Lv1 ${bd.l1.split(',')[0]}, Lv2 ${bd.l2.split(',')[0]}, Lv3 ${bd.l3.split(',')[0]}, a Lv3 site ${bd.site.split(',')[0]}, a Lv2 upgrading ${bd.upgrading.split(',')[0]}; "${r.bandMsg}"`);
  ck('theHuntersPackIsThreeWarWolvesAt70And10', r.wolves.length === 3 && r.wolves.every(w => w === 'wolf:P:70:70:10:3.4:true') && r.wolfFaster && r.scaled !== 10,
    `${r.wolves.join(' | ')}; faster than a defender ${r.wolfFaster}; scale alone would give ${r.scaled} attack`);
  ck('theIronLegionIsSixChampions', r.legion === Array(6).fill('elite').join(','), r.legion);
  ck('theSiegeTrainIsACatapultAndABallista', r.siege === 'ballista,catapult', r.siege);
  ck('theLegionIsFiveFourAndThree', r.marches === 'elite,elite,elite,elite,elite,lancer,lancer,lancer,marksman,marksman,marksman,marksman' && r.fireArcher === 'Fire Archer',
    `${r.marches} (marksman = "${r.fireArcher}")`);
  ck('theBatteryIsTwoTrebuchetsAndATower', r.battery === 'siegetower,trebuchet,trebuchet', r.battery);
  ck('theHostIsFifteenSpectralChampionsForSixDays', r.host === Array(15).fill('elite').join(',') && r.spectral && r.hostDays === 6,
    `${r.host.split(',').length} ${r.host.split(',')[0]}, spectral ${r.spectral}, ${r.hostDays} days`);
}
{
  // the approved texts, word for word — a wording change is a ruling, reported
  const r = await p.evaluate(({ ARMY }) => Object.fromEntries(ARMY.map(id => [id, Deck.card(id).text])), { ARMY });
  const want = {
    willing_hands: '+3 villagers at your Town Center. They may take you over the population cap; training waits until there is room again.',
    war_band: 'Five soldiers of your best infantry rank march out of your Town Center: Defenders, Axemen or Bronze Champions, by your best finished Barracks (Defenders with none).',
    hunters_pack: 'Three war-wolves join you at your Town Center: 70 health, 10 attack, fast. They fight beside you, stay near home, need no roof and eat nothing.',
    iron_legion: 'Six Bronze Champions march out of your Town Center.',
    siege_train: 'A Catapult and a Ballista roll out of your Town Center.',
    veterans: 'Every land soldier you have rises one rank. Base and second-rank soldiers become their hall’s champion (Bronze Champion, Fire Archer, Lancer; a Catapult becomes a Trebuchet). Champions and other engines become veterans: +25% health and attack.',
    legion_marches: 'Twelve elite soldiers march out of your Town Center: 5 Bronze Champions, 4 Fire Archers and 3 Lancers.',
    trebuchet_battery: 'Two Trebuchets and a Siege Tower roll out of your Town Center.',
    ancestors_host: 'Fifteen spectral Bronze Champions rise at your Town Center and fight for you for 6 days, then fade. They eat nothing and need no roof.',
  };
  const bad = Object.keys(want).filter(k => r[k] !== want[k]);
  ck('everyCardsTextIsTheApprovedText', !bad.length, bad.length ? 'changed: ' + bad.join(', ') : 'nine texts, word for word');
}

// ---------------- 3. POPULATION AND FOOD ----------------
{
  const r = await p.evaluate(() => {
    const out = {};
    __ar.fresh('army-pop'); __ar.flat();
    const tc = Bld.tcOf('P');
    // the hall's CEILING: a level-1 hall can never house more than 20,
    // however many houses stand (CFG.TC_POP_CAP) — fill it to the brim
    for (let i = 0; i < 6; i++) __ar.bld('P', 'house', 2 + i, 20);
    while (Units.popUsed('P') < Bld.popCap('P')) __ar.unit('villager', 'P', 4.5, 16.5);
    out.cap = Bld.popCap('P'); out.ceiling = CFG.TC_POP_CAP[0];
    const pop0 = Units.popUsed('P'), eat0 = Units.foodUpkeep('P');
    const lg = __ar.play('legion_marches');
    out.legion = { ok: lg.r.ok, pop: Units.popUsed('P') - pop0, eat: +(Units.foodUpkeep('P') - eat0).toFixed(6) };
    const F = CFG.FOOD_UPKEEP;
    out.legionEatWant = 5 * F.military + 4 * F.military + 3 * F.cavalry;
    // training waits: the yards refuse while the town stands over its cap…
    const bk = __ar.bld('P', 'barracks', 14, 8);
    S.res.food = S.res.wood = S.res.gold = 9999;
    out.waits = Bld.canTrain(bk, 'defender').why;
    // …and Willing Hands' own words hold at the ceiling: room again, training again
    const hands = __ar.play('willing_hands');
    out.handsOver = Units.popUsed('P') - out.cap;
    for (const u of lg.units.concat(hands.units)) Units.despawn(u);
    for (const u of S.units.filter(u => u.owner === 'P' && u.kind === 'villager').slice(0, 1)) Units.despawn(u);
    out.room = Bld.canTrain(bk, 'defender').ok;
    // the war-wolves and the host neither count nor eat
    const p1 = Units.popUsed('P'), e1 = Units.foodUpkeep('P');
    const pack = __ar.play('hunters_pack'), host = __ar.play('ancestors_host');
    out.beasts = { pop: Units.popUsed('P') - p1, eat: Units.foodUpkeep('P') - e1, n: pack.units.length + host.units.length };
    // …a ghost below deck included (a transport's cargo is counted by hand)
    const raft = __ar.unit('transport', 'P', 2.5, 2.5);
    const ghost = host.units[0];
    S.units.splice(S.units.indexOf(ghost), 1); raft.cargo = [ghost];
    out.cargo = { pop: Units.popUsed('P') - p1, eat: +(Units.foodUpkeep('P') - e1).toFixed(6), raft: 1, raftEat: CFG.FOOD_UPKEEP.boat };
    // the naive count — cargo.length — would have counted the ghost
    out.naiveCargo = raft.cargo.length;
    // THE GREATEST TRIBE is the population, never its beasts and ghosts
    S.stats.peakPop = 0;
    G.dayTick();
    out.peak = S.stats.peakPop; out.popNow = Units.popUsed('P');
    out.allP = S.units.filter(u => u.owner === 'P').length + S.garrison.length;
    return out;
  });
  ck('theSoldiersCountAndEatPastTheCeiling', r.cap === r.ceiling && r.legion.ok && r.legion.pop === 12 && r.legion.eat === r.legionEatWant,
    `cap ${r.cap} (the Lv 1 ceiling ${r.ceiling}); the legion +${r.legion.pop} heads, +${r.legion.eat} food a day (want ${r.legionEatWant})`);
  ck('andTrainingWaitsUntilThereIsRoom', /Population cap/.test(r.waits) && r.handsOver === 15 && r.room,
    `over the cap the yards say "${r.waits}"; three more hands take it ${r.handsOver} over; room again → training ${r.room}`);
  ck('wolvesAndGhostsTakeNoPlaceAndEatNothing', r.beasts.n === 18 && r.beasts.pop === 0 && r.beasts.eat === 0,
    `${r.beasts.n} of them: +${r.beasts.pop} heads, +${r.beasts.eat} food`);
  ck('aGhostBelowDeckToo', r.cargo.pop === 1 && r.cargo.eat === r.cargo.raftEat && r.naiveCargo === 1,
    `a raft carrying a ghost: +${r.cargo.pop} head (the hull), +${r.cargo.eat} food (the hull's own ${r.cargo.raftEat}); cargo.length alone would say ${r.naiveCargo} more`);
  ck('theGreatestTribeIsItsPopulation', r.peak === r.popNow && r.allP > r.popNow,
    `peakPop ${r.peak} = popUsed ${r.popNow}; every P unit would have said ${r.allP}`);
}

// ---------------- 4. THE WAR-WOLVES ----------------
{
  const r = await p.evaluate(() => {
    const out = {};
    __ar.fresh('army-wolf'); __ar.flat();
    const tc = Bld.tcOf('P'), hx = Bld.cx(tc), hy = Bld.cy(tc);
    const { units: pack } = __ar.play('hunters_pack');
    __ar.sim(4);
    const w = pack[0];
    out.dens = pack.every(u => u.den && (u.x | 0) === u.den.x && (u.y | 0) === u.den.y);
    // YOURS: your soldiers and towers never take it for a foe; it is no game
    const sol = __ar.unit('defender', 'P', w.x + 1, w.y);
    const tw = __ar.bld('P', 'tower', tc.x + 3, tc.y - 2);
    out.friend = !Combat.hostileUnits(sol, w) && !Combat.hostileToBld(tw, w);
    const wild = __ar.unit('wolf', 'W', w.x + 2, w.y);
    out.wildIgnores = (() => { Combat.acquire(); return wild.tUnit !== w.id; })();
    Units.despawn(wild); Units.despawn(sol);
    // FOES NEAR THE HALL: a raider within its nose and inside home ground
    const near = __ar.unit('raider', 'R', w.x + 3, w.y); near.hostileTo = 'P';
    for (const u of pack) { u.tUnit = 0; u.task = null; u.path = null; }
    Combat.acquire();
    out.goesFor = w.tUnit === near.id;
    Units.despawn(near);
    // …but not one past home ground, however near its nose
    for (const u of pack) { u.tUnit = 0; u.task = null; u.path = null; u.x = hx + 9.5; u.y = hy; }
    const past = __ar.unit('raider', 'R', hx + 13, hy); past.hostileTo = 'P';
    Combat.acquire();
    out.pastHome = { d: +Math.hypot(past.x - hx, past.y - hy).toFixed(2), took: pack.some(u => u.tUnit === past.id) };
    Units.despawn(past);
    // THE LEASH: a runner dragged past the edge of home is let go, and the
    // wolf trots back to its place. The CONTROL: the Houndmaster's kind of
    // beast (no war-wolf mark) chases on.
    const runner = __ar.unit('raider', 'R', hx + 15, hy); runner.hostileTo = 'P';
    const hound = __ar.unit('wolf', 'P', hx + 13.5, hy + 1);
    w.x = hx + 13.5; w.y = hy; w.tUnit = runner.id; w.task = null;
    hound.tUnit = runner.id;
    Combat.update(0.05);
    out.leash = { let: w.tUnit === 0, home: !!(w.task && w.task.home && w.task.x === w.den.x && w.task.y === w.den.y), hound: hound.tUnit === runner.id };
    Units.despawn(runner); Units.despawn(hound);
    // IT STRIKES BACK — and the Houndmaster's beast never did
    for (const u of pack) { u.tUnit = 0; u.task = null; u.path = null; u.x = u.den.x + 0.5; u.y = u.den.y + 0.5; }
    const biter = __ar.unit('raider', 'R', w.x + 1, w.y); biter.hostileTo = 'P';
    const hound2 = __ar.unit('wolf', 'P', w.x - 1, w.y);
    Units.damage(w, 3, biter.id, 'R'); Units.damage(hound2, 3, biter.id, 'R');
    out.strikes = { wolf: w.tUnit === biter.id, hound: hound2.tUnit === biter.id };
    // …AND COMES HOME AFTER THE FIGHT (the death cleanup sends it)
    w.x = w.den.x + 3.5; w.y = w.den.y + 0.5;
    Units.damage(biter, 999, w.id, 'P');
    out.after = { home: !!(w.task && w.task.type === 'move' && w.task.home), tUnit: w.tUnit };
    hound2.tUnit = biter.id;   // the hound's mark on a body already gone: it stays where it stood
    // AN ORDER IS OBEYED, then home: walked out past home ground it goes…
    const far = { x: (hx + 16) | 0, y: hy | 0 };
    Units.moveTo(w, far.x, far.y);
    Combat.acquire();
    out.obeys = w.task && w.task.type === 'move' && !w.task.home && w.task.x === far.x;
    w.x = far.x + 0.5; w.y = far.y + 0.5; w.task = null; w.path = null;
    Combat.acquire();
    out.thenHome = !!(w.task && w.task.home);
    // IT IS NO GAME: a war-wolf killed is a casualty, not meat
    const food0 = S.res.food, corpses0 = (S.corpses || []).length, hunted0 = Object.keys(S.map.hunted || {}).length;
    const killer = __ar.unit('raider', 'R', w.x + 1, w.y); killer.hostileTo = 'P';
    Units.damage(w, 999, killer.id, 'R');
    out.notGame = { food: S.res.food - food0, corpses: (S.corpses || []).length - corpses0, hunted: Object.keys(S.map.hunted || {}).length - hunted0, log: S.log[0].msg };
    return out;
  });
  ck('aWarWolfIsYoursNotAFoe', r.friend && r.wildIgnores && r.dens, `your soldiers and towers: no foe ${r.friend}; a wild wolf leaves it be ${r.wildIgnores}; home is the slot its march ended on ${r.dens}`);
  ck('itGoesForAFoeNearTheHall', r.goesFor && !r.pastHome.took, `near: ${r.goesFor}; one ${r.pastHome.d} tiles out (past home, in its nose): taken ${r.pastHome.took}`);
  ck('itLetsARunnerGoAtTheEdgeOfHome', r.leash.let && r.leash.home && r.leash.hound,
    `let go ${r.leash.let}, trotting home ${r.leash.home}; the Houndmaster's beast still chasing ${r.leash.hound}`);
  ck('itStrikesBack', r.strikes.wolf && !r.strikes.hound, `the war-wolf ${r.strikes.wolf}, the Houndmaster's beast ${r.strikes.hound}`);
  ck('andComesHomeAfterTheFight', r.after.home && r.after.tUnit === 0, JSON.stringify(r.after));
  ck('anOrderIsObeyedThenHome', r.obeys && r.thenHome, `walked out past home: obeyed ${r.obeys}; home once there ${r.thenHome}`);
  ck('aWarWolfIsNoGame', r.notGame.food === 0 && r.notGame.corpses === 0 && r.notGame.hunted === 0 && /^War-wolf was killed/.test(r.notGame.log),
    `+${r.notGame.food} food, ${r.notGame.corpses} corpses, ${r.notGame.hunted} hunting grounds; "${r.notGame.log}"`);
}
{
  const r = await p.evaluate(() => {
    const out = {};
    // THE TRUCE: on Calm the pack lets a rival soldier walk past the hall
    __ar.fresh('army-wolf-calm', 'calm'); __ar.flat();
    const { units: pack } = __ar.play('hunters_pack');
    const tc = Bld.tcOf('P');
    const a = __ar.unit('defender', 'A', pack[0].x + 2, pack[0].y);
    for (const u of pack) { u.task = null; u.path = null; }
    Combat.acquire();
    out.peace = S.peace && !pack.some(u => u.tUnit === a.id);
    // THE DYE: a ring of the tribe's colour at its feet (drawn, measured)
    const cv = document.createElement('canvas'); cv.width = cv.height = 40;
    const g = cv.getContext('2d');
    Deck.drawCollar(g, pack[0], 4, 4, 32);
    const dye = Sprites.tunicCol[G.tunicOf('P')].body;
    const want = [1, 3, 5].map(i => parseInt(dye.slice(i, i + 2), 16));
    const d = g.getImageData(0, 0, 40, 40).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] && Math.abs(d[i] - want[0]) + Math.abs(d[i + 1] - want[1]) + Math.abs(d[i + 2] - want[2]) < 6) n++;
    out.dye = n;
    out.named = Deck.unitName(pack[0]) === 'War-wolf' && !!Deck.unitHint(pack[0]) && Deck.unitName(a) === null;
    return out;
  });
  ck('thePackKeepsTheTruce', r.peace);
  ck('andWearsTheTribesDye', r.dye >= 12 && r.named, `${r.dye} dyed pixels in the ring; named a War-wolf with its own hint ${r.named}`);
}

// ---------------- 5. VETERANS ----------------
{
  const r = await p.evaluate(() => {
    const out = {};
    __ar.fresh('army-vet'); __ar.flat();
    const tc = Bld.tcOf('P');
    const LAND = ['defender', 'axeman', 'archer', 'longbow', 'rider', 'horsearcher', 'catapult',
      'elite', 'marksman', 'lancer', 'ballista', 'siegetower', 'trebuchet'];
    const us = LAND.map((k, i) => __ar.unit(k, 'P', 3.5 + (i % 6) * 1.5, 14.5 + ((i / 6) | 0) * 1.5));
    const before = us.map(u => ({ kind: u.kind, maxhp: u.maxhp, atk: u.atk }));
    us[0].hp = 30;   // a defender at half strength
    const boat = __ar.unit('fireship', 'P', 1.5, 1.5);
    const vill = __ar.unit('villager', 'P', 2.5, 12.5), sap = __ar.unit('sapper', 'P', 3.5, 12.5);
    const pack = __ar.play('hunters_pack').units;
    // a soldier BELOW DECK: in its hull's cargo, never in S.units
    const raft = __ar.unit('transport', 'P', 1.5, 3.5);
    const deck = __ar.unit('rider', 'P', 1.5, 4.5);
    S.units.splice(S.units.indexOf(deck), 1); raft.cargo = [deck];
    out.naiveSees = S.units.filter(u => u.owner === 'P' && Units.isMilitary(u) && !Units.isNaval(u)).includes(deck);
    // the panel names the unit's rank: select the defender, then raise it
    Screens.show('playing');
    UI.select('unit', us[0].id); UI.renderPanel();
    const title0 = (document.querySelector('#panel .ptitle') || {}).textContent || '';
    const rng = S.rngState;
    const play = Deck.play('veterans');
    out.play = play.ok; out.msg = play.msg;
    const title1 = (document.querySelector('#panel .ptitle') || {}).textContent || '';
    out.titles = [title0.trim(), title1.trim()];
    out.rows = us.map((u, i) => [before[i].kind, u.kind, u.maxhp, +u.atk.toFixed(4), u.vet || 0]);
    out.want = before.map(b0 => {
      const to = Deck.RANK[b0.kind];
      if (to) return [b0.kind, to, CFG.UNITS[to].hp, CFG.UNITS[to].atk, 0];
      return [b0.kind, b0.kind, Math.round(b0.maxhp * 1.25), +(b0.atk * 1.25).toFixed(4), 1.25];
    });
    out.halfHp = us[0].hp;
    out.untouched = boat.kind === 'fireship' && !boat.vet && vill.kind === 'villager' && sap.kind === 'sapper' &&
      pack.every(w => w.kind === 'wolf' && !w.vet && w.atk === 10);
    out.deck = [deck.kind, deck.maxhp]; out.lancerHp = CFG.UNITS.lancer.hp;
    out.rng = S.rngState === rng;
    // a veteran never stacks: a second card raises the champions it made
    // and leaves the veterans where they are
    const maxhp1 = us.map(u => u.maxhp);
    Deck.play('veterans');
    out.second = us.map((u, i) => [u.kind, u.maxhp, maxhp1[i], u.vet || 0]);
    // …and a third has nobody left to raise
    out.allVets = Deck.play('veterans');
    __ar.fresh('army-vet-none'); __ar.flat();
    out.none = Deck.play('veterans');
    return out;
  });
  const rowsOk = r.rows.every((row, i) => JSON.stringify(row) === JSON.stringify(r.want[i]));
  ck('everyLandRankRisesOne', r.play && rowsOk,
    rowsOk ? r.rows.map(x => x[0] + '→' + x[1] + (x[4] ? ' (veteran ' + x[2] + '/' + x[3] + ')' : '')).join(', ') : JSON.stringify({ got: r.rows, want: r.want }));
  ck('healthStaysInProportion', r.halfHp === Math.round(0.5 * 125), `a defender at 30/60 is a champion at ${r.halfHp}/125`);
  ck('hullsHandsBeastsAreNotSoldiers', r.untouched);
  ck('theSoldiersBelowDeckRiseToo', !r.naiveSees && r.deck[0] === 'lancer' && r.deck[1] === r.lancerHp,
    `a rider in a raft's cargo (no S.units pass sees it: ${!r.naiveSees}) is a ${r.deck[0]} at ${r.deck[1]}`);
  const second = r.second.every(([k, hp, hp1, vet]) => vet === 1.25 && (k === 'elite' || k === 'marksman' || k === 'lancer' || k === 'trebuchet' || k === 'ballista' || k === 'siegetower'));
  const champsRose = r.second.slice(0, 7).every(([k, hp, hp1, vet]) => hp === Math.round(hp1 * 1.25));
  const vetsStayed = r.second.slice(7).every(([k, hp, hp1]) => hp === hp1);
  ck('aVeteranNeverStacks', second && champsRose && vetsStayed && !r.allVets.ok && r.allVets.why === 'Every soldier you have is already a veteran.',
    `second card: the made champions +25% ${champsRose}, the veterans unmoved ${vetsStayed}; third: "${r.allVets.why}"`);
  ck('noSoldierNoCard', !r.none.ok && r.none.why === 'You have no land soldier to raise.', r.none.why);
  ck('thePanelNamesTheNewRank', /Defender/.test(r.titles[0]) && /Bronze Champion/.test(r.titles[1]), r.titles.join(' → '));
  ck('andVeteransDrawNoRng', r.rng && /rise a rank/.test(r.msg), r.msg);
}
{
  const r = await p.evaluate(() => {
    const out = {};
    __ar.fresh('army-vet2'); __ar.flat();
    const tc = Bld.tcOf('P');
    // THE ORIGIN CARD AND THE SKY-IRON CARRY OVER into the new rank
    S.boons.P = { train: { hpMult: 1.2, costMult: 1 }, cav: { mult: 1.08 } };
    S.starfall = { avail: false, done: true, phase: null, iron: { P: 1, A: 0 }, x: -1, y: -1 };
    const d = Units.spawn('defender', 'P', 4, 14);        // takes the last blade: atk 9
    const rd = Units.spawn('rider', 'P', 6, 14);
    Deck.play('veterans');
    out.d = [d.kind, d.maxhp, d.atk, !!d.skyIron];
    out.dWant = ['elite', Math.round(CFG.UNITS.elite.hp * 1.2), CFG.UNITS.elite.atk + 1, true];
    out.rd = [rd.kind, rd.speed];
    out.rdWant = ['lancer', Math.round(CFG.UNITS.lancer.speed * 1.08 * 100) / 100];
    // A VETERAN ENGINE throws its stone a quarter harder
    S.boons.P = {};
    const hut = __ar.bld('A', 'house', 20, 8, 99999);
    const shot = (vet) => {
      Combat.projectiles.length = 0;
      const t = __ar.unit('trebuchet', 'P', 14.5, 8.5);
      if (vet) Deck.veteran(t);
      t.task = { type: 'attack' }; t.tBld = hut.id; t.cd = 0;
      Combat.update(0.01);
      const pj = Combat.projectiles.find(q => q.tgt && q.tgt.id === hut.id);
      Units.despawn(t);
      return pj ? pj.tgt.dmg : null;
    };
    out.stone = [shot(false), shot(true)]; out.trebAtk = CFG.UNITS.trebuchet.bldAtk;
    // THE PROMOTED CATAPULT CAN BE HEALED: the trebuchet has a price now
    const c = __ar.unit('catapult', 'P', 9.5, 11.5);
    Deck.play('veterans');
    c.hp = Math.round(c.maxhp / 2);
    out.heal = { kind: c.kind, price: CFG.HEAL_FOOD.trebuchet, cost: UI.healCost(c) };
    return out;
  });
  ck('theOriginCardAndTheSkyIronCarryOver', JSON.stringify(r.d) === JSON.stringify(r.dWant) && JSON.stringify(r.rd) === JSON.stringify(r.rdWant),
    `defender → ${r.d.join('/')}; rider → ${r.rd.join('/')}`);
  ck('aVeteranEngineThrowsAQuarterHarder', r.stone[0] === r.trebAtk && r.stone[1] === Math.round(r.trebAtk * 1.25),
    `a trebuchet's stone ${r.stone[0]} → a veteran's ${r.stone[1]}`);
  ck('aPromotedCatapultCanBeHealed', r.heal.kind === 'trebuchet' && r.heal.price > 0 && r.heal.cost > 0,
    `${r.heal.kind}: heal price ${r.heal.price}, at half strength ${r.heal.cost} food`);
}

// ---------------- 6. THE ANCESTORS' HOST ----------------
{
  const r = await p.evaluate(() => {
    const out = {};
    __ar.fresh('army-host'); __ar.flat();
    const tc = Bld.tcOf('P');
    const { units: host } = __ar.play('ancestors_host');
    // A FAMINE NEVER TAKES A GHOST: the naive pick (first of the hungriest
    // rank) would walk a ghost off; the defender goes instead
    const def = __ar.unit('defender', 'P', 3.5, 16.5);
    const rank = u => (u.kind === 'rider' || u.kind === 'horsearcher' || u.kind === 'lancer') ? 3 : (Units.isSiege(u) || u.kind === 'ballista') ? 2 : Units.isMilitary(u) ? 1 : 0;
    let naive = null, best = 0;
    for (const u of S.units) if (u.owner === 'P' && rank(u) > best) { best = rank(u); naive = u; }
    out.naiveGhost = !!(naive && naive.spectral);
    S.res.food = 0;
    out.desert = [Units.desertHungry('P'), Units.desertHungry('P')];
    out.defGone = !S.units.includes(def) && host.every(u => S.units.includes(u));
    // NO HEAL FOR A GHOST — a heal is paid in food, and a ghost eats nothing
    Screens.show('playing');
    host[0].hp = 40;
    UI.select('unit', host[0].id); UI.renderPanel();
    out.ghostHeal = !!document.querySelector('#panel [data-act="heal"]');
    out.ghostTitle = ((document.querySelector('#panel .ptitle') || {}).textContent || '').trim();
    const d2 = __ar.unit('defender', 'P', Bld.cx(tc) + 1, Bld.cy(tc) + 2);
    d2.hp = 20; S.res.food = 500;
    UI.select('unit', d2.id); UI.renderPanel();
    out.defHeal = !!document.querySelector('#panel [data-act="heal"]');
    UI.deselect();
    // NO ALARM WHEN ONE FALLS; its kills are kills
    const raider = __ar.unit('raider', 'R', host[1].x + 1, host[1].y); raider.hostileTo = 'P';
    const k0 = S.stats.kills;
    Units.damage(raider, 999, host[1].id, 'P');
    out.kills = S.stats.kills - k0;
    // (the log is capped at 60 lines: what is new is what stands above the old top)
    const since = top => { const i = S.log.indexOf(top); return S.log.slice(0, i < 0 ? S.log.length : i).map(l => l.msg); };
    const raider2 = __ar.unit('raider', 'R', host[2].x + 1, host[2].y);
    let top = S.log[0];
    Units.damage(host[2], 9999, raider2.id, 'R');
    out.ghostLog = since(top);
    top = S.log[0];
    Units.damage(d2, 9999, raider2.id, 'R');
    out.defLog = since(top);
    // THEY FADE ON THEIR DAY — the one aboard a hull too (Units.despawn
    // cannot find a unit in cargo: the CONTROL shows it)
    const raft = __ar.unit('transport', 'P', 2.5, 2.5);
    const rider = host[3];
    S.units.splice(S.units.indexOf(rider), 1); raft.cargo = [rider];
    Units.despawn(rider);
    out.naiveFade = raft.cargo.includes(rider);
    const living = __ar.unit('elite', 'P', 6.5, 16.5);
    const e = Deck.timed('ancestors_host');
    S.day = Math.floor(e.until) + 0; S.dayT = (e.until - Math.floor(e.until)) * CFG.DAY_MS - 1;
    Deck.tick();
    out.dayBefore = S.units.filter(u => u.spectral).length;
    S.dayT += 2; Deck.tick();
    out.fade = { left: S.units.filter(u => u.spectral).length, cargo: raft.cargo.length, living: S.units.includes(living),
      log: S.log[0].msg, timer: !!Deck.timed('ancestors_host') };
    // A SECOND HOST LENGTHENS THE FIRST
    __ar.fresh('army-host2'); __ar.flat();
    __ar.play('ancestors_host');
    const u1 = Deck.timed('ancestors_host').until;
    const two = __ar.play('ancestors_host');
    out.second = { ok: two.r.ok, ext: +(Deck.timed('ancestors_host').until - u1).toFixed(6), n: S.units.filter(u => u.spectral).length };
    S.day += 13; Deck.tick();
    out.secondFade = S.units.filter(u => u.spectral).length;
    return out;
  });
  ck('aFamineNeverTakesAGhost', r.naiveGhost && r.desert[0] === true && r.desert[1] === false && r.defGone,
    `the naive pick was a ghost ${r.naiveGhost}; the defender walked off ${r.defGone}, then nobody (${r.desert.join('/')})`);
  ck('noHealIsOfferedForAGhost', !r.ghostHeal && r.defHeal && /^Spectral Bronze Champion/.test(r.ghostTitle),
    `a hurt ghost ("${r.ghostTitle}"): heal ${r.ghostHeal}; a hurt defender: heal ${r.defHeal}`);
  ck('noAlarmWhenAGhostFalls', r.ghostLog.length === 0 && r.defLog.some(m => /was killed/.test(m)),
    `a ghost falls: ${r.ghostLog.length} lines; a defender falls: "${r.defLog.join(' / ')}"`);
  ck('theHostsKillsAreKills', r.kills === 1, `kills +${r.kills}`);
  ck('theyFadeOnTheirDayEvenBelowDeck', r.naiveFade && r.dayBefore > 0 && r.fade.left === 0 && r.fade.cargo === 0 && r.fade.living && !r.fade.timer && /fades/.test(r.fade.log),
    `despawn alone leaves the one aboard (${r.naiveFade}); a moment before: ${r.dayBefore} walking; after: ${r.fade.left} walking, ${r.fade.cargo} aboard, the living champion stays ${r.fade.living}; "${r.fade.log}"`);
  ck('aSecondHostLengthensTheFirst', r.second.ok && r.second.ext === 6 && r.second.n === 30 && r.secondFade === 0,
    `+${r.second.ext} days, ${r.second.n} ghosts walking, ${r.secondFade} after`);
}
{
  const r = await p.evaluate(() => {
    const out = {};
    __ar.fresh('army-rise'); __ar.flat();
    const { units: host } = __ar.play('ancestors_host');
    const s = R.cardShows.find(x => x.id === 'ancestors_host' && x.mode === 'rise');
    out.show = !!s;
    const a = host[0], z = host[14];
    out.q0 = [Deck.riseOf(a), Deck.riseOf(z)];
    s.t = s.rise[a.id] + Deck.RISE_S / 2;
    out.qMid = [+Deck.riseOf(a).toFixed(3), Deck.riseOf(z)];
    s.t = 99;
    out.qEnd = [Deck.riseOf(a), Deck.riseOf(z)];
    // drawn: nothing under the ground, the ghost once it has risen
    const img = document.createElement('canvas'); img.width = img.height = 32;
    const ig = img.getContext('2d'); ig.fillStyle = '#806040'; ig.fillRect(8, 4, 16, 26);
    const px = (t) => {
      s.t = t;
      const cv = document.createElement('canvas'); cv.width = cv.height = 48;
      const g = cv.getContext('2d');
      Deck.drawGhost(g, a, img, 8, 8, 32);
      const d = g.getImageData(0, 0, 48, 48).data; let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i]) n++;
      return n;
    };
    out.drawn = [px(0), px(99)];
    return out;
  });
  ck('eachGhostIsUnderTheGroundUntilItsBeat', r.show && r.q0[0] === 0 && r.q0[1] === 0 && r.qMid[0] === 0.5 && r.qMid[1] === 0 && r.qEnd[0] === 1 && r.qEnd[1] === 1 &&
    r.drawn[0] === 0 && r.drawn[1] > 300,
    `climbed at the play ${r.q0.join('/')}, mid-beat ${r.qMid.join('/')}, after ${r.qEnd.join('/')}; pixels drawn ${r.drawn.join(' → ')}`);
}

// ---------------- 7. SAVES ----------------
{
  const r = await p.evaluate(() => {
    const out = {};
    __ar.fresh('army-save'); __ar.flat();
    const lg = __ar.play('legion_marches').units.map(u => u.id);
    const pack = __ar.play('hunters_pack').units.map(u => u.id);
    __ar.unit('defender', 'P', 4.5, 16.5);
    Deck.play('veterans');
    const host = __ar.play('ancestors_host').units.map(u => u.id);
    __ar.sim(0.5);
    const until = Deck.timed('ancestors_host').until;
    G.loadJSON(G.saveJSON());
    S.paused = true;
    const get = id => S.units.find(u => u.id === id);
    out.muster = lg.every(id => get(id) && get(id).task && get(id).task.type === 'muster' && get(id).task.wait > 0);
    out.pack = pack.every(id => { const w = get(id); return w && w.warWolf && w.den && w.hp === 70 && w.atk === 10 && w.speed === 3.4; });
    out.vets = S.units.filter(u => u.vet === 1.25).length;
    out.host = host.every(id => get(id) && get(id).spectral) && Deck.timed('ancestors_host') && Deck.timed('ancestors_host').until === until;
    __ar.sim(3);
    out.marched = lg.every(id => get(id).task && get(id).task.type === 'move');
    S.day = Math.ceil(until) + 1; Deck.tick();
    out.faded = S.units.filter(u => u.spectral).length === 0;
    return out;
  });
  ck('aMusterMidBeatMarchesAfterTheLoad', r.muster && r.marched, `waiting after the load ${r.muster}, marching after ${r.marched}`);
  ck('thePackRemembersHomeAcrossASave', r.pack);
  ck('aVeteranStaysAVeteran', r.vets > 0, `${r.vets} veterans after the load`);
  ck('aHostOnTheMarchRidesTheSave', r.host && r.faded, `ghosts and their day kept ${r.host}; they fade on it after the load ${r.faded}`);
}

// ---------------- 8. NO RNG, NO SCORE, THE TRUCE ----------------
{
  const r = await p.evaluate(({ ARMY }) => {
    const out = { rng: {}, score: {}, peace: {} };
    for (const id of ARMY) {
      __ar.fresh('army-rng-' + id, 'calm'); __ar.flat();
      if (id === 'veterans') __ar.unit('defender', 'P', 4.5, 16.5);
      const rng = S.rngState, sc = Score.compute(false).subtotal, st = JSON.stringify([S.stats.trained, S.stats.built, S.stats.upgrades, S.stats.peakPop]);
      const x = Deck.play(id);
      out.rng[id] = x.ok && S.rngState === rng;
      out.score[id] = Score.compute(false).subtotal === sc && JSON.stringify([S.stats.trained, S.stats.built, S.stats.upgrades, S.stats.peakPop]) === st;
      out.peace[id] = S.peace === true;
    }
    return out;
  }, { ARMY });
  const bad = o => Object.keys(o).filter(k => !o[k]);
  ck('noArmyCardDrawsTheRunsRng', !bad(r.rng).length, bad(r.rng).join(', ') || 'nine plays, S.rngState unmoved');
  ck('playingACardScoresNothing', !bad(r.score).length, bad(r.score).join(', ') || 'subtotal, trained, built, upgrades and peakPop unmoved by the play');
  ck('aSummoningNeverBreaksTheTruce', !bad(r.peace).length, bad(r.peace).join(', ') || 'the Calm peace holds through all nine');
}

// ---------------- 9. THE PICTURE ----------------
{
  const r = await p.evaluate(({ SUMMONERS }) => {
    const out = { threw: [], drawn: {} };
    __ar.fresh('army-draw'); __ar.flat();
    Screens.show('playing');
    const tc = Bld.tcOf('P');
    R.cam.z = 2; R.centerOn(Bld.cx(tc), Bld.cy(tc) + 2);
    for (let i = 0; i < 6; i++) __ar.unit(['defender', 'archer', 'rider', 'catapult', 'elite', 'longbow'][i], 'P', 3.5 + i * 1.5, 15.5);
    const g = R.g;
    const sweep = (id) => {
      const s = R.cardShows.filter(x => x.id === id).pop();
      if (!s) { out.threw.push(id + ': no show'); return; }
      const sh = Deck.FX[id].show, layers = sh.layers || [sh.layer || 'world'];
      let n = 0;
      for (const pp of [0, 0.05, 0.15, 0.3, 0.5, 0.7, 0.9, 0.99]) {
        s.t = pp * s.ms / 1000;
        for (const layer of layers) {
          g.save();
          if (layer === 'world') { const z = R.cam.z * R.dpr; g.setTransform(z, 0, 0, z, -R.cam.x * z, -R.cam.y * z); }
          else g.setTransform(1, 0, 0, 1, 0, 0);
          try { sh.draw.call(Deck.FX[id], g, s, pp, 1 / 30, layer); n++; } catch (e) { out.threw.push(id + '@' + pp + '/' + layer + ': ' + e); }
          g.restore();
        }
      }
      out.drawn[id] = n;
    };
    for (const id of SUMMONERS) { Deck.play(id); sweep(id); }
    Deck.play('veterans'); sweep('veterans');
    // the host's live look and every card person's own look
    try {
      const e = Deck.timed('ancestors_host');
      for (let i = 0; i < 5; i++) { g.save(); Deck.FX.ancestors_host.drawLive(g, e, 1 / 30); g.restore(); }
      for (const u of S.units.filter(u => u.spectral || u.warWolf || u.vet)) {
        const img = R.unitSprite(u);
        g.save(); Deck.drawUnit(g, u, img, u.x * 32 - 16, u.y * 32 - 28, 32); g.restore();
      }
    } catch (e) { out.threw.push('live: ' + e); }
    // …and the host fading, every ghost in its own wisp
    try {
      const e = Deck.timed('ancestors_host'); e.until = Deck.now() - 1e-6;
      R.centerOn(Bld.cx(tc), Bld.cy(tc) + 2);
      Deck.tick();
      sweep('ancestors_host');
      out.fadeShow = R.cardShows.some(s => s.id === 'ancestors_host' && s.mode === 'fade' && s.ghosts.length > 0);
    } catch (e) { out.threw.push('fade: ' + e); }
    // whole frames, everything at once, through the real loop
    let T = performance.now();
    try { for (let i = 0; i < 90; i++) G.frame(T += 33); } catch (e) { out.threw.push('frame: ' + e); }
    out.inS = /cardShows|"ghosts"|"rise"/.test(G.saveJSON());
    // drained: a world with no card playing draws none of it
    for (let i = 0; i < 260; i++) G.frame(T += 33);
    out.drained = R.cardShows.length === 0 && R.summons.length === 0;
    out.voices = ['cardHands', 'cardWarHorn', 'cardHowl', 'cardHooves', 'cardDrums', 'cardRumble', 'cardRanks', 'cardFanfare', 'cardHost', 'cardFade']
      .every(k => typeof Sound._VOICES[k] === 'function' && Sound.GAP[k] > 0);
    return out;
  }, { SUMMONERS });
  const ids = Object.keys(r.drawn);
  ck('everyShowDrawsAtEveryBeat', !r.threw.length && ids.length === 10 && ids.every(k => r.drawn[k] >= 8),
    r.threw.length ? r.threw.slice(0, 3).join(' | ') : ids.map(k => k + ' ' + r.drawn[k]).join(', '));
  ck('theHostFadesInItsOwnWisps', r.fadeShow);
  ck('theShowsAreRenderStateAndDrainAway', !r.inS && r.drained, `in the save ${r.inS}; drained ${r.drained}`);
  ck('everyVoiceIsSynthesized', r.voices && !audioFiles(root).length, `ten voices made of notes and noise; audio files in the repo: ${audioFiles(root).join(', ') || 'none'}`);
}
function audioFiles(dir, out = [], depth = 0) {
  if (depth > 4) return out;
  for (const f of readdirSync(dir)) {
    if (f === 'node_modules' || f.startsWith('.')) continue;
    const full = join(dir, f);
    const st = statSync(full);
    if (st.isDirectory()) audioFiles(full, out, depth + 1);
    else if (/\.(mp3|ogg|wav|m4a|aac|flac|opus)$/i.test(f)) out.push(full);
  }
  return out;
}

for (const [k, v] of Object.entries(res)) console.log((v.startsWith('PASS') ? ' ' : '✗') + ' ' + k + ': ' + v);
if (errs.length) console.log('PAGE ERRORS:', errs.slice(0, 4));
await b.close();
if (fails.length || errs.length) { console.log('FAILURES:', fails.join(', ') || 'pageerrors'); process.exit(1); }
console.log('ALL DECK-ARMY CHECKS PASS');
