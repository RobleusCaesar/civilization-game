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
                       population (popUsed), never its beasts and ghosts — so
                       the day after the legion marches it is twelve larger;
                       and the two switch-off changes pinned as intended: a
                       sapper is not the tribe at its greatest, a trained
                       trebuchet is mended at its price
     THE WAR-WOLVES    yours and nobody's game; go for a foe near the hall
                       and not one past it; let a runner they chose go at the
                       edge of home (the Houndmaster's beast chases forever);
                       strike back, and struck far from home on an errand
                       fight it out (a home-ground leash let go on the first
                       tick) — yet no runner leads one across the map; come
                       home after a fight, or when the mark simply vanishes;
                       an order is obeyed, then home; three wolves on three
                       dens (the muster deals two to a tile); the march out is
                       the pack's own walk; the truce holds; the tribe's dye
     VETERANS          every rank of every land kind, health in proportion,
                       the origin card and the sky-iron carried over, the
                       soldiers below deck too, never stacked, a veteran
                       engine's stone a quarter heavier (at a building and
                       at a bridge), the promoted catapult healable, the
                       panel naming the new rank, the rank worn for good, and
                       the two refusals
     THE HOST          no famine takes a ghost, no Heal offered, no alarm when
                       one falls, its kills are kills, all fade on the day —
                       the ones aboard a hull too — and a second host
                       lengthens the first; each ghost under the ground until
                       its beat in the rising — and, not drawn, not tapped
                       (nor a muster's unit still waiting its flash); no heal
                       ring for a ghost
     SAVES             a muster mid-beat, the pack's home, a veteran and a
                       host on the march all ride a save
     NO RNG / NO SCORE no card draws S.rngState; playing one scores nothing
                       at the play
     THE TRUCE         a summoning never breaks the Calm peace
     THE PICTURE       every show draws at every beat of every layer, the
                       host's live look and every card unit's own look, whole
                       frames run clean, the shows are render state only,
                       every voice is synthesized (no audio file), and nothing
                       is drawn in the black (world shows clipped by the
                       engine, the sky's light by each show)

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
    let gap = 9;
    for (let i = 0; i < units.length; i++) for (let j = i + 1; j < units.length; j++) gap = Math.min(gap, Math.hypot(units[i].x - units[j].x, units[i].y - units[j].y));
    out.gap = gap;
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
    let lg = 9;
    for (let i = 0; i < legion.length; i++) for (let j = i + 1; j < legion.length; j++) lg = Math.min(lg, Math.hypot(legion[i].x - legion[j].x, legion[i].y - legion[j].y));
    out.legionGap = lg;
    return out;
  });
  ck('fifteenStandOnFifteenPlaces', r.yard === 1 && r.n === 15 && r.gap >= 0.97 && r.tiles >= 13 && r.open && r.near <= 6.8,
    `the yards' search: ${r.yard} tile for 15 asks; the host: ${r.n} on their own places, the nearest two ${r.gap.toFixed(2)} tiles apart, on ${r.tiles} tiles, all really open ${r.open}, farthest ${r.near.toFixed(2)} from the door`);
  ck('neverAcrossTheWaterFromTheDoor', r.naiveFar > 0 && r.far === 0 && r.legionGap >= 0.97,
    `a search that asks no road puts ${r.naiveFar} of 15 on the far bank; the legion puts ${r.far} there, the nearest two ${r.legionGap.toFixed(2)} apart`);
}
{
  /* THE FAN (playtest g2/g3/g4: "summons PILE UP and wander off screen"):
     every summoned unit LANDS on its own slot round the hall and is never
     marched to a heap — the War Band's men a tile apart in two ranks, the
     battery's engines a tile and a half from each other AND from the siege
     train already standing there (the probe counted the two trebuchets 0.14
     tiles apart and six pairs under 0.6), a Legion played over a garrison
     clear of the garrison, every slot facing out from the hall — and on the
     player's screen: with the camera on the hall at a phone's zoom, every
     sprite whole between the bars. The CONTROL is the old muster's own end:
     the yards' formation step marches five to one spot and stacks them. */
  const r = await p.evaluate(() => {
    const out = {};
    const pairs = (list, min) => {
      let bad = 0, near = 9;
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const d = Math.hypot(list[i].x - list[j].x, list[i].y - list[j].y);
        near = Math.min(near, d); if (d < min) bad++;
      }
      return { bad, near: +near.toFixed(2) };
    };
    // where each one STANDS once the act is over and the hold has let it go
    // (the old muster's march ended in the heap), and whether its whole
    // sprite is on the open screen between the bars and clear of the minimap
    const whole = u => {
      const TL = CFG.TILE, z = R.cam.z, B = R.unitBox(u);
      const rect = id => { const el = document.getElementById(id); return el && el.offsetParent !== null && el.offsetWidth ? el.getBoundingClientRect() : null; };
      const tb = rect('topbar'), bb = rect('bottombar'), mm = rect('miniWrap'), vw = R.viewW(), vh = R.viewH();
      const sx = (u.x * TL - R.cam.x) * z, foot = (u.y * TL + TL / 2 - CFG.SPRITE_LIFT - R.cam.y) * z, top = foot - B * z, hw = B * z / 2;
      if (sx - hw < 0 || sx + hw > vw || top < (tb ? tb.bottom : 0) || foot > (bb ? bb.top : vh)) return false;
      return !(mm && sx + hw > mm.left && sx - hw < mm.right && top < mm.bottom && foot > mm.top);
    };
    __ar.fresh('army-fan'); __ar.flat();
    Screens.show('playing');
    const tc = Bld.tcOf('P');
    R.cam.z = 1.7; R.centerOn(Bld.cx(tc), Bld.cy(tc) + 0.6);
    // the War Band: five a tile apart, facing out, two ranks
    const wb = __ar.play('war_band').units;
    __ar.sim(5);
    out.wb = pairs(wb, 0.97);
    const ry = [...new Set(wb.map(u => Math.round(Math.hypot(u.x - Bld.cx(tc), u.y - Bld.cy(tc)) * 4) / 4))];
    out.wbRanks = ry.length;
    out.face = wb.every(u => { const f = R._faceMap.get(u), d = f && f.dir; return d && ((u.y > Bld.cy(tc) + 0.5) ? /s/.test(d) : true); });
    out.onScreen = wb.every(whole);
    // the Siege Train, then the Battery: five engines, a tile and a half apart
    for (const u of wb) Units.despawn(u);
    const st = __ar.play('siege_train').units;
    for (const u of st) u.task = null;
    const tb = __ar.play('trebuchet_battery').units;
    __ar.sim(6);
    out.engines = pairs(st.concat(tb), 1.45);
    out.engOn = st.concat(tb).every(whole);
    // a Legion over a garrison standing at the door: clear of it
    __ar.fresh('army-fan2'); __ar.flat();
    const tc2 = Bld.tcOf('P');
    R.cam.z = 1.7; R.centerOn(Bld.cx(tc2), Bld.cy(tc2) + 0.6);
    const gar = [];
    for (let i = 0; i < 6; i++) gar.push(__ar.unit(['defender', 'archer'][i % 2], 'P', tc2.x - 1.5 + i, tc2.y + 3.5));
    const lg = __ar.play('legion_marches').units;
    __ar.sim(6);
    out.legion = pairs(lg, 0.97);
    out.garrison = pairs(lg.concat(gar), 0.6).bad;
    out.lgOn = lg.filter(whole).length;
    // SWIFT RAIDERS (playtest g2 #8): they used to ride out and park at the
    // screen's edge half cut off — now they wheel once round the hall at a
    // gallop and pull up on their places, every one of them whole on the screen
    __ar.fresh('army-fan4'); __ar.flat();
    const tc4 = Bld.tcOf('P');
    R.cam.z = 1.7; R.centerOn(Bld.cx(tc4), Bld.cy(tc4) + 0.6);
    const sr = __ar.play('swift_raiders').units, hx = Bld.cx(tc4), hy = Bld.cy(tc4);
    const sw = sr.map(() => 0), an = sr.map(u => Math.atan2(u.y - hy, u.x - hx));
    for (let i = 0; i < 160; i++) {
      Units.update(0.05);
      sr.forEach((u, k) => { const a = Math.atan2(u.y - hy, u.x - hx); sw[k] += Math.atan2(Math.sin(a - an[k]), Math.cos(a - an[k])); an[k] = a; });
    }
    out.raiders = { sweep: sw.map(s => Math.round(Math.abs(s) * 180 / Math.PI)), on: sr.filter(whole).length, free: sr.every(u => !u.task), apart: pairs(sr, 0.97) };
    // the CONTROL: the yards' formation step, asked for five, marches them to
    // one muster spot — the old muster's end, where the heaps came from
    __ar.fresh('army-fan3'); __ar.flat();
    const tc3 = Bld.tcOf('P'), five = [0, 1, 2, 3, 4].map(i => __ar.unit('trebuchet', 'P', tc3.x + i, tc3.y + 3.5));
    Units.formationMove(five, tc3.x + 1, tc3.y + 5, 'land');
    for (let i = 0; i < 300; i++) Units.update(0.05);
    out.control = pairs(five, 1.45).bad;
    return out;
  });
  ck('everySummonLandsOnItsOwnPlace', r.wb.bad === 0 && r.wbRanks === 2 && r.face && r.onScreen,
    `the War Band: the nearest two ${r.wb.near} apart, in ${r.wbRanks} ranks, facing out ${r.face}, all five whole on the screen ${r.onScreen}`);
  ck('enginesStandATileAndAHalfApart', r.engines.bad === 0 && r.engOn && r.control > 0,
    `the Siege Train then the Battery: the nearest two engines ${r.engines.near} apart (${r.engines.bad} pairs under 1.45), all on the screen ${r.engOn}; the old march to one spot: ${r.control} pairs under 1.45`);
  ck('theRaidersWheelRoundTheHallAndPullUpInSight', r.raiders.sweep.every(a => a >= 330) && r.raiders.on === 5 && r.raiders.free && r.raiders.apart.bad === 0,
    `each rider swept ${r.raiders.sweep.join('/')}° round the hall; after it ${r.raiders.on} of 5 whole on the screen, free ${r.raiders.free}, the nearest two ${r.raiders.apart.near} apart`);
  ck('aLegionFormsClearOfTheGarrison', r.legion.bad === 0 && r.garrison === 0 && r.lgOn >= 11,
    `the twelve: the nearest two ${r.legion.near} apart, ${r.garrison} closer than 0.6 to a garrison man, ${r.lgOn} of 12 whole on the screen`);
}
{
  const r = await p.evaluate(() => {
    const out = {};
    __ar.fresh('army-beat'); __ar.flat();
    // STAGGERED: the war band's beams come down one after another (the first
    // once its beam has fallen), each unit unseen until its own lands
    const { units: wb } = __ar.play('war_band');
    const F = Deck.FX.war_band, drop = (Deck.armyFx.BEAM_T || { drop: 0 }).drop;
    out.flashT = R.summons.slice(-5).map(s => +(-s.t).toFixed(3));
    out.flashWant = [0, 1, 2, 3, 4].map(i => +(drop + i * F.STAGGER / 1000).toFixed(3));
    out.flashIds = R.summons.slice(-5).map(s => s.id).join(',') === wb.map(u => u.id).join(',');
    out.hidden = R._unborn ? wb.filter(u => R._unborn.has(u.id)).length : 0;
    // THE HOLD: every one stands where it landed until the last is down and
    // the formation has held its beat — then is simply free, where it formed
    const free = drop + 4 * F.STAGGER / 1000 + F.HOLD;
    out.waits = [...new Set(wb.map(u => u.task && u.task.type === 'muster' && u.task.stay ? u.task.wait.toFixed(3) : 'x'))];
    out.waitWant = free.toFixed(3);
    const at0 = wb.map(u => [u.x, u.y]);
    // the picture's clock: once every beam has landed nobody is hidden
    const g = R.g; g.save(); R.drawSummons(g, 0.7); g.restore();
    out.allOut = !R._unborn || wb.every(u => !R._unborn.has(u.id));
    __ar.sim(free - 0.25);
    out.held = wb.every(u => u.task && u.task.type === 'muster');
    __ar.sim(0.5);
    out.freed = wb.every(u => !u.task && !Units.moving(u));
    __ar.sim(3);
    out.stayed = wb.every((u, i) => Math.hypot(u.x - at0[i][0], u.y - at0[i][1]) < 0.05);
    // the legion too, all twelve on one beat
    __ar.fresh('army-together'); __ar.flat();
    const { units: lg } = __ar.play('legion_marches');
    const L = Deck.FX.legion_marches, lfree = drop + 11 * L.STAGGER / 1000 + L.HOLD;
    out.together = [...new Set(lg.map(u => u.task && u.task.wait != null ? u.task.wait.toFixed(3) : 'x'))];
    out.togetherWant = lfree.toFixed(3);
    const lg0 = lg.map(u => [u.x, u.y]);
    __ar.sim(lfree - 0.2);
    out.stillHeld = lg.every(u => u.task && u.task.type === 'muster');
    __ar.sim(3.4);
    out.lgStayed = lg.every((u, i) => !u.task && Math.hypot(u.x - lg0[i][0], u.y - lg0[i][1]) < 0.05);
    return out;
  });
  ck('aStaggeredMusterStepsOutOneAtATime', JSON.stringify(r.flashT) === JSON.stringify(r.flashWant) && r.flashIds && r.hidden === 5 && r.allOut,
    `beams land at ${r.flashT.join('/')}s, ${r.hidden} of 5 unseen until their own, all out once landed ${r.allOut}`);
  ck('theyHoldTheirPlacesThenStayWhereTheyFormed', r.waits.length === 1 && r.waits[0] === r.waitWant && r.held && r.freed && r.stayed,
    `every one held until ${r.waits.join('|')}s (want ${r.waitWant}): held ${r.held}, free after it ${r.freed}, still on its place 3s later ${r.stayed}`);
  ck('theLegionHoldsItsBeatAsOne', r.together.length === 1 && r.together[0] === r.togetherWant && r.stillHeld && r.lgStayed,
    `every one held until ${r.together.join('|')}s (want ${r.togetherWant}); held to the end ${r.stillHeld}; free and unmoved after ${r.lgStayed}`);
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
  /* THE PRICE IS ON THE CARD (playtest g2 #4, g3 #5): every card that brings
     soldiers who count and eat says so in as many words — the Iron Legion on
     day one took a town from 3/5 and −3 food a day to 9/5 and −12, the Legion
     to 16/5 and −25 with desertions by day 19, and not one word on the card
     had warned of it. The wolves and the ghosts already say they eat nothing. */
  const EATS = ' They eat like soldiers and count against your population.', CREWS = ' Their crews eat like soldiers and count against your population.';
  const want = {
    willing_hands: '+3 villagers at your Town Center. They may take you over the population cap; training waits until there is room again.',
    war_band: 'Five soldiers of your best infantry rank march out of your Town Center: Defenders, Axemen or Bronze Champions, by your best finished Barracks (Defenders with none).' + EATS,
    hunters_pack: 'Three war-wolves join you at your Town Center: 70 health, 10 attack, fast. They fight beside you, stay near home, need no roof and eat nothing.',
    iron_legion: 'Six Bronze Champions march out of your Town Center.' + EATS,
    siege_train: 'A Catapult and a Ballista roll out of your Town Center.' + CREWS,
    veterans: 'Every land soldier you have rises one rank. Base and second-rank soldiers become their hall’s champion (Bronze Champion, Fire Archer, Lancer; a Catapult becomes a Trebuchet). Champions and other engines become veterans: +25% health and attack.',
    legion_marches: 'Twelve elite soldiers march out of your Town Center: 5 Bronze Champions, 4 Fire Archers and 3 Lancers.' + EATS,
    trebuchet_battery: 'Two Trebuchets and a Siege Tower roll out of your Town Center.' + CREWS,
    ancestors_host: 'Fifteen spectral Bronze Champions rise at your Town Center and fight for you for 6 days, then fade. They eat nothing and need no roof.',
  };
  const bad = Object.keys(want).filter(k => r[k] !== want[k]);
  ck('everyCardsTextIsTheApprovedText', !bad.length, bad.length ? 'changed: ' + bad.join(', ') : 'nine texts, word for word');
  const raiders = await p.evaluate(() => Deck.card('swift_raiders').text);
  const eaters = { war_band: r.war_band, iron_legion: r.iron_legion, siege_train: r.siege_train, legion_marches: r.legion_marches, trebuchet_battery: r.trebuchet_battery, swift_raiders: raiders };
  const silent = Object.keys(eaters).filter(k => !/\beat\b/.test(eaters[k]) || !/population/.test(eaters[k]));
  ck('everySoldierCardSaysTheyEatAndCount', !silent.length,
    silent.length ? 'silent on the larder and the cap: ' + silent.join(', ') : 'six cards that bring soldiers who eat and count say so; the wolves and the ghosts say they eat nothing');
  /* …and the whole text still fits the card's back, at the sheet's smallest
     face (88px, a 320px phone) up to the inspector's: the box clips what
     overflows (overflow: hidden), so an added sentence that pushed the flavor
     line out would fail no other check */
  const fit = await p.evaluate(async () => {
    if (document.fonts) { try { await document.fonts.load('700 10px Cinzel'); await document.fonts.ready; } catch (e) {} }
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:0;top:0;display:flex;flex-wrap:wrap';
    document.body.appendChild(host);
    const bad = [];
    for (const fw of [88, 120, 176, 220]) for (const id of ['war_band', 'swift_raiders', 'iron_legion', 'siege_train', 'legion_marches', 'trebuchet_battery', 'hunters_pack', 'veterans', 'ancestors_host']) {
      const el = Deck.face(id, { w: fw, back: true });
      host.appendChild(el);
      const tx = el.querySelector('.cc-txt');
      if (tx.scrollHeight > tx.clientHeight + 1) bad.push(id + '@' + fw + ' +' + (tx.scrollHeight - tx.clientHeight) + 'px');
    }
    host.remove();
    return bad;
  });
  ck('andEveryArmyCardsTextFitsItsBack', !fit.length, fit.length ? 'clipped: ' + fit.join(', ') : 'nine backs, 88 to 220px wide, every word inside the box');
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
{
  /* TWO DELIBERATE CHANGES TO ORDINARY PLAY, pinned with the switch OFF so
     no sweep reads them as drift: "the tribe at its greatest" is now its
     POPULATION (Units.popUsed), so a sapper no longer counts toward it, and a
     trained Trebuchet can be mended, at CFG.HEAL_FOOD.trebuchet (100) food
     for its whole health — UI.healCost's own ceil(missing share × price). */
  const r = await p.evaluate(() => {
    const out = {};
    CFG.CARDS.ON = false; Deck._dev = false;
    G.newGame('army-switchoff-pop', 'moderate', 'medium'); S.paused = true;
    __ar.flat();
    const tc = Bld.tcOf('P');
    for (let i = 0; i < 3; i++) __ar.unit('villager', 'P', tc.x + i + 0.5, tc.y + 3.5);
    S.res.food = 99999;
    S.stats.peakPop = 0; G.dayTick();
    const base = S.stats.peakPop;
    __ar.unit('sapper', 'P', tc.x + 0.5, tc.y + 4.5);
    S.stats.peakPop = 0; G.dayTick();
    out.sapper = { base, with: S.stats.peakPop, off: !Deck.on() };
    const t = Units.spawn('trebuchet', 'P', tc.x + 3, tc.y + 5);
    t.hp = Math.round(t.maxhp * 0.37);
    out.treb = { cost: UI.healCost(t), want: Math.max(1, Math.ceil((1 - t.hp / t.maxhp) * 100)), price: CFG.HEAL_FOOD.trebuchet };
    /* RULING 5 ON THE NEXT DAY: a card's soldiers ARE population, so the
       day after the Legion marches the tribe at its greatest is twelve
       heads larger (ruling 6's "no points for playing a card" is the PLAY:
       the census they join is the game's own). The wolves and the host are
       not population, so they add nothing, the next day or ever. */
    __ar.fresh('army-nextday-pop'); __ar.flat();
    const tc2 = Bld.tcOf('P');
    for (let i = 0; i < 3; i++) __ar.unit('villager', 'P', tc2.x + i + 0.5, tc2.y + 6.5);
    S.res.food = 99999;
    S.stats.peakPop = 0; G.dayTick();
    const p0 = S.stats.peakPop;
    Deck.play('legion_marches');
    const atPlay = S.stats.peakPop;
    G.dayTick();
    const p1 = S.stats.peakPop;
    Deck.play('ancestors_host'); Deck.play('hunters_pack');
    G.dayTick();
    out.next = { p0, atPlay, legion: p1 - p0, beasts: S.stats.peakPop - p1 };
    return out;
  });
  ck('aSapperIsNotTheTribeAtItsGreatest', r.sapper.off && r.sapper.with === r.sapper.base && r.sapper.base === 3,
    `switch off: three villagers read ${r.sapper.base}; with a sapper beside them ${r.sapper.with}`);
  ck('aTrainedTrebuchetIsMendedAtItsPrice', r.treb.price === 100 && r.treb.cost === r.treb.want,
    `a trebuchet at 37%: ${r.treb.cost} food (ceil of the missing share × ${r.treb.price} = ${r.treb.want})`);
  ck('theLegionIsTheTribeTheNextDay', r.next.atPlay === r.next.p0 && r.next.legion === 12 && r.next.beasts === 0,
    `at the play +${r.next.atPlay - r.next.p0}; the next day the legion +${r.next.legion}; the host and the pack +${r.next.beasts}`);
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
    out.goesFor = w.tUnit === near.id && w.packMark === true;   // a mark the PACK chose, and says so
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
    w.x = hx + 13.5; w.y = hy; w.tUnit = runner.id; w.task = null; w.packMark = true;   // one it chose itself
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
{
  const r = await p.evaluate(() => {
    const out = {};
    __ar.fresh('army-wolf-far'); __ar.flat();
    const tc = Bld.tcOf('P'), hx = Bld.cx(tc), hy = Bld.cy(tc);
    /* A WOLF STRUCK FAR FROM HOME FIGHTS IT OUT. Walked out by the player
       and struck there, it answers and keeps its mark until the foe is down
       — the home-ground leash belongs only to a mark the pack chose. The
       CONTROL is that same leash applied to the struck wolf (packMark set,
       as the first cut treated every mark): it lets go on the first tick. */
    const trial = (naive) => {
      const { units: pack } = __ar.play('hunters_pack');
      const w = pack[0];
      for (const u of pack) if (u !== w) Units.despawn(u);
      const fx = (hx + 16) | 0, fy = hy | 0;
      w.x = fx + 0.5; w.y = fy + 0.5;
      Units.moveTo(w, fx + 1, fy);                                   // a plain walk the player ordered
      const foe = __ar.unit('raider', 'R', w.x + 0.9, w.y, 40); foe.hostileTo = 'P'; foe.tUnit = w.id;
      Units.damage(w, 3, foe.id, 'R');
      if (naive) w.packMark = true;
      const d0 = +Math.hypot(w.x - hx, w.y - hy).toFixed(1);
      let held = true, ticks = 0;
      for (; ticks < 400 && foe.hp > 0 && S.units.includes(foe); ticks++) {
        w.hp = w.maxhp;                                              // the wolf stays up: this measures the leash, not the duel
        if (naive) w.packMark = true;                                // the first cut leashed EVERY mark to home ground
        Units.update(0.05); Combat.update(0.05);
        if (w.tUnit !== foe.id && foe.hp > 0 && S.units.includes(foe)) { held = false; break; }
      }
      const res = { d0, held, killed: !S.units.includes(foe) || foe.hp <= 0, home: !!(w.task && w.task.home), tUnit: w.tUnit };
      Units.despawn(w); if (S.units.includes(foe)) Units.despawn(foe);
      return res;
    };
    out.fight = trial(false);
    out.naive = trial(true);
    /* …and A RUNNER CAN NEVER LEAD IT ACROSS THE MAP: struck, it chases at
       most PACK.leash from where the fight began, then lets go and goes home */
    {
      const { units: pack } = __ar.play('hunters_pack');
      const w = pack[0];
      for (const u of pack) if (u !== w) Units.despawn(u);
      w.x = hx + 0.5; w.y = hy + 3.5; w.task = null; w.path = null;
      const foe = __ar.unit('raider', 'R', w.x + 1, w.y, 999); foe.hostileTo = 'P';
      Units.damage(w, 1, foe.id, 'R');
      Combat.update(0.05);
      const from = w.packFrom && { x: w.packFrom.x, y: w.packFrom.y };
      foe.x = w.x + Deck.PACK.leash + 2;                             // the fight has dragged it far
      w.x = w.x + Deck.PACK.leash + 0.6;
      Combat.update(0.05);
      out.runner = { from: !!from, let: w.tUnit === 0, home: !!(w.task && w.task.home) };
      Units.despawn(w); Units.despawn(foe);
    }
    /* THREE WOLVES, THREE DENS: the muster deals two of a kind to a tile
       (Units.formationMove) — the CONTROL is the same muster asked without
       the card's den rule — and the pack's three places are three tiles,
       none of them under anyone already standing still */
    __ar.fresh('army-wolf-dens'); __ar.flat();
    const raw = Deck.summon([{ kind: 'wolf', n: 3 }], { stagger: 260, hold: 0.3 });
    const slots = raw.units.map(u => u.task.x + ',' + u.task.y);
    out.naiveSlots = new Set(slots).size;
    for (const u of raw.units) Units.despawn(u);
    // …and somebody already standing on the first of those slots
    const [sx0, sy0] = slots[0].split(',').map(Number);
    const v = __ar.unit('villager', 'P', sx0 + 0.5, sy0 + 0.5);
    const { units: pack } = __ar.play('hunters_pack');
    const dens = pack.map(u => u.den.x + ',' + u.den.y);
    out.dens = dens;
    out.distinct = new Set(dens).size === 3;
    out.free = pack.every(u => (u.den.x !== (v.x | 0) || u.den.y !== (v.y | 0)) && Path.passable(u.den.x, u.den.y, 'P') && !Bld.at(u.den.x, u.den.y));
    out.march = pack.every(u => u.task && u.task.type === 'muster' && u.task.x === u.den.x && u.task.y === u.den.y);
    __ar.sim(4);
    out.rest = new Set(pack.map(u => (u.x | 0) + ',' + (u.y | 0))).size === 3 && pack.every(u => (u.x | 0) === u.den.x && (u.y | 0) === u.den.y);
    /* AT HEEL IS THE PACK'S OWN HOLD: each wolf lands at the hall's side and
       is held there for its beat (the 'muster' task's stay), and a foe near
       the hall breaks the hold (a walk the PLAYER orders is obeyed to the
       letter — anOrderIsObeyed) */
    __ar.fresh('army-wolf-march'); __ar.flat();
    const { units: p2 } = __ar.play('hunters_pack');
    const hall = Bld.tcOf('P');
    out.homeFlag = p2.every(u => u.task && u.task.type === 'muster' && Math.hypot(u.x - Bld.cx(hall), u.y - Bld.cy(hall)) < 4.5);
    const intr = __ar.unit('raider', 'R', p2[0].x + 2, p2[0].y, 999); intr.hostileTo = 'P';
    Combat.acquire();
    out.breaks = p2.some(u => u.tUnit === intr.id);
    /* AND A MARK THAT SIMPLY VANISHES (a foe that boards a hull, a despawn)
       sends it home on the very next tick — the !tgt branch, not the death
       cleanup the other checks reach it through */
    const w3 = p2[0];
    w3.tUnit = intr.id; w3.task = null; w3.path = null;
    S.units.splice(S.units.indexOf(intr), 1);
    Combat.update(0.05);
    out.vanish = { tUnit: w3.tUnit, home: !!(w3.task && w3.task.home && w3.task.x === w3.den.x && w3.task.y === w3.den.y) || ((w3.x | 0) === w3.den.x && (w3.y | 0) === w3.den.y && !w3.task) };
    return out;
  });
  ck('aWolfStruckFarFromHomeFightsItOut', r.fight.d0 > 10 && r.fight.held && r.fight.killed && r.fight.home && !r.naive.held,
    `struck ${r.fight.d0} tiles from the hall on a walk: held its mark to the kill ${r.fight.held}/${r.fight.killed}, then home ${r.fight.home}; the home-ground leash on the same mark lets go: ${!r.naive.held}`);
  ck('butARunnerCannotLeadItAcrossTheMap', r.runner.from && r.runner.let && r.runner.home, JSON.stringify(r.runner));
  ck('threeWolvesThreeDens', r.naiveSlots < 3 && r.distinct && r.free && r.march && r.rest,
    `the muster alone deals ${r.naiveSlots} tiles to three; the pack's dens ${r.dens.join(' / ')}, none under a standing villager ${r.free}, marched to ${r.march}, resting there apart ${r.rest}`);
  ck('atHeelIsThePacksOwnHold', r.homeFlag && r.breaks, `every wolf held at heel within 4.5 of the hall's middle ${r.homeFlag}; a foe near the hall breaks the hold ${r.breaks}`);
  ck('aMarkThatVanishesSendsItHome', r.vanish.tUnit === 0 && r.vanish.home, JSON.stringify(r.vanish));
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
  /* THE HOST AND THE PACK ARE NOT THE ARMY: the Ancestors' Host's ghosts
     are Bronze Champions by kind — military to every Units.isMilitary pass —
     and a war-wolf is the player's own; Veterans raises neither, and the
     count it reports is the soldiers it really raised. A host alone is no
     army to raise, so the card is kept. */
  const r = await p.evaluate(() => {
    const out = {};
    __ar.fresh('army-vet-host'); __ar.flat();
    const host = __ar.play('ancestors_host').units, pack = __ar.play('hunters_pack').units;
    out.hostN = host.length; out.packN = pack.length;
    const hp0 = host.map(u => u.maxhp), atk0 = host.map(u => u.atk), wolf0 = pack.map(u => [u.kind, u.maxhp, u.atk]);
    out.alone = Deck.play('veterans');
    const d = __ar.unit('defender', 'P', 4.5, 16.5);
    const play = Deck.play('veterans');
    out.play = play.ok; out.msg = play.msg;
    out.d = d.kind;
    out.ghosts = host.every((u, i) => u.spectral && u.kind === 'elite' && !u.vet && !u.ranked && u.maxhp === hp0[i] && u.atk === atk0[i]);
    out.wolves = pack.every((u, i) => u.warWolf && JSON.stringify([u.kind, u.maxhp, u.atk]) === JSON.stringify(wolf0[i]) && !u.vet && !u.ranked);
    out.lit = (R.cardShows.find(s => s.id === 'veterans') || { lit: [] }).lit.length;
    return out;
  });
  ck('theHostAndThePackAreNotRaised', r.hostN === 15 && r.packN > 0 && r.ghosts && r.wolves && r.d === 'elite' &&
    r.msg === 'Veterans: 1 soldier rise a rank.' && r.lit === 1 && !r.alone.ok && r.alone.why === 'You have no land soldier to raise.',
    `${r.hostN} ghosts untouched ${r.ghosts}, ${r.packN} war-wolves untouched ${r.wolves}; "${r.msg}" (${r.lit} lit); a host alone: "${r.alone.why}"`);
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
    // …at the OTHER siege site too: a rival bridge (combat.js's tBridge)
    (S.bridges || (S.bridges = [])).push({ x: 22, y: 12, owner: 'A', level: 1, dir: 'h', hp: 99999, maxhp: 99999 });
    const cut = (vet) => {
      const br = Bld.bridgeAt(22, 12), hp0 = br.hp;
      const t = __ar.unit('trebuchet', 'P', 16.5, 12.5);
      if (vet) Deck.veteran(t);
      t.tBridge = { x: 22, y: 12 }; t.cd = 0;
      Combat.update(0.01);
      Units.despawn(t);
      return hp0 - br.hp;
    };
    out.bridge = [cut(false), cut(true)];
    // THE PROMOTED CATAPULT CAN BE HEALED: the trebuchet has a price now
    const c = __ar.unit('catapult', 'P', 9.5, 11.5);
    Deck.play('veterans');
    c.hp = Math.round(c.maxhp / 2);
    out.heal = { kind: c.kind, price: CFG.HEAL_FOOD.trebuchet, cost: UI.healCost(c) };
    return out;
  });
  ck('theOriginCardAndTheSkyIronCarryOver', JSON.stringify(r.d) === JSON.stringify(r.dWant) && JSON.stringify(r.rd) === JSON.stringify(r.rdWant),
    `defender → ${r.d.join('/')}; rider → ${r.rd.join('/')}`);
  ck('aVeteranEngineThrowsAQuarterHarder', r.stone[0] === r.trebAtk && r.stone[1] === Math.round(r.trebAtk * 1.25) &&
    r.bridge[0] === r.trebAtk && r.bridge[1] === Math.round(r.trebAtk * 1.25),
    `a trebuchet's stone ${r.stone[0]} → a veteran's ${r.stone[1]}; on a rival bridge ${r.bridge[0]} → ${r.bridge[1]}`);
  ck('aPromotedCatapultCanBeHealed', r.heal.kind === 'trebuchet' && r.heal.price > 0 && r.heal.cost > 0,
    `${r.heal.kind}: heal price ${r.heal.price}, at half strength ${r.heal.cost} food`);
}
{
  /* THE RANK THE CARD GAVE IS WORN FOR GOOD, AND CAN BE READ (judge g3:
     "the promoted army looks identical in a crowd" — two one-pixel chevrons
     sat inside the helmet): a minute after the card a veteran wears a GOLD
     pip and a soldier raised to champion a STEEL one — each a solid diamond
     with a dark rim, set clear ABOVE the frame's own head — measured on the
     pixels drawUnit lays over a frame whose head starts a tenth of the way
     down (a synthetic frame: its silhouette is known), against a trained
     champion (the CONTROL) that wears none. And the rank is put on when the
     wave reaches the man, not at the play: a soldier the wave has not
     reached wears nothing yet. */
  const r = await p.evaluate(() => {
    __ar.fresh('army-chevron'); __ar.flat();
    const d = __ar.unit('defender', 'P', 4.5, 14.5), e = __ar.unit('elite', 'P', 6.5, 14.5), plain = __ar.unit('elite', 'P', 8.5, 14.5);
    S.units.splice(S.units.indexOf(plain), 1);
    Deck.play('veterans');
    S.units.push(plain);
    // a 64px frame: a body from row 6 (a tenth of the way down) to the foot
    const img = document.createElement('canvas'); img.width = img.height = 64;
    { const q = img.getContext('2d'); q.fillStyle = '#806040'; q.fillRect(22, 6, 20, 56); }
    const look = (u, wait) => {
      const cv = document.createElement('canvas'); cv.width = cv.height = 48;
      const g = cv.getContext('2d');
      if (!wait) Deck._rankAt = null;   // a minute later
      if (u.spectral || u.warWolf || u.vet || u.ranked) Deck.drawUnit(g, u, img, 8, 12, 32);
      const px = g.getImageData(0, 0, 48, 48).data, cols = {};
      let above = 0, below = 0, minX = 99, maxX = -1, minY = 99, maxY = -1;
      const headY = 12 + Math.round(6 / 64 * 32);   // the frame's first opaque row, in the canvas
      for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
        const i = (y * 48 + x) * 4;
        if (!px[i + 3]) continue;
        const inBody = x >= 8 + 11 && x < 8 + 21 && y >= headY && y < 12 + 31;
        if (inBody) continue;
        const h = '#' + [px[i], px[i + 1], px[i + 2]].map(v => v.toString(16).padStart(2, '0')).join('');
        cols[h] = (cols[h] || 0) + 1;
        if (y < headY) above++; else below++;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
      return { above, below, w: maxX - minX + 1, h: maxY - minY + 1, cols };
    };
    const pending = look(e, true);
    return { kinds: [d.kind, e.kind, plain.kind], raised: look(d), vet: look(e), plain: look(plain), pending };
  });
  const tone = (o, c) => o.cols[c] || 0;
  ck('theRaisedWearTheirRankForGood', r.kinds.join() === 'elite,elite,elite' &&
    tone(r.vet, '#ffd45e') >= 9 && tone(r.raised, '#b9c8da') >= 9 && !tone(r.raised, '#ffd45e') && !tone(r.vet, '#b9c8da') &&
    r.vet.below === 0 && r.raised.below === 0 && r.vet.w >= 5 && r.vet.h >= 5 && (tone(r.vet, '#3a2408') >= 8) && r.plain.above + r.plain.below === 0,
    `a veteran: ${tone(r.vet, '#ffd45e')} gold px in a ${r.vet.w}x${r.vet.h} pip, ${tone(r.vet, '#3a2408')} px of rim, ${r.vet.below} px laid on the man; ` +
    `raised to champion: ${tone(r.raised, '#b9c8da')} steel px, ${r.raised.below} on the man; a trained champion ${r.plain.above + r.plain.below}`);
  ck('andTheRankIsPutOnWhenTheWaveReachesHim', r.pending.above + r.pending.below === 0 && r.vet.above > 0,
    `straight after the play the veteran wears ${r.pending.above + r.pending.below} px of rank; once the wave has passed, ${r.vet.above}`);
}
{
  /* THE CARD LANDS ON THE ARMY (judge g3, playtest g3 #1): with the army
     sixteen tiles out and the camera on it, the play hauled the camera to
     the hall and the whole promotion happened off the screen. It lands where
     the soldiers are: with any of them in sight the camera does not move
     (and the landing point is among them); with none in sight it is brought
     to the biggest body of them. And THE FLASH IS THE MAN'S OWN: a soldier
     lit by his rank is lit on his own pixels and a hard line round them —
     not a box of light, not a pillar in the world pass (the first cut's
     "solid gold rectangles behind the soldiers"). */
  const r = await p.evaluate(() => {
    const out = {};
    __ar.fresh('army-vet-far'); __ar.flat();
    Screens.show('playing');
    const tc = Bld.tcOf('P'), ax = tc.x + 16, ay = tc.y + 4;
    const army = [0, 1, 2, 3, 4, 5].map(i => __ar.unit(['defender', 'archer', 'rider', 'defender', 'elite', 'catapult'][i], 'P', ax + (i % 3) * 1.2 + 0.5, ay + ((i / 3) | 0) * 1.2 + 0.5));
    R.cam.z = 1.7; R.centerOn(ax + 1.5, ay + 1);
    const cam0 = [R.cam.x, R.cam.y];
    const fx = Deck.FX.veterans;
    const dest = DeckUI._dest(fx.at || 'tc', 'veterans');
    out.stayed = R.cam.x === cam0[0] && R.cam.y === cam0[1];
    out.seen = army.filter(u => R.onScreen(u.x, u.y)).length;
    const TL = CFG.TILE, sx = u => (u.x * TL - R.cam.x) * R.cam.z, sy = u => (u.y * TL - R.cam.y) * R.cam.z;
    out.amongThem = Math.min(...army.map(u => Math.hypot(sx(u) - dest.x, sy(u) - dest.y))) < 3 * TL * R.cam.z;
    // in sight but out at the left edge: the camera frames them (the climax
    // is not cut by the edge of the screen)
    R.centerOn(ax + 1.5 + 3, ay + 1);
    const camE = [R.cam.x, R.cam.y], seenE = army.filter(u => R.onScreen(u.x, u.y)).length;
    DeckUI._dest(fx.at || 'tc', 'veterans');
    const mx = (ax + 1.5) * TL, my = (ay + 1) * TL, vw = R.viewW();
    out.framed = { seen: seenE, moved: R.cam.x !== camE[0] || R.cam.y !== camE[1], at: +(((mx - R.cam.x) * R.cam.z) / vw).toFixed(2) };
    // none in sight: the camera is brought to them
    R.centerOn(Bld.cx(tc), Bld.cy(tc));
    DeckUI._dest(fx.at || 'tc', 'veterans');
    out.brought = army.filter(u => R.onScreen(u.x, u.y)).length;
    // THE FLASH: a lone soldier far from the wave's start, his frame a known
    // silhouette (a synthetic 64px frame stood in for his sprite)
    __ar.fresh('army-vet-flash'); __ar.flat();
    __ar.unit('defender', 'P', 6.5, 10.5);
    R.cam.z = 1.7; R.centerOn(6.5, 10.5);
    G.updateVisibility();   // the player's own: in sight
    R.cardShows = [];
    Deck.play('veterans');
    const s = R.cardShows.find(x => x.id === 'veterans'), sh = fx.show;
    s.x = s.y = -60;   // (the wave's ring rolls out elsewhere: only the man is measured)
    const img = document.createElement('canvas'); img.width = img.height = 64;
    { const q = img.getContext('2d'); q.fillStyle = '#806040'; q.beginPath(); q.ellipse(32, 36, 10, 24, 0, 0, Math.PI * 2); q.fill(); }
    const fa = img.getContext('2d').getImageData(0, 0, 64, 64).data;   // his own pixels: every alpha of the frame
    const real = R.unitSprite, realFB = R.frameBox;
    R.unitSprite = () => img; R.frameBox = (u, i, B) => B;
    let outside = 0, inside = 0; const where = [];
    try {
      const l = s.lit.slice().sort((p, q) => q.d - p.d)[0], u = Units.get(l.id);
      const cv = document.createElement('canvas'); cv.width = CFG.W * TL; cv.height = CFG.H * TL;
      const g = cv.getContext('2d');
      const B = R.unitBox(u), x0 = Math.round(u.x * TL - B / 2), y0 = Math.round(R.frameTop(u.y, B, B));
      for (const dt of [0, 0.03, 0.1, 0.25]) {
        g.clearRect(0, 0, cv.width, cv.height);
        s.t = l.d + dt;
        // the ground pass first, on a canvas of its own (its beam stands
        // UNDER him; it is also what stamps the landing frame the world
        // pass answers), then the world pass over him, measured
        { const gg = document.createElement('canvas'); gg.width = cv.width; gg.height = cv.height; sh.draw.call(fx, gg.getContext('2d'), s, s.t / (s.ms / 1000), 0, 'ground'); }
        if (sh.layers || sh.layer === 'world') { g.save(); sh.draw.call(fx, g, s, s.t / (s.ms / 1000), 0, 'world'); g.restore(); }
        for (const e of R.summons) e.t = s.t;
        g.save(); R.drawSummons(g, 0); g.restore();
        // the box, and the silhouette a world pixel wider (the hard line round him)
        const d = g.getImageData(x0 - 2, y0 - 2, B + 4, B + 4).data, W2 = B + 4;
        for (let yy = 0; yy < W2; yy++) for (let xx = 0; xx < W2; xx++) {
          if (!d[(yy * W2 + xx) * 4 + 3]) continue;
          // the frame's pixel under this one (64 → B), dilated by one world px
          const fx0 = (xx - 2) / B * 64, fy0 = (yy - 2) / B * 64, k = 64 / B * 1.5;
          // (a world pixel spans 64/B frame pixels a side: any of them his)
          const on1 = (px, py) => px >= 0 && py >= 0 && px < 64 && py < 64 && fa[(py * 64 + px) * 4 + 3] > 0;
          const inS = (px, py) => { const st = Math.max(1, Math.round(64 / B)); px = Math.floor(px); py = Math.floor(py);
            for (let a = 0; a < st; a++) for (let c = 0; c < st; c++) if (on1(px + a, py + c)) return true; return false; };
          const near = inS(fx0, fy0) || inS(fx0 - k, fy0) || inS(fx0 + k, fy0) || inS(fx0, fy0 - k) || inS(fx0, fy0 + k);
          if (fy0 < 36 - 24 - 1) continue;   // above his head: the rank pip's place
          if (near) inside++; else { outside++; if (where.length < 12) where.push(dt + '@' + (xx - 2) + ',' + (yy - 2) + ':' + [0, 1, 2, 3].map(c => d[(yy * W2 + xx) * 4 + c]).join('/')); }
        }
      }
    } finally { R.unitSprite = real; R.frameBox = realFB; }
    out.flash = { inside, outside, where, B: R.unitBox(Units.get(s.lit[0].id)) };
    return out;
  });
  ck('theCardLandsOnTheArmyNotTheHall', r.stayed && r.seen === 6 && r.amongThem && r.brought === 6,
    `the army 16 tiles out, the camera on it: kept still ${r.stayed}, ${r.seen} of 6 in sight, the light lands among them ${r.amongThem}; with none in sight the camera is brought to them: ${r.brought} of 6`);
  ck('andAnArmyAtTheEdgeIsFramed', r.framed.seen > 0 && r.framed.moved && r.framed.at > 0.4 && r.framed.at < 0.6,
    `${r.framed.seen} of 6 in sight at the left edge: the camera moved ${r.framed.moved}, their middle now ${r.framed.at} of the way across`);
  ck('theFlashIsTheMansOwnPixels', r.flash.inside > 0 && r.flash.outside === 0,
    `in the man's box through the flash: ${r.flash.inside} px on him and his edge, ${r.flash.outside} px of box round him` + (r.flash.outside ? ' (box ' + r.flash.B + ': ' + r.flash.where.join(' ') + ')' : ''));
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

{
  /* WHAT THE PICTURE DOES NOT DRAW CANNOT BE TAPPED (the tap contract's
     rule 1): a ghost still under the ground and a muster's unit still waiting
     for its flash are in S.units but not on the screen. With a villager
     selected, a dead-on tap where such a unit stands must not steal the
     selection to it; the CONTROL is the same tap once it has risen. And a
     hurt ghost selected never draws the heal-zone ring (Bld.healZoneFor is
     never asked), where a hurt defender does. */
  const r = await p.evaluate(() => {
    const out = {};
    __ar.fresh('army-hidden-tap'); __ar.flat();
    Screens.show('playing'); S.paused = true;
    const TL = CFG.TILE, lift = CFG.SPRITE_LIFT / TL;
    const tc = Bld.tcOf('P');
    R.cam.z = 2; R.centerOn(Bld.cx(tc), Bld.cy(tc) + 2);
    const v = __ar.unit('villager', 'P', tc.x - 3.5, tc.y + 6.5);
    G.updateVisibility();
    const tapAt = (u) => {
      UI.select('unit', v.id);
      const sx = (u.x * TL - R.cam.x) * R.cam.z, sy = ((u.y - lift) * TL - R.cam.y) * R.cam.z;
      UI.handleTap(sx, sy);
      const sel = UI.sel && UI.sel.type === 'unit' ? UI.sel.id : null;
      v.task = null; v.path = null;
      return sel === u.id;
    };
    const { units: host } = __ar.play('ancestors_host');
    const s = R.cardShows.find(x => x.id === 'ancestors_host' && x.mode === 'rise');
    const g14 = host[14];
    s.t = 0;
    out.ghost = { rise: Deck.riseOf(g14), hit: R.unitHit(g14, g14.x, g14.y - lift), stolen: tapAt(g14) };
    s.t = 99;
    out.ghostRisen = { rise: Deck.riseOf(g14), hit: R.unitHit(g14, g14.x, g14.y - lift), stolen: tapAt(g14) };
    // the muster's waiting unit
    R.cardShows = []; R.summons = []; R._unborn = null;
    for (const u of host) Units.despawn(u);
    const { units: hands } = __ar.play('willing_hands');
    const last = hands[hands.length - 1];
    out.unborn = { waiting: !!(R._unborn && R._unborn.has(last.id)), hit: R.unitHit(last, last.x, last.y - lift), stolen: tapAt(last) };
    R.summons = []; R._unborn = null;
    out.unbornOut = { hit: R.unitHit(last, last.x, last.y - lift), stolen: tapAt(last) };
    // the heal ring: a hurt ghost selected asks no heal zone; a hurt defender does
    R.cardShows = [];
    const gh = __ar.play('ancestors_host').units[0];
    R.cardShows = [];
    gh.hp = Math.round(gh.maxhp / 2);
    const d = __ar.unit('defender', 'P', Bld.cx(tc) + 1, Bld.cy(tc) + 2); d.hp = 10;
    G.updateVisibility();
    const real = Bld.healZoneFor;
    let asks = 0;
    Bld.healZoneFor = function (u) { asks++; return real.call(this, u); };
    try {
      UI.select('unit', gh.id); asks = 0; R.draw(0.016); out.ringGhost = asks;
      UI.select('unit', d.id); asks = 0; R.draw(0.016); out.ringDef = asks;
    } finally { Bld.healZoneFor = real; UI.deselect(); }
    return out;
  });
  ck('aGhostUnderTheGroundCannotBeTapped', r.ghost.rise === 0 && r.ghost.hit === Infinity && !r.ghost.stolen && r.ghostRisen.rise === 1 && r.ghostRisen.stolen,
    `under the ground: hit ${r.ghost.hit}, the tap took it ${r.ghost.stolen}; risen: hit ${r.ghostRisen.hit}, the tap took it ${r.ghostRisen.stolen}`);
  ck('norAMusterStillWaitingItsFlash', r.unborn.waiting && r.unborn.hit === Infinity && !r.unborn.stolen && r.unbornOut.stolen,
    `waiting its flash ${r.unborn.waiting}: hit ${r.unborn.hit}, the tap took it ${r.unborn.stolen}; out of its light the tap takes it ${r.unbornOut.stolen}`);
  ck('noHealRingIsDrawnForAGhost', r.ringGhost === 0 && r.ringDef > 0, `heal zones asked: a hurt ghost ${r.ringGhost}, a hurt defender ${r.ringDef}`);
}

// ---------------- 7. SAVES ----------------
{
  const r = await p.evaluate(() => {
    const out = {};
    __ar.fresh('army-save'); __ar.flat();
    const lgU = __ar.play('legion_marches').units, lg = lgU.map(u => u.id);
    // the place each landed on (the fan it holds, and stays on)
    const slot = Object.fromEntries(lgU.map(u => [u.id, u.task && u.task.type === 'muster' && u.task.stay ? { x: u.x, y: u.y } : null]));
    const pack = __ar.play('hunters_pack').units.map(u => u.id);
    __ar.unit('defender', 'P', 4.5, 16.5);
    Deck.play('veterans');
    const host = __ar.play('ancestors_host').units.map(u => u.id);
    __ar.sim(0.5);
    const until = Deck.timed('ancestors_host').until;
    G.loadJSON(G.saveJSON());
    S.paused = true;
    const get = id => S.units.find(u => u.id === id);
    out.muster = lg.every(id => get(id) && get(id).task && get(id).task.type === 'muster' && get(id).task.stay && get(id).task.wait > 0);
    out.pack = pack.every(id => { const w = get(id); return w && w.warWolf && w.den && w.hp === 70 && w.atk === 10 && w.speed === 3.4; });
    out.vets = S.units.filter(u => u.vet === 1.25).length;
    out.host = host.every(id => get(id) && get(id).spectral) && Deck.timed('ancestors_host') && Deck.timed('ancestors_host').until === until;
    __ar.sim(3);
    // free: nobody still waiting, every one standing on the place it landed
    // on before the save (the hold's beat ran on after the load)
    out.marched = lg.every(id => {
      const u = get(id), sl = slot[id];
      return sl && !u.task && Math.hypot(u.x - sl.x, u.y - sl.y) < 0.05;
    });
    out.moved = lg.filter(id => { const u = get(id), sl = slot[id]; return !sl || Math.hypot(u.x - sl.x, u.y - sl.y) >= 0.05; }).length;
    S.day = Math.ceil(until) + 1; Deck.tick();
    out.faded = S.units.filter(u => u.spectral).length === 0;
    return out;
  });
  ck('aMusterMidBeatHoldsAcrossTheLoad', r.muster && r.marched, `holding after the load ${r.muster}; after it every one free on the place it landed on ${r.marched} (${r.moved} moved off it)`);
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
  // (AT THE PLAY: a card's soldiers are population — ruling 5 — so the next
  // day's census counts them; theLegionIsTheTribeTheNextDay pins that half)
  ck('playingACardScoresNothingAtThePlay', !bad(r.score).length, bad(r.score).join(', ') || 'subtotal, trained, built, upgrades and peakPop unmoved by the play');
  ck('aSummoningNeverBreaksTheTruce', !bad(r.peace).length, bad(r.peace).join(', ') || 'the Calm peace holds through all nine');
}

// ---------------- 8b. THE VOICE ----------------
/* Sound lets MAX_VOICES (10) notes sound at once and counts each from the
   moment it is SCHEDULED, and the landing's own chime (UI.cue, three notes)
   follows the card's voice in the same frame. A voice that booked a whole
   march of drums up front (the first cut's fanfare: seventeen notes) held the
   cap for four seconds: the chime never sounded, nor did the battery's
   rumble played after it. The drums are struck on the show's beats now. */
{
  const r = await p.evaluate(({ SUMMONERS }) => {
    const out = { ac: !!Sound.ac(), apply: {}, beats: {} };
    if (!out.ac) return out;
    const real = Sound.play;
    let calls = [];
    Sound.play = function (k, o) { const ok = real.call(this, k, o); calls.push([k, ok]); return ok; };
    try {
      // the CONTROL: a cap that is full refuses the chime (the probe can see)
      Sound._live = 0; Sound._last = {};
      for (let i = 0; i < 5; i++) Sound._VOICES.cardDrum.call(Sound, 0, 1);
      out.control = Sound.play('bond');
      const g = R.g;
      for (const id of SUMMONERS.concat(['veterans'])) {
        __ar.fresh('army-voice-' + id); __ar.flat();
        if (id === 'veterans') __ar.unit('defender', 'P', 4.5, 16.5);
        Sound._live = 0; Sound._last = {}; calls = [];
        Deck.play(id);
        const booked = Sound._live, mine = calls.slice();
        const chime = Sound.play('bond');
        out.apply[id] = { ok: mine.every(c => c[1]), voices: mine.map(c => c[0] + (c[1] ? '' : ' REFUSED')).join('+'), booked, chime };
        // the march: every beat of the show, with time passing between them
        const s = R.cardShows.filter(x => x.id === id).pop(), sh = Deck.FX[id].show;
        const struck = {};
        for (let pp = 0; pp < 1; pp += 0.01) {
          Sound._live = 0; Sound._last = {}; calls = [];
          s.t = pp * s.ms / 1000;
          for (const layer of sh.layers || [sh.layer || 'world']) { g.save(); try { sh.draw.call(Deck.FX[id], g, s, pp, 1 / 60, layer); } finally { g.restore(); } }
          for (const [k, ok] of calls) if (ok) struck[k] = (struck[k] || 0) + 1;
        }
        out.beats[id] = struck;
      }
    } finally { Sound.play = real; Sound._live = 0; Sound._last = {}; }
    return out;
  }, { SUMMONERS });
  if (!r.ac) ck('theOpeningVoiceLeavesRoomForTheLanding', true, 'no AudioContext on this page — skipped');
  else {
    const bad = Object.keys(r.apply).filter(k => !(r.apply[k].ok && r.apply[k].chime && r.apply[k].booked <= 7));
    ck('theOpeningVoiceLeavesRoomForTheLanding', !r.control && !bad.length,
      bad.length ? bad.map(k => k + ': ' + JSON.stringify(r.apply[k])).join(' | ')
        : `a full cap refuses the chime (${!r.control}); every card's voice sounds and books ≤7 notes: ` + Object.entries(r.apply).map(([k, v]) => k + ' ' + v.booked).join(', '));
    const B = r.beats, want = {
      // the Iron Legion's three deep beats (every other landing); the
      // battery's rumble under its first engine and a drum under each after
      iron_legion: { cardDrum: 3 }, legion_marches: { cardDrum: 5 }, trebuchet_battery: { cardRumble: 1, cardDrum: 2 },
      ancestors_host: { cardDrum: 1 }, swift_raiders: { cardHoof: 7 },
    };
    const miss = Object.keys(want).filter(id => Object.keys(want[id]).some(k => (B[id][k] || 0) !== want[id][k]));
    ck('theMarchIsDrummedOnItsBeats', !miss.length,
      miss.length ? miss.map(id => id + ' ' + JSON.stringify(B[id])).join(' | ') : Object.keys(want).map(id => id + ' ' + JSON.stringify(B[id])).join(', '));
  }
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
      for (const u of S.units.filter(u => u.spectral || u.warWolf || u.vet || u.ranked)) {
        const img = R.unitSprite(u);
        g.save(); Deck.drawUnit(g, u, img, u.x * 32 - 16, u.y * 32 - 28, 32); g.restore();
      }
    } catch (e) { out.threw.push('live: ' + e); }
    // …and the host fading, every ghost in its own wisp
    try {
      const e = Deck.timed('ancestors_host'); e.until = Deck.now() - 1e-6;
      R.centerOn(Bld.cx(tc), Bld.cy(tc) + 2);
      G.updateVisibility();   // the ghosts are in sight: they are the player's own
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
    out.voices = ['cardHands', 'cardWarHorn', 'cardHowl', 'cardHoof', 'cardDrum', 'cardRumble', 'cardRanks', 'cardFanfare', 'cardHost', 'cardFade']
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
{
  /* NOTHING IS DRAWN IN THE BLACK (CLAUDE.md): a hall stands seven to ten
     tiles from the edge, and the Veterans' ring rolls ten tiles out from it;
     the host's spirits, dark and light are screen-wide. World-layer shows are
     clipped to the board by the engine (R.drawCardShows), the sky's light by
     each show (Deck.armyFx.skyClip). Measured on the pixels: nothing lands
     off the board — and the CONTROL widens R.boardPx (the one source both
     clips derive from) and must see the leak, or the probe sees nothing. */
  const r = await p.evaluate(() => {
    __ar.fresh('army-black'); __ar.flat();
    Screens.show('playing');
    const TL = CFG.TILE, tc = Bld.tcOf('P');
    const run = (wide) => {
      const real = R.boardPx;
      if (wide) R.boardPx = () => ({ x0: -9999, y0: -9999, x1: 99999, y1: 99999 });
      try {
        // the WORLD layer: the veterans' ring from a hall three tiles in
        const cv = document.createElement('canvas'); cv.width = CFG.W * TL; cv.height = CFG.H * TL;
        const g = cv.getContext('2d');
        R.cardShows = [];
        const s = R.startCardShow('veterans', { x: 3, y: 12, lit: [] });
        s.t = 0.3 * s.ms / 1000;
        R.drawCardShows(g, 0, 'world');
        const d = g.getImageData(0, 0, TL, cv.height).data;
        let world = 0;
        for (let i = 3; i < d.length; i += 4) if (d[i]) world++;
        // the GROUND layer: a summon's beam runs up to the top of the view,
        // here with the camera pulled up over the board's north rim
        R.cardShows = [];
        R.cam.z = 2; R.cam.x = 0; R.cam.y = -TL * 3;
        g.clearRect(0, 0, cv.width, cv.height);
        const bs = R.startCardShow('war_band', { x: 6, y: 4, units: [{ id: -1, x: 5.5, y: 4.5, d: 0 }] });
        bs.t = 0.05;
        R.drawCardShows(g, 0, 'ground');
        const gd = g.getImageData(0, 0, cv.width, TL).data;
        for (let i = 3; i < gd.length; i += 4) if (gd[i]) world++;
        // the SKY layer: the host with the camera over the board's west edge
        R.cardShows = [];
        R.cam.z = 2; R.cam.x = -TL * 4; R.cam.y = TL * 4;
        const sv = document.createElement('canvas'); sv.width = R.cv.width; sv.height = R.cv.height;
        const sg = sv.getContext('2d');
        const hs = R.startCardShow('ancestors_host', { mode: 'rise', mx: 3.5, my: 10.5, x: 3, y: 10, units: [], rise: {} });
        hs.t = 0.5 * hs.ms / 1000;
        sg.save(); R.drawCardShows(sg, 0, 'sky'); sg.restore();
        const z = R.cam.z * R.dpr, edge = Math.floor((TL - R.cam.x) * z);   // the board's first screen column
        const f = Deck.armyFx.frame(), top = Math.ceil(f.top + sv.height * 0.12), bot = Math.floor(sv.height - f.bot - sv.height * 0.12);
        const sd = sg.getImageData(0, top, Math.max(1, edge - 1), bot - top).data;
        let sky = 0;
        for (let i = 3; i < sd.length; i += 4) if (sd[i]) sky++;
        R.cardShows = [];
        return { world, sky };
      } finally { R.boardPx = real; }
    };
    return { fixed: run(false), leak: run(true) };
  });
  ck('noShowIsDrawnInTheBlack', r.fixed.world === 0 && r.fixed.sky === 0 && r.leak.world > 0 && r.leak.sky > 0,
    `off the board: the veterans' ring ${r.fixed.world} px, the host's sky ${r.fixed.sky} px; with the board widened (the control) ${r.leak.world} / ${r.leak.sky}`);
}
{
  /* THE BEAMS (judges g2/g3, playtest g2): five men came down in two beams,
     four stacked in one column; every beam stopped with a flat top 250 device
     px above the ground; the light was a translucent hue over the meadow that
     went olive at its edges; a square-shouldered gold slab swallowed the hall;
     confetti littered the grass for seconds; and the Iron tier wore the same
     yellow as the Bronze. Measured on the show's own pixels (a fresh canvas,
     world px 1:1, nothing else drawn on it):
       ONE BEAM PER UNIT, FULL HEIGHT — on the view's top row, one run of the
         tier's light over every unit whose beam is up, and none elsewhere;
       OPAQUE, IN THE TIER'S OWN LIGHT — every pixel the beams lay is fully
         opaque and one of its tier's own colours (or the earth's clods), and
         the four tiers' lights are four different sets;
       UNDER THE HALL — the column is laid in the GROUND pass, which every
         building and unit is drawn over: the world pass lays nothing above
         a man's knees once his landing frame has passed;
       NO CONFETTI — half a second after the last landing the arrival lays
         not one pixel. */
  const r = await p.evaluate(() => {
    const out = { tiers: {}, bad: [] };
    const TL = CFG.TILE;
    const canvas = () => { const c = document.createElement('canvas'); c.width = CFG.W * TL; c.height = CFG.H * TL; return c; };
    const drawAt = (s, sh, fx, g, t, layers) => {
      s.t = t - 0.01; for (const L of layers) { g.save(); sh.draw.call(fx, g, s, 0.5, 0, L); g.restore(); }   // the landing frames before
      g.clearRect(0, 0, g.canvas.width, g.canvas.height);
      s.t = t; for (const L of layers) { g.save(); sh.draw.call(fx, g, s, 0.5, 0, L); g.restore(); }
    };
    const hex = (d, i) => '#' + [d[i], d[i + 1], d[i + 2]].map(v => v.toString(16).padStart(2, '0')).join('');
    for (const [id, tone] of [['war_band', 'bronze'], ['iron_legion', 'steel'], ['legion_marches', 'gold'], ['swift_raiders', 'steel']]) {
      __ar.fresh('army-beam-' + id); __ar.flat();
      Screens.show('playing');
      const tc = Bld.tcOf('P');
      R.cam.z = 1.7; R.centerOn(Bld.cx(tc), Bld.cy(tc) + 0.6);
      R.cardShows = []; R.summons = [];
      Deck.play(id);
      const s = R.cardShows.find(x => x.id === id), fx = Deck.FX[id], sh = fx.show;
      const P = (Deck.armyFx.BEAM || {})[tone] || { ramp: [], ring: [] }, pal = new Set(P.ramp.concat([P.hot, '#ffffff', P.ring[0], P.ring[1], '#6b5236', '#8a6c48']));
      if (!s.units || !s.units.length) { out.tiers[id] = { tone, runs: -1, up: 0, overUnits: false, px: 0, soft: 0, alien: 0, tall: -1, left: -1, cols: '' }; continue; }
      const units = s.units, last = units[units.length - 1].d, cv = canvas(), g = cv.getContext('2d');
      // the moment the last beam has landed and the first is still up
      const T = last + 0.02;
      drawAt(s, sh, fx, g, T, ['ground']);
      const top = Math.ceil(R.viewTiles().y0 * TL) + 1, row = g.getImageData(0, top, cv.width, 1).data;
      let runs = 0, inRun = false;
      for (let x = 0; x < cv.width; x++) { const on = row[x * 4 + 3] > 0; if (on && !inRun) runs++; inRun = on; }
      // the units whose beams are up, gathered into columns a beam's top could
      // merge across (under 0.75 tile apart): each column its own run of light
      const upU = units.filter(m => T - m.d >= 0 && T - m.d < (Deck.armyFx.BEAM_T || { life: 0.5 }).life);
      const xsU = upU.map(m => m.x).sort((a, b) => a - b);
      let up = 0;
      for (let i = 0; i < xsU.length; i++) if (!i || xsU[i] - xsU[i - 1] >= 0.4) up++;
      const overUnits = upU.every(m => { const x = Math.round(m.x * TL); return row[x * 4 + 3] > 0 || row[(x - 1) * 4 + 3] > 0; });
      // every pixel the beams laid: opaque, of the tier's own light
      const all = g.getImageData(0, 0, cv.width, cv.height).data, cols = new Set();
      let px = 0, soft = 0, alien = 0;
      for (let i = 0; i < all.length; i += 4) {
        if (!all[i + 3]) continue;
        px++;
        if (all[i + 3] < 255) { soft++; continue; }
        const h = hex(all, i);
        cols.add(h);
        if (!pal.has(h)) alien++;
      }
      // the world pass, a frame after its landing: nothing above the knees —
      // the show's own world layer and the muster's flashes (R.drawSummons,
      // which the world pass draws in the same breath: R.drawCardWorld)
      const cw = canvas(), gw = cw.getContext('2d');
      drawAt(s, sh, fx, gw, last + 0.2, ['world']);
      for (const e of R.summons) { if (e._t0 == null) e._t0 = e.t; e.t = e._t0 + last + 0.2; }
      gw.save(); R.drawSummons(gw, 0); gw.restore();
      // (above the top of the highest man's own drawn box: a glint on a
      // spear or a shield is his, a column of light is not)
      let kneeY = 1e9;
      for (const m of units) { const u = Units.get(m.id), B = R.unitBox(u); kneeY = Math.min(kneeY, Math.floor(R.frameTop(u.y, B, B)) - 6); }
      const top0 = Math.ceil(R.viewTiles().y0 * TL);
      const wd = gw.getImageData(0, top0, cw.width, Math.max(1, kneeY - top0)).data;
      let tall = 0;
      for (let i = 3; i < wd.length; i += 4) if (wd[i]) tall++;
      // no confetti: half a second after the last landing, nothing at all
      const cc = canvas(), gc = cc.getContext('2d');
      drawAt(s, sh, fx, gc, last + 0.55, ['ground', 'world']);
      const cd = gc.getImageData(0, 0, cc.width, cc.height).data;
      let left = 0;
      for (let i = 3; i < cd.length; i += 4) if (cd[i]) left++;
      out.tiers[id] = { tone, runs, up, overUnits, px, soft, alien, tall, left, cols: [...cols].sort().join(' ') };
    }
    return out;
  });
  const T = r.tiers, ids = Object.keys(T);
  ck('oneBeamPerUnitRunningTheFullHeight', ids.every(k => T[k].runs === T[k].up && T[k].overUnits && T[k].up >= 3),
    ids.map(k => `${k}: ${T[k].runs} beams on the view's top row for ${T[k].up} columns of men whose beams are up, over every one ${T[k].overUnits}`).join('; '));
  ck('theBeamsAreOpaqueInTheTiersOwnLight', ids.every(k => T[k].px > 0 && T[k].soft === 0 && T[k].alien === 0) &&
    T.war_band.cols !== T.iron_legion.cols && T.iron_legion.cols !== T.legion_marches.cols && T.war_band.cols !== T.legion_marches.cols,
    ids.map(k => `${k} (${T[k].tone}): ${T[k].px} px, ${T[k].soft} translucent, ${T[k].alien} off the tier's light`).join('; '));
  ck('theHallStandsOverTheLight', ids.every(k => T[k].tall === 0), ids.map(k => `${k}: ${T[k].tall} px laid above a man's knees in the world pass`).join('; '));
  ck('andNoConfettiOutlivesHalfASecond', ids.every(k => T[k].left === 0), ids.map(k => `${k}: ${T[k].left} px left 0.55s after the last landing`).join('; '));
}
{
  /* THE WEIGHT OF AN ENGINE (judge g3: the Trebuchet Battery "has no sense
     of weight"): as each engine is set down the ground jolts (a hard shake
     struck on its own landing), the dust skids out from under it (three
     puffs of the place-dust thrown out behind it, on its landing beat), and
     a throwing engine swings its arm once through its own loosing strip,
     from the first frame — the Battery's two trebuchets and the Siege Train's
     catapult; the tower and the ballista have no arm to swing. */
  const r = await p.evaluate(() => {
    const out = {};
    for (const id of ['trebuchet_battery', 'siege_train']) {
      __ar.fresh('army-weight-' + id); __ar.flat();
      R.cardShows = []; R.summons = []; R.placePoofs = []; R._shake = null;
      const { units } = __ar.play(id);
      const s = R.cardShows.find(x => x.id === id), fx = Deck.FX[id], g = R.g;
      const shakes = [], swung = {};
      const real = R.shakeAt.bind(R);
      R.shakeAt = (amp, dur) => { shakes.push([+s.t.toFixed(2), amp]); return real(amp, dur); };
      try {
        for (let t = 0; t < s.ms / 1000; t += 0.02) {
          s.t = t;
          for (const L of fx.show.layers) { g.save(); fx.show.draw.call(fx, g, s, t / (s.ms / 1000), 0, L); g.restore(); }
          for (const u of units) if (Deck._swing && Deck._swing.has(u) && swung[u.id] == null) swung[u.id] = +t.toFixed(2);
        }
      } finally { R.shakeAt = real; }
      const landed = s.units.map(m => m.d);
      out[id] = {
        kinds: units.map(u => u.kind),
        // a hard jolt within a beat of every landing
        jolts: landed.every(d => shakes.some(([t, a]) => a >= 5 && t >= d - 0.03 && t <= d + 0.1)),
        // three skid puffs per engine, thrown on its landing beat
        skids: units.map((u, i) => R.placePoofs.filter(q => Math.hypot(q.x + 0.5 - u.x, q.y + 0.5 - u.y) < 1.2 && Math.abs(-q.t / 1000 - landed[i]) < 0.3).length),
        swung: units.map((u, i) => swung[u.id] == null ? null : +(swung[u.id] - landed[i]).toFixed(2)),
      };
    }
    return out;
  });
  const T = r.trebuchet_battery, ST = r.siege_train;
  const arms = (o) => o.kinds.every((k, i) => (k === 'trebuchet' || k === 'catapult') ? (o.swung[i] != null && o.swung[i] >= 0 && o.swung[i] < 0.3) : o.swung[i] == null);
  ck('anEngineLandsWithItsWeight', T.jolts && ST.jolts && T.skids.every(n => n >= 3) && ST.skids.every(n => n >= 3) && arms(T) && arms(ST),
    `the Battery (${T.kinds.join(', ')}): a hard jolt on every landing ${T.jolts}, skid puffs ${T.skids.join('/')}, arm swung ${T.swung.map(v => v == null ? '—' : v + 's').join('/')} after landing; ` +
    `the Siege Train (${ST.kinds.join(', ')}): jolts ${ST.jolts}, skids ${ST.skids.join('/')}, arm ${ST.swung.map(v => v == null ? '—' : v + 's').join('/')}`);
}
{
  /* THE SUMMON DUST IS PIXEL DUST (judge g3, "rendering defects" 1): a summon
     throws R.startPlacePoof at 0.55 under an engine and 1.25 under a battery,
     and the scaled branch drew the frame through whatever smoothing the canvas
     held — bilinear, a soft blur, the one smoothed thing on the screen. Every
     dust blit is measured nearest-neighbour with the flag left ON by the
     caller, at every scale the cards use, and the flag handed back as found.
     The CONTROL draws the same frame by hand under the flag as found and must
     see it smoothed, or the probe sees nothing. */
  const r = await p.evaluate(() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const g = cv.getContext('2d');
    const seen = [], real = g.drawImage;
    g.drawImage = function (...a) { seen.push(this.imageSmoothingEnabled); return real.apply(this, a); };
    const out = {};
    for (const sc of [1, 0.55, 0.8, 1.25, 0.65]) {
      R.placePoofs = [{ x: 2, y: 2, sz: sc === 1.25 ? 2 : 1, t: R.POOF_MS * 0.4, scale: sc }];
      g.imageSmoothingEnabled = true;
      seen.length = 0;
      R._drawPlacePoofs(g, 0);
      out[sc] = { drew: seen.length, smooth: seen.filter(Boolean).length, back: g.imageSmoothingEnabled === true };
    }
    // the control: the same frame by hand, under the flag as the caller left it
    seen.length = 0; g.imageSmoothingEnabled = true;
    g.drawImage(R.poofSheet(1).frames[3], 0, 0, 40, 40);
    out.control = seen[0] === true;
    R.placePoofs = [];
    return out;
  });
  const bad = Object.entries(r).filter(([k, v]) => k !== 'control' && (!v.drew || v.smooth || !v.back));
  ck('theSummonDustIsPixelDust', !bad.length && r.control,
    bad.length ? 'smoothed: ' + bad.map(([k, v]) => `scale ${k} (${v.smooth}/${v.drew} blits smoothed, flag back ${v.back})`).join(', ')
      : `every dust blit nearest-neighbour at scales 1/0.55/0.8/1.25/0.65, the caller's flag handed back; the control blit smoothed ${r.control}`);
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
