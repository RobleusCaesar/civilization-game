/* TRAINED UNITS STAND ON OPEN GROUND — or wait until there is some.

   From a real day-100 game: a training yard hemmed in against the shore put
   fresh soldiers on a tile they could not walk off, and no order would move
   them. The cause was one line — the spawn searched radius 3 for an open tile
   and, failing, dropped the unit on a HARD-CODED `{ b.x, b.y + 1 }` that
   nothing ever checked for being walkable. Both of that fallback's outcomes
   are wrong: a unit inside solid ground is lost, and a unit in a one-tile
   pocket is stuck.

   The rules this file pins:

     REALLY OPEN      A spawn tile must be passable in the unit's own domain,
                      carry no building, AND have a passable neighbour — a
                      one-tile pocket traps a unit as surely as a wall.

     NOBODY IS LOST   With nowhere at all in reach the unit is NOT spawned: it
                      is held in reserve (b.hold), and the player is told why
                      in as many words. The warning is said once per spell,
                      not once per frame.

     THE RESERVE      The moment a tile opens the reserve walks out, in the
     COMES OUT        order it was trained, and the panel's own count falls to
                      nothing on its own.

     ONE HELPER       Bld.spawnSpotAt is the single room-checked search; the
                      start extras and the Town Center's two-survivor reprieve
                      carried the same unchecked fallback and now share it.

   Run after touching: Bld.update's training block, Bld.spawnRoom /
   spawnSpotAt / spawnSpot / releaseTrained / holdTrained / releaseHeld,
   UI.queueLine, or the reprieve / start-extra spawns in game.js.

     node tests/train-spawn.mjs      # exits non-zero on any regression */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });  // shipped PNGs bake into canvases the checks read — file:// must be same-origin
const p = await b.newPage({ viewport: { width: 500, height: 700 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto('file://' + join(root, 'index.html'), { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1000);

const out = await p.evaluate(async () => {
  const res = {}, fails = [];
  const ck = (n, ok, info) => { res[n] = ok ? 'PASS' + (info ? ' — ' + info : '') : 'FAIL ' + (info || ''); if (!ok) fails.push(n); };

  const fresh = (seed) => {
    G.newGame(seed, 'moderate', 'medium');
    Screens._demo = false; Screens.show('playing'); S.paused = true;
    Combat.scanT = 0; Units.herdClock = 0;
  };
  // wall a building in completely: every tile within r becomes mountain,
  // except the footprint itself
  const entomb = (bl, r) => {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = bl.x + dx, y = bl.y + dy;
      if (!MapGen.inB(x, y)) continue;
      if (Bld.covers(bl, x, y)) continue;
      S.map.terrain[MapGen.idx(x, y)] = T.MOUNTAIN;
    }
    Bld.__block = null; Bld._block = null;
  };
  const openOne = (bl, dx, dy) => {
    S.map.terrain[MapGen.idx(bl.x + dx, bl.y + dy)] = T.GRASS;
    Bld._block = null;
  };
  const put = (key, x, y, owner) => Bld.place(owner || 'P', key, x, y, { free: true, instant: true });
  const armyOf = (owner) => S.units.filter(u => u.owner === owner && Units.isMilitary(u));

  /* ---- 1. A SPAWN TILE IS REALLY OPEN ---- */
  {
    fresh('ts1');
    const tc = Bld.tcOf('P');
    const gx = tc.x + 6, gy = tc.y + 6;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++)
      S.map.terrain[MapGen.idx(gx + dx, gy + dy)] = T.GRASS;
    Bld._block = null;
    ck('openGroundIsOpen', Bld.spawnRoom('P', 'land', gx, gy) === true, '');
    S.map.terrain[MapGen.idx(gx, gy)] = T.MOUNTAIN; Bld._block = null;
    ck('blockedGroundIsRefused', Bld.spawnRoom('P', 'land', gx, gy) === false,
      'a unit inside a mountain is lost');
    // a ONE-TILE POCKET: open itself, sealed on all four sides
    S.map.terrain[MapGen.idx(gx, gy)] = T.GRASS;
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
      S.map.terrain[MapGen.idx(gx + ox, gy + oy)] = T.MOUNTAIN;
    Bld._block = null;
    ck('aOneTilePocketIsNotOpenGround', Bld.spawnRoom('P', 'land', gx, gy) === false,
      'passable, but there is no step off it');
  }

  /* ---- 2. A HEMMED-IN YARD HOLDS ITS SOLDIERS INSTEAD OF LOSING THEM ---- */
  {
    fresh('ts2');
    const tc = Bld.tcOf('P');
    const yard = put('barracks', tc.x + 5, tc.y + 5);
    ck('theYardStands', !!yard && Bld.done(yard), yard ? 'raised' : 'no barracks');
    entomb(yard, Bld.SPAWN_R + 2);
    ck('noSpotWhenEntombed', Bld.spawnSpot(yard, 'defender') === null, '');

    const army0 = armyOf('P').length;
    const logs0 = S.log.length;
    yard.queue = [{ unit: 'defender', t: 0.0001 }];
    Bld.update(1);                                   // the drill finishes
    ck('nobodyIsSpawnedIntoTheRock', armyOf('P').length === army0,
      'army ' + army0 + ' -> ' + armyOf('P').length);
    ck('theSoldierIsHeldInReserve', !!(yard.hold && yard.hold.length === 1),
      JSON.stringify(yard.hold || null));
    const said = S.log.slice(0, S.log.length - logs0).map(l => l.msg).join(' | ');
    ck('andThePlayerIsToldWhy', /no open ground/i.test(said) && /clear a path/i.test(said), said || '(nothing said)');

    // …and the warning is a STANDING CONDITION, said once, not once a frame
    const logs1 = S.log.length;
    yard.queue = [{ unit: 'defender', t: 0.0001 }];
    Bld.update(1);
    for (let i = 0; i < 20; i++) Bld.update(0.05);
    ck('theWarningIsSaidOnceNotEveryFrame', S.log.length - logs1 <= 1,
      (S.log.length - logs1) + ' new lines while blocked');
    ck('everyBlockedSoldierIsKept', yard.hold.length === 2, yard.hold.length + ' in reserve');

    // the panel says so too, and its count is the reserve's own
    ck('thePanelShowsTheReserve', /2 waiting/.test(UI.queueLine(yard)), UI.queueLine(yard));

    /* ---- 3. CLEAR A PATH AND THE RESERVE WALKS OUT ---- */
    openOne(yard, 0, Bld.size(yard));                // one tile at the doorstep
    openOne(yard, 0, Bld.size(yard) + 1);            // …and somewhere to step
    ck('aClearedTileIsFoundAgain', !!Bld.spawnSpot(yard, 'defender'),
      JSON.stringify(Bld.spawnSpot(yard, 'defender')));
    Bld.update(0.05);
    ck('theReserveIsReleased', armyOf('P').length === army0 + 2,
      'army ' + army0 + ' -> ' + armyOf('P').length);
    ck('andTheReserveIsEmpty', yard.hold.length === 0, yard.hold.length + ' left');
    ck('thePanelStopsWarning', !/waiting/.test(UI.queueLine(yard)), UI.queueLine(yard));
    // every released soldier stands somewhere it can actually move from
    const stuck = armyOf('P').filter(u => !Path.passable(u.x | 0, u.y | 0, "P", "land"));
    ck('nobodyStandsInSolidGround', stuck.length === 0, stuck.length + ' stuck');
  }

  /* ---- 4. THE ORDINARY CASE IS UNCHANGED ---- */
  {
    fresh('ts4');
    const tc = Bld.tcOf('P');
    const yard = put('barracks', tc.x + 4, tc.y + 4);
    const army0 = armyOf('P').length;
    yard.queue = [{ unit: 'defender', t: 0.0001 }];
    Bld.update(1);
    ck('anOpenYardSpawnsAtOnce', armyOf('P').length === army0 + 1 && !(yard.hold || []).length,
      'army ' + army0 + ' -> ' + armyOf('P').length);
    const nu = armyOf('P')[armyOf('P').length - 1];
    ck('andItStandsOnItsOwnDoorstep', Math.hypot(nu.x - yard.x, nu.y - yard.y) <= Bld.SPAWN_R + 2,
      'at ' + nu.x.toFixed(1) + ',' + nu.y.toFixed(1) + ' from yard ' + yard.x + ',' + yard.y);
  }

  /* ---- 5. THE RESERVE RIDES IN THE SAVE ---- */
  {
    fresh('ts5');
    const tc = Bld.tcOf('P');
    const yard = put('barracks', tc.x + 5, tc.y + 5);
    entomb(yard, Bld.SPAWN_R + 2);
    yard.queue = [{ unit: 'archer', t: 0.0001 }];
    Bld.update(1);
    const before = (yard.hold || []).length;
    const json = JSON.parse(JSON.stringify(G.saveJSON ? G.saveJSON() : S));
    G.loadJSON(json);
    const back = S.buildings.find(x => x.key === 'barracks' && x.owner === 'P');
    ck('theReserveSurvivesASaveRoundTrip', !!back && (back.hold || []).length === before,
      before + ' held -> ' + ((back && back.hold) || []).length);
  }

  /* ---- 6. ONE HELPER, SHARED BY EVERY SPAWN THAT STANDS A UNIT DOWN ---- */
  {
    const src = Bld.spawnSpotAt.toString();
    ck('spawnSpotAtIsTheOneSearch', /spawnRoom/.test(src), 'it asks spawnRoom');
    ck('theHardCodedFallbackIsGone',
      !/\|\|\s*\{\s*x:\s*b\.x,\s*y:\s*b\.y\s*\+\s*1\s*\}/.test(Bld.update.toString()),
      'no unchecked { b.x, b.y + 1 } in the training block');
  }

  return { res, fails };
});

console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL TRAIN-SPAWN CHECKS PASS');
const realErrs = errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e));
console.log('errors:', realErrs.slice(0, 4));
await b.close();
if (out.fails.length || realErrs.length) process.exit(1);
