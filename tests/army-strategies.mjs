/* ARMY-STRATEGIES CONTRACT — the three assault doctrines, for the player AND
   the rival: Siege, Chaos, Strike.

   · SIEGE (Units.siegeOrder / Combat.siegeGuard) — the army splits by role:
     engines (catapult/ballista/trebuchet; the ranges' bows stand in when the
     party has no engines) bombard the chosen building; the foot line posts up
     BETWEEN the guns and the target and STANDS ITS GROUND — it exists to
     shield the guns, not to win the battle. Bows and horses not on the guns
     post just behind the line. Guards engage only what comes to the line
     (SIEGE_PROTECT of the post) and walk back to their post afterwards.

   · CHAOS (Combat.chaosSeek) — attack anything within reach, in order:
     civilians → soldiers → resource buildings → military halls → towers →
     walls → the rest.

   · STRIKE — absolute focus: the whole army hits the one chosen object, and
     NOBODY retargets when hit (the tBld fight-back and mending-hand switches
     are off). When the target falls the army HOLDS ITS GROUND and waits for
     the next order (assault autonomy off; acquire() skips strike units).

   · THE RIVAL fights under the same flags: campaigns assign a stance at
     launch (engines → siege; WARHORN/MUDLARK → strike; else chaos), strike
     columns take no opportunistic detours in aiRaidSeek, and siege escorts
     hold beside the column's guns.

   Run this after touching any of:
     combat.js — acquire's strat branches, chaosSeek, siegeGuard, the siege
                 leash in update, the tBld fight-back gate, aiRaidSeek
     units.js — siegeOrder, resolveAfterFight, setDefend
     ui.js — the gstrat buttons, the group tap flow's stance handling
     ai.js — _assaultStance, _launchCampRaid, _commitMain

     node tests/army-strategies.mjs      # exits non-zero on any regression

   If a feature genuinely needs different behaviour, update this file in the
   same commit and say so in the commit message. */
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

  const setup = (seed) => {
    G.newGame(seed, 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    const tc = Bld.tcOf('P');
    tc.x = 15, tc.y = 25; Bld._block = null;
    for (let dy = -10; dy <= 10; dy++) for (let dx = -6; dx <= 22; dx++) {
      const x = tc.x + dx, y = tc.y + dy;
      if (MapGen.inB(x, y)) S.map.terrain[MapGen.idx(x, y)] = T.GRASS;
    }
    S.units = [];
    UI.deselect();
    return tc;
  };
  const run = (secs, pred, each) => {
    let t = 0; const dt = 0.1;
    while (t < secs && !(pred && pred())) { Units.update(dt); Combat.update(dt); t += dt; if (each) each(); }
    return +t.toFixed(1);
  };
  const mk = (kind, owner, x, y) => Units.spawn(kind, owner, x, y);

  // ---- 1. STRIKE: absolute focus, then hold and wait ----
  {
    setup('as1');
    const party = [mk('defender', 'P', 24, 25), mk('defender', 'P', 24, 26), mk('archer', 'P', 23, 25)];
    const wall = Bld.place('A', 'wall', 29, 25, { free: true, instant: true });
    wall.hp = 90;
    const heckler = mk('defender', 'A', 25, 24);   // hacks at the strikers the whole time
    heckler.atk = 2;
    for (const u of party) { u.strat = 'strike'; u.assault = false; Units.orderAttackBuilding(u, wall); }
    heckler.tUnit = party[0].id; heckler.task = { type: 'attack' };
    let retargeted = false;
    const t1 = run(30, () => !Bld.get(wall.id), () => {
      for (const u of party) if (u.tUnit) retargeted = true;
    });
    ck('strikeKillsTheTarget', !Bld.get(wall.id), `wall ${Bld.get(wall.id) ? 'still up' : 'down'} after ${t1}s`);
    ck('nobodyPeelsOffWhenHit', !retargeted, 'no member ever swapped to the heckler');
    run(6, null, () => { for (const u of party) if (u.tUnit || u.tBld) retargeted = true; });
    ck('strikeHoldsAfterTheFall', !retargeted && party.every(u => !u.tUnit && !u.tBld),
      'army waits for the next order — even with the heckler still swinging');
  }

  // ---- 2. CHAOS: the priority ladder — civilians, soldiers, economy, towers ----
  {
    setup('as2');
    const party = [mk('defender', 'P', 24, 25), mk('defender', 'P', 24, 26)];
    for (const u of party) u.strat = 'chaos';
    const vill = mk('villager', 'A', 28, 25);          // 4 away
    const sold = mk('defender', 'A', 26, 25);          // 2 away — closer, but a soldier
    const farm = Bld.place('A', 'farm', 25, 28, { free: true, instant: true });
    const tower = Bld.place('A', 'tower', 25, 22, { free: true, instant: true });
    Combat.acquire();
    ck('chaosHuntsCiviliansFirst', party.every(u => u.tUnit === vill.id),
      `targets: ${party.map(u => u.tUnit).join(',')} (villager=${vill.id}, closer soldier=${sold.id})`);
    Units.despawn(vill);
    for (const u of party) { u.tUnit = 0; u.task = null; }
    Combat.acquire();
    ck('thenSoldiers', party.every(u => u.tUnit === sold.id), `targets: ${party.map(u => u.tUnit).join(',')}`);
    Units.despawn(sold);
    for (const u of party) { u.tUnit = 0; u.task = null; }
    Combat.acquire();
    ck('thenEconomyBeforeTowers', party.every(u => u.tBld === farm.id),
      `tBld: ${party.map(u => u.tBld).join(',')} (farm=${farm.id}, tower=${tower.id})`);
  }

  // ---- 3. SIEGE with engines: guns bombard, the line stands its ground ----
  {
    setup('as3');
    const cat = mk('catapult', 'P', 22, 25);
    const line = [mk('defender', 'P', 22, 24), mk('defender', 'P', 22, 26), mk('defender', 'P', 21, 25)];
    const bows = [mk('archer', 'P', 21, 24)];
    const ids = [cat, ...line, ...bows].map(u => u.id);
    const bar = Bld.place('A', 'barracks', 32, 25, { free: true, instant: true });
    ck('siegeOrderTaken', Units.siegeOrder(ids, bar) === true, '');
    ck('gunsOnTheTarget', cat.tBld === bar.id && cat.strat === 'siege', '');
    const tX = Bld.cx(bar), tY = Bld.cy(bar);
    const lineD = line.map(u => u.siegePost ? Math.hypot(u.siegePost.x + 0.5 - tX, u.siegePost.y + 0.5 - tY) : 99);
    const bowD = bows.map(u => u.siegePost ? Math.hypot(u.siegePost.x + 0.5 - tX, u.siegePost.y + 0.5 - tY) : 99);
    ck('lineBetweenGunsAndTarget', lineD.every(d => d > 1.8 && d < 4.8) && bowD.every(d => d >= Math.min(...lineD)),
      `line at ${lineD.map(d => d.toFixed(1)).join(',')}; bows at ${bowD.map(d => d.toFixed(1)).join(',')}`);
    const hp0 = bar.hp;
    let lineBattered = false;
    run(16, null, () => { for (const u of line) if (u.tBld || Math.hypot(u.x - tX, u.y - tY) < 2) lineBattered = true; });
    ck('gunsWorkTheTarget', bar.hp < hp0, `barracks ${Math.round(bar.hp)}/${bar.maxhp}`);
    ck('lineStandsItsGround', !lineBattered, 'no line soldier battered or crowded the target');
    // a sortie reaches the line: the guards meet it, kill it, and fall back in
    const sortie = mk('defender', 'A', tX - 4 | 0, tY | 0);
    sortie.hp = sortie.maxhp = 30;
    let engaged = false;
    const t2 = run(25, () => !Units.get(sortie.id), () => { for (const u of line) if (u.tUnit === sortie.id) engaged = true; });
    ck('lineMeetsTheSortie', engaged && !Units.get(sortie.id), `sortie dead after ${t2}s`);
    const t3 = run(12, () => line.every(u => !u.siegePost ||
      Math.hypot(u.x - (u.siegePost.x + 0.5), u.y - (u.siegePost.y + 0.5)) < 1.4));
    ck('guardsFallBackToTheLine', line.every(u => !u.siegePost ||
      Math.hypot(u.x - (u.siegePost.x + 0.5), u.y - (u.siegePost.y + 0.5)) < 1.4), `back in line after ${t3}s`);
  }

  // ---- 4. SIEGE without engines: the bows are the battery ----
  {
    setup('as4');
    const line = [mk('defender', 'P', 22, 24), mk('defender', 'P', 22, 26)];
    const bows = [mk('archer', 'P', 21, 25), mk('archer', 'P', 21, 24)];
    const ids = [...line, ...bows].map(u => u.id);
    const bar = Bld.place('A', 'barracks', 30, 25, { free: true, instant: true });
    Units.siegeOrder(ids, bar);
    ck('bowsStandInForGuns', bows.every(u => u.tBld === bar.id), '');
    const hp0 = bar.hp;
    let lineBattered = false;
    run(14, null, () => { for (const u of line) if (u.tBld) lineBattered = true; });
    ck('arrowsWorkTheTarget', bar.hp < hp0 && !lineBattered, `barracks ${Math.round(bar.hp)}/${bar.maxhp}`);
  }

  // ---- 5. the group panel offers the three doctrines and arms them ----
  {
    setup('as5');
    const party = [mk('defender', 'P', 22, 25), mk('archer', 'P', 22, 26)];
    UI.sel = { type: 'group', ids: party.map(u => u.id) };
    UI.renderPanel();
    const btns = [...document.querySelectorAll('#panel [data-act="gstrat"]')].map(b2 => b2.dataset.strat);
    ck('panelOffersThreeDoctrines', btns.join(',') === 'siege,chaos,strike', btns.join(','));
    document.querySelector('#panel [data-act="gstrat"][data-strat="strike"]').click();
    ck('tapArmsTheDoctrine', party.every(u => u.strat === 'strike'), '');
    document.querySelector('#panel [data-act="gstrat"][data-strat="strike"]').click();
    ck('secondTapStandsItDown', party.every(u => !u.strat), '');
  }

  // ---- 6. the rival fights under the same flags ----
  {
    setup('as6');
    const withGuns = [{ kind: 'catapult' }, { kind: 'defender' }];
    const noGuns = [{ kind: 'defender' }, { kind: 'archer' }];
    ck('aiStanceMapping', AI._assaultStance(withGuns, 'HIGHREACH') === 'siege' &&
      AI._assaultStance(noGuns, 'WARHORN') === 'strike' &&
      AI._assaultStance(noGuns, 'MUDLARK') === 'strike' &&
      AI._assaultStance(noGuns, 'HIGHREACH') === 'chaos', '');
    // a strike column marches past the snack it would normally grab
    const raider = mk('defender', 'A', 24, 25);
    raider.task = { type: 'raid' }; raider.strat = 'strike';
    S.ai.raidObj = { type: 'tc', x: 15, y: 25 };
    const snack = mk('villager', 'P', 24, 28);   // beside the escort's road, well clear of the guns
    Combat.raiderSeek(raider);
    const ignored = raider.tUnit === 0;
    raider.strat = null; raider.path = null;
    Combat.raiderSeek(raider);
    ck('aiStrikeSkipsTheSnack', ignored && raider.tUnit === snack.id,
      `strike ignored it; without the doctrine it locked ${raider.tUnit === snack.id}`);
    // a siege escort belongs to the guns: it ignores the snack and guards them
    const gun = mk('catapult', 'A', 30, 25); gun.task = { type: 'raid' };
    const escort = mk('defender', 'A', 24, 25);
    escort.task = { type: 'raid' }; escort.strat = 'siege'; escort.tUnit = 0;
    Combat.raiderSeek(escort);
    const guarded = escort.tUnit === 0 && !!escort.path;   // walking to the guns, not the villager
    const threat = mk('defender', 'P', 31, 25);
    escort.path = null;
    Combat.raiderSeek(escort);
    ck('aiSiegeEscortGuardsTheGuns', guarded && escort.tUnit === threat.id,
      `moved to guns=${guarded}, then engaged the threat at the guns=${escort.tUnit === threat.id}`);
  }

  return { res, fails };
});
console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL ARMY-STRATEGIES CHECKS PASS');
console.log('errors:', errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e)));
await b.close();
process.exit(out.fails.length ? 1 : 0);
