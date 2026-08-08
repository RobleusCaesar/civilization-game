/* WALL-LINE CONTRACT — a building must never be part of the wall line.
   A farm has 100 hp where a wall has 300–2600, and (the real killer) it does
   not block movement at all: Path.passable stops only on wall/gate. So a hut
   standing in the ring is a door an attacker walks through without swinging.

   UPDATE — buildings are SOLID now (Bld.solid, tests/buildings-block.mjs):
   everything but the worker plots (farm, lodge, lumber camp, quarry) blocks
   movement for every owner. The AI's own line still may not be MADE of
   buildings, which is what this file polices; and a "soft door" in the
   player's ring is now only ever a walkable plot — a farm really is a gap,
   a house is not (AI.foeSoftDoors filters on Bld.solid).

   Run this after touching any of:
     ai.js — plot, towerSpot, wallCenter/wallRing/onWallLine, wallAudit,
             _detourTiles, wallDetour, wallRelocate, mendWallLine, maybeWalls,
             playerLanes, foeSoftDoors, _campScore
     buildings.js — tileFree, canPlace, blockAt, removeToRuin, forts
     map.js — Path.passable
     config.js — wall/gate/tower defs, BUILDINGS[*].size

       node tests/wall-line.mjs      # exits non-zero on any regression

   The invariants:
     1. RESERVE   — plot()/towerSpot() never site anything on the intended ring
     2. DETOUR    — a friendly building the wall reaches is bulged AROUND, not
                    skipped, and the bulge genuinely seals it
     3. RELOCATE  — when the ground won't take a bulge, the building moves
                    inside the perimeter (and is NOT simply lost)
     4. BREACH    — a razed section inside a finished stretch is re-closed
     5. SOFT DOOR — a building embedded in the PLAYER's ring lowers that lane's
                    defence and raises WARHORN: the mistake is punished, not
                    only avoided
     6. NO DOORS  — the end state that actually matters: no ring tile is
                    passable from outside AND inside at once
   If a feature genuinely needs different behaviour, update this file in the
   same commit and say so in the commit message. */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const b = await pw.chromium.launch();
const p = await b.newPage({ viewport: { width: 900, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto('file://' + join(root, 'index.html'), { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(900);

const out = await p.evaluate(() => {
  const res = {}; const fails = [];
  const ck = (name, ok, info) => { res[name] = (ok ? 'PASS' : 'FAIL') + (info ? ' — ' + info : ''); if (!ok) fails.push(name); };
  const setup = (seed, day) => {
    G.newGame(seed, 'moderate', 'large'); Screens.show('playing'); S.paused = true;
    S.day = day || 40; G.updateVisibility(); AI.assess();
    return Bld.tcOf('A');
  };
  // is any tile of the intended ring held by a friendly non-fort building?
  const softOnLine = (owner) => {
    const tc = Bld.tcOf(owner); if (!tc) return [];
    const cx = Bld.cx(tc) | 0, cy = Bld.cy(tc) | 0, R = AI.WALL_R, bad = [];
    for (const bb of S.buildings) {
      if (bb.owner !== owner || bb.key === 'wall' || bb.key === 'gate') continue;
      const sz = Bld.size(bb.key);
      for (let dy = 0; dy < sz; dy++) for (let dx = 0; dx < sz; dx++) {
        const x = bb.x + dx, y = bb.y + dy;
        if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) === R) bad.push(bb.key + '@' + x + ',' + y);
      }
    }
    return bad;
  };

  // ---- 1. RESERVE: plot() and towerSpot() refuse the line ----
  {
    const tc = setup('wg1');
    let onLine = 0, tried = 0;
    for (const key of ['farm', 'house', 'lumber', 'quarry', 'barracks', 'range', 'stable', 'lodge', 'tower', 'market']) {
      for (let i = 0; i < 40; i++) {
        const s = AI.plot(key);
        if (!s) continue;
        tried++;
        if (AI.onWallLine(s.x, s.y, tc)) onLine++;
      }
    }
    ck('reserve', tried > 100 && onLine === 0, `${onLine}/${tried} plots landed on the line`);
    // walls and gates must still be allowed there
    const w = AI.plot('wall');
    ck('reserveAllowsWall', !!w, w ? 'wall siting still works' : 'wall plot returned null');
  }

  // ---- 2. DETOUR: a farm the wall reaches gets enclosed, not skipped ----
  {
    const tc = setup('wg2');
    const cx = Bld.cx(tc) | 0, cy = Bld.cy(tc) | 0, R = AI.WALL_R;
    S.ai.res = { food: 900, wood: 900, stone: 900, gold: 900 };
    S.ai.acts = 99;
    // force a clean stretch of the north edge, plant a farm mid-line, wall either side
    const line = [];
    for (let dx = -2; dx <= 2; dx++) { const x = cx + dx, y = cy - R; G.clearFootprint(x, y, 'farm'); line.push([x, y]); }
    for (let dx = -3; dx <= 3; dx++) G.clearFootprint(cx + dx, cy - R - 1, 'farm');   // bulge room
    const farm = Bld.place('A', 'farm', cx, cy - R, { free: true, instant: true });
    let sides = 0;
    for (const dx of [-2, -1, 1, 2]) if (Bld.place('A', 'wall', cx + dx, cy - R, { free: true, instant: true })) sides++;
    const before = AI.wallAudit(tc);
    const reached = before.soft.filter(f => f.reached).length;
    const acted = AI.mendWallLine(tc);
    const after = AI.wallAudit(tc);
    // the bulge: the three tiles at R+1 spanning the farm
    const bulge = [-1, 0, 1].filter(dx => { const bb = Bld.at(cx + dx, cy - R - 1); return bb && AI.isFort(bb); }).length;
    ck('detourSetup', !!farm && sides === 4 && reached === 1, `farm=${!!farm} sides=${sides} reached=${reached}`);
    ck('detour', acted && bulge === 3 && !!Bld.at(cx, cy - R), `acted=${acted} bulge=${bulge}/3 farmKept=${!!Bld.at(cx, cy - R)}`);
    // and the farm is now genuinely enclosed ONCE THE CREWS FINISH: a section
    // under construction is passable until it's done (Bld.rebuildBlock skips
    // it — tests/work-order.mjs), so finish the fresh sections first, as a
    // day of building would
    for (const w of S.buildings) if (w.owner === 'A' && (w.key === 'wall' || w.key === 'gate') && w.construction > 0) Bld.finish(w);
    const openFromOut = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0]]
      .filter(([ox, oy]) => Path.passable(cx + ox, cy - R + oy, 'P')).length;
    ck('detourSeals', openFromOut === 0, `${openFromOut} passable approaches remain`);
    ck('detourCounted', (S.ai.wallFix || {}).detour === 1, JSON.stringify(S.ai.wallFix));
  }

  // ---- 3. RELOCATE: no room to bulge -> the building moves inside ----
  {
    const tc = setup('wg3');
    const cx = Bld.cx(tc) | 0, cy = Bld.cy(tc) | 0, R = AI.WALL_R;
    S.ai.res = { food: 900, wood: 900, stone: 900, gold: 900 };
    S.ai.acts = 99;
    for (let dx = -2; dx <= 2; dx++) G.clearFootprint(cx + dx, cy - R, 'farm');
    /* A FARM NEEDS SPENT SOIL TO MOVE TO (tests/worked-ground.mjs): a station
       may only stand on ground its own resource was worked out of, so the
       relocation has nowhere to go unless the town has some. Lay a little
       inside the ring — which is what a village that has been farming for a
       season actually looks like. */
    for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
      const bx = cx + dx, by = cy + dy;
      if (!MapGen.onBoard(bx, by) || Bld.at(bx, by)) continue;
      if (S.map.terrain[MapGen.idx(bx, by)] === T.GRASS) S.map.terrain[MapGen.idx(bx, by)] = T.BARREN;
    }
    Bld._block = null;
    const farm = Bld.place('A', 'farm', cx, cy - R, { free: true, instant: true });
    for (const dx of [-1, 1]) Bld.place('A', 'wall', cx + dx, cy - R, { free: true, instant: true });
    // block the bulge with a friendly HOUSE the detour can't build through
    for (let dx = -1; dx <= 1; dx++) G.clearFootprint(cx + dx, cy - R - 1, 'house');
    Bld.place('A', 'house', cx, cy - R - 1, { free: true, instant: true });
    const id = farm.id, n0 = Bld.list('A').filter(x => x.key === 'farm').length;
    const acted = AI.mendWallLine(tc);
    const gone = !Bld.get(id);
    const n1 = Bld.list('A').filter(x => x.key === 'farm').length;
    const nowOnLine = softOnLine('A').filter(s => s.startsWith('farm')).length;
    ck('relocate', acted && gone && n1 === n0 && nowOnLine === 0,
      `acted=${acted} removed=${gone} farms ${n0}->${n1} stillOnLine=${nowOnLine}`);
    ck('relocateCounted', (S.ai.wallFix || {}).relocate === 1, JSON.stringify(S.ai.wallFix));
  }

  // ---- 4. BREACH: a hole punched in a finished stretch is re-closed ----
  {
    const tc = setup('wg4');
    const cx = Bld.cx(tc) | 0, cy = Bld.cy(tc) | 0, R = AI.WALL_R;
    S.ai.res = { food: 900, wood: 900, stone: 900, gold: 900 };
    S.ai.acts = 99;
    for (let dx = -2; dx <= 2; dx++) G.clearFootprint(cx + dx, cy - R, 'wall');
    let laid = 0;
    for (let dx = -2; dx <= 2; dx++) if (Bld.place('A', 'wall', cx + dx, cy - R, { free: true, instant: true })) laid++;
    // raze the middle section, as a catapult would
    const mid = Bld.at(cx, cy - R); if (mid) Bld.removeToRuin(mid);
    const audit = AI.wallAudit(tc);
    const flagged = audit.breach.some(h => h.x === cx && h.y === cy - R);
    const acted = AI.mendWallLine(tc);
    const closed = AI.isFort(Bld.at(cx, cy - R));
    ck('breachDetect', laid === 5 && flagged, `laid=${laid} flagged=${flagged}`);
    ck('breachClose', acted && closed, `acted=${acted} closed=${closed}`);
    // …and it happens even when the tier gate would normally stop new frontage
    ck('breachCounted', (S.ai.wallFix || {}).breach === 1, JSON.stringify(S.ai.wallFix));
  }

  // ---- 5. SOFT DOOR on the PLAYER's ring lowers that lane's defence ----
  {
    const tc = setup('wg5');
    const ptc = Bld.tcOf('P');
    const cx = Math.round(ptc.x + Bld.size('tc') / 2), cy = Math.round(ptc.y + Bld.size('tc') / 2);
    S.ai.knownB = S.ai.knownB || {};
    S.ai.knownB[MapGen.idx(ptc.x, ptc.y)] = { key: 'tc', level: 1, owner: 'P', x: ptc.x, y: ptc.y, seen: S.day };
    // remember a walled stretch on the north side with a FARM in the middle of it
    const y = cy - 6;
    for (const dx of [-2, -1, 1, 2]) S.ai.knownB[MapGen.idx(cx + dx, y)] = { key: 'wall', level: 1, owner: 'P', x: cx + dx, y, seen: S.day };
    const lanesNoDoor = AI.playerLanes();
    const northNoDoor = lanesNoDoor.find(l => l.dir.y < 0);
    S.ai.knownB[MapGen.idx(cx, y)] = { key: 'farm', level: 1, owner: 'P', x: cx, y, seen: S.day };
    const doors = AI.foeSoftDoors();
    const lanes = AI.playerLanes();
    const north = lanes.find(l => l.dir.y < 0);
    ck('softDoorFound', doors.length === 1 && doors[0].key === 'farm', JSON.stringify(doors.map(d => d.key)));
    ck('softDoorLane', !!north && north.door >= 1 && !!northNoDoor && north.def < northNoDoor.def,
      north ? `door=${north.door} def ${northNoDoor && northNoDoor.def}->${north.def}` : 'no north lane');
    // and WARHORN — storm it — scores higher for it
    const ctx0 = { landToTown: true, openSeam: { width: 4, def: 2 }, softDoor: 0 };
    const ctx1 = { landToTown: true, openSeam: { width: 4, def: 2 }, softDoor: 1 };
    ck('softDoorScore', AI._campScore('WARHORN', ctx1) > AI._campScore('WARHORN', ctx0),
      `${AI._campScore('WARHORN', ctx0)} -> ${AI._campScore('WARHORN', ctx1)}`);
  }

  /* ---- 7. THE TOWN MUST HAVE A WAY OUT. A wall that seals the town seals the
     ARMY in: a real game reached day 214 with a complete ring, water on the
     fourth side, the one gate opening onto that water, sixty-nine reachable
     tiles and the host stranded. And because a sealed ring has NO open seams,
     read.homeGapCount is zero and the wall utility that would have noticed is
     never even scored — so the check lives in digAndProtect, not maybeWalls. */
  {
    const tc = setup('wg7');
    const cx = Bld.cx(tc) | 0, cy = Bld.cy(tc) | 0, R = AI.WALL_R;
    S.ai.res = { food: 900, wood: 900, stone: 900, gold: 900 };
    S.ai.acts = 99;
    // ring the rival's own town completely, by hand
    let laid = 0;
    for (const [x, y] of AI.wallRing(tc)) {
      if (!MapGen.inB(x, y) || Bld.at(x, y)) continue;
      G.clearFootprint(x, y, 'wall');
      if (Bld.canPlace('A', 'wall', x, y).ok && Bld.place('A', 'wall', x, y, { free: true, instant: true })) laid++;
    }
    const sealed = !AI.townOut(tc);
    ck('sealDetected', laid > 8 && sealed, `laid ${laid} sections, sealed=${sealed}`);
    // the last section closing the ring must never be laid in the first place
    const anyWouldSeal = AI.wallRing(tc).some(([x, y]) => AI.wallWouldSeal(tc, x, y));
    // …and a town already shut cuts itself a door
    const opened = AI.openTheGate(tc);
    ck('sealSelfHeals', opened && AI.townOut(tc), `openTheGate=${opened} nowOpen=${AI.townOut(tc)}`);
    // the door it cut leads to real ground, not into a lake
    const out = AI.wallRing(tc).filter(([x, y]) => !Bld.at(x, y) && Path.passable(x, y, 'A'));
    ck('doorLeadsSomewhere', out.length > 0 && out.some(([x, y]) =>
      [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ox, oy]) => {
        const nx = x + ox, ny = y + oy;
        return Math.max(Math.abs(nx - cx), Math.abs(ny - cy)) > R && MapGen.inB(nx, ny) && Path.passable(nx, ny, 'A');
      })), `${out.length} open ring tiles`);
    // and the clamp refuses to re-close it
    const reclose = out.filter(([x, y]) => AI.wallWouldSeal(tc, x, y)).length;
    ck('clampRefusesToReseal', reclose > 0 && anyWouldSeal !== null,
      `${reclose} of ${out.length} openings are recognised as the last way out`);
    AI.maybeWalls(tc);                       // a full build cycle must not shut it again
    ck('maybeWallsKeepsItOpen', AI.townOut(tc), 'still open after a wall pass');
  }

  // ---- 6. NO DOORS: a walled stretch with a hut in it must end up with no
  //         ring tile that is passable from OUTSIDE and INSIDE at once ----
  {
    const tc = setup('wg6');
    const cx = Bld.cx(tc) | 0, cy = Bld.cy(tc) | 0, R = AI.WALL_R;
    S.ai.res = { food: 900, wood: 900, stone: 900, gold: 900 };
    S.ai.acts = 99;
    for (let dx = -3; dx <= 3; dx++) { G.clearFootprint(cx + dx, cy - R, 'farm'); G.clearFootprint(cx + dx, cy - R - 1, 'farm'); }
    Bld.place('A', 'farm', cx, cy - R, { free: true, instant: true });
    Bld.place('A', 'house', cx + 2, cy - R, { free: true, instant: true });
    for (const dx of [-3, -2, -1, 1, 3]) Bld.place('A', 'wall', cx + dx, cy - R, { free: true, instant: true });
    const doors = () => {
      const pass = (x, y) => MapGen.inB(x, y) && Path.passable(x, y, 'P');
      const cheb = (x, y) => Math.max(Math.abs(x - cx), Math.abs(y - cy));
      const N = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
      let n = 0;
      for (let dx = -3; dx <= 3; dx++) {
        const x = cx + dx, y = cy - R;
        if (!pass(x, y)) continue;
        if (N.some(([a, c]) => cheb(x + a, y + c) > R && pass(x + a, y + c)) &&
            N.some(([a, c]) => cheb(x + a, y + c) < R && pass(x + a, y + c))) n++;
      }
      return n;
    };
    const before = doors();
    // a handful of build cycles — each followed by its crews finishing, since
    // a section under construction stays passable (tests/work-order.mjs)
    for (let i = 0; i < 8; i++) {
      AI.mendWallLine(tc);
      for (const w of S.buildings) if (w.owner === 'A' && (w.key === 'wall' || w.key === 'gate') && w.construction > 0) Bld.finish(w);
    }
    const after = doors();
    ck('noDoors', before > 0 && after === 0, `${before} doors -> ${after}`);
  }

  /* ---- 8. POCKET CORK: the army must be able to MARCH. townOut() polices
     the RING (Chebyshev-R escape), so a town backed into a terrain pocket
     BIGGER than its ring reads "open" even when a wall line plugging the
     pocket's one pass has sealed the army off the map — a real day-208 game
     corked its only pass with a straight 8-section line, no gate anywhere,
     and parked its whole host. Ground truth is corkedGround (flood as-is vs
     flood pretending own walls open); the cure is cutTheCork (raze the cork,
     daily, even when broke); prevention is the cork clamp in maybeWalls /
     mendWallLine (never lay the corking stone — and a SITE under
     construction counts as a wall-to-be, or two half-built sections of the
     closing line would vouch for each other). ---- */
  {
    const tc = setup('wg8');
    tc.x = 30; tc.y = 12; Bld._block = null;
    for (let y = 4; y <= 20; y++) for (let x = 20; x <= 44; x++)
      if (MapGen.inB(x, y)) S.map.terrain[MapGen.idx(x, y)] = T.GRASS;
    // the pocket: water-ringed x 27..37 / y 7..17, one 3-wide pass west at x=26
    for (let y = 6; y <= 18; y++) for (const x of [26, 38])
      if (!(x === 26 && y >= 11 && y <= 13)) S.map.terrain[MapGen.idx(x, y)] = T.WATER;
    for (let x = 26; x <= 38; x++) for (const y of [6, 18]) S.map.terrain[MapGen.idx(x, y)] = T.WATER;
    S.ai.res = { food: 900, wood: 900, stone: 900, gold: 900 };
    S.ai.acts = 99;
    const pass = [[26, 11], [26, 12], [26, 13]];
    for (const [x, y] of pass) Bld.place('A', 'wall', x, y, { free: true, instant: true });
    const wallsN = () => S.buildings.filter(b2 => b2.owner === 'A' && b2.key === 'wall').length;
    const n0 = wallsN();
    ck('ringIllusion', AI.townOut(tc) === true, 'the pocket outsizes the ring, so townOut reads open');
    ck('mapTruthSeesTheCork', !!AI.corkedGround(tc), '');
    // the cure — and it must run even when the tribe is BROKE (the daily hook
    // sits before maybeWalls' wood gate)
    S.ai.res.wood = 0;
    AI.maybeWalls(tc);
    const n1 = wallsN();
    const opened = pass.find(([x, y]) => !Bld.at(x, y));
    ck('corkIsCut', n1 === n0 - 1 && !!opened && !AI.corkedGround(tc), `walls ${n0}->${n1}`);
    const path = Path.find(31, 12, 21, 12, 'A');
    const end = path && path.length ? path[path.length - 1] : null;
    ck('armyMarchesOut', !!end && Math.hypot(end.x - 21, end.y - 12) < 1.1,
      end ? `path ends at ${end.x},${end.y}` : 'no path');
    // prevention — the clamp refuses the re-corking stone on the cut tile
    ck('clampRefusesTheCorkingStone', !!AI.corkedGround(tc, { x: opened[0], y: opened[1] }), '');
    // intent counts — a SITE on the cut tile corks just the same, even though
    // movement still passes through it while it raises
    S.ai.res.wood = 900;
    const site = Bld.place('A', 'wall', opened[0], opened[1]);
    ck('siteIsAWallToBe', !!site && site.construction > 0 && !!AI.corkedGround(tc),
      site ? `construction=${+site.construction.toFixed(2)}` : 'site failed to place');
    if (site) Bld.removeToRuin(site);
  }

  /* ---- 7. A SHOOTING GALLERY IS NOT A BUILDING SITE ----
     A real day-146 game: the player parked two catapults on the far bank of a
     channel and shelled the rival's shoreline tower. The chief rebuilt it
     TWELVE times in seventeen days — towerSpot scores a site on what it
     covers and knew nothing about who could shoot it, and its own "reinforce
     the flank the player keeps hitting" bias steered it back to the shore
     every time. Ground our own hands cannot walk to, that an enemy CAN stand
     on, is a gun position; anything of ours within a catapult's throw of one
     is a gallery, and a gallery is not a site. */
  {
    G.newGame('gallery', 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    const tc = Bld.tcOf('A');
    // flatten the chief's ground, then cut a CHANNEL through it: the far bank
    // is land an enemy can stand on and no hand of ours can reach
    for (let y = tc.y - 12; y <= tc.y + 12; y++) for (let x = tc.x - 16; x <= tc.x + 16; x++) {
      if (!MapGen.onBoard(x, y)) continue;
      S.map.terrain[MapGen.idx(x, y)] = T.GRASS;
    }
    for (const b of S.buildings.slice())
      if (b.owner === 'A' && b.key !== 'tc') Bld.removeToRuin(b);
    const CH = tc.x - 6;                      // the channel, four tiles wide
    for (let y = tc.y - 12; y <= tc.y + 12; y++)
      for (let x = CH - 3; x <= CH; x++)
        if (MapGen.onBoard(x, y)) S.map.terrain[MapGen.idx(x, y)] = T.WATER;
    Bld._block = null; AI._gallery = null; AI._reachDay = -1;
    const far = { x: CH - 5, y: tc.y }, near = { x: CH + 2, y: tc.y }, home = { x: tc.x + 4, y: tc.y };
    const reach = AI.aiLandReach();
    ck('theFarBankIsOutOfOurReach',
      Path.passable(far.x, far.y, 'P') && !reach[MapGen.idx(far.x, far.y)],
      'a gun can stand there and no hand of ours can walk to it');
    ck('soTheNearBankIsAGallery', AI.inGallery(near.x, near.y) === true,
      Math.round(Math.hypot(near.x - far.x, near.y - far.y)) + ' tiles from the far bank, ' +
      'a catapult throws ' + CFG.UNITS.catapult.rng);
    ck('andHomeGroundIsNot', AI.inGallery(home.x, home.y) === false, '');
    ck('theRadiusIsTheEnginesOwn', AI.galleryR() === CFG.UNITS.catapult.rng + 1,
      'derived from the common engine, never hand-picked');
    // …and NO tower is ever sited in it
    let inGal = 0, sited = 0;
    for (let i = 0; i < 30; i++) {
      const s = AI.plot('tower');
      if (!s) continue;
      sited++;
      if (AI.inGallery(s.x, s.y)) inGal++;
    }
    ck('noTowerIsRaisedInIt', sited > 0 && inGal === 0,
      sited + ' sites offered, ' + inGal + ' of them in the gallery');
    // an ordinary building is only PENALISED — a town backed against an
    // unreachable bank still has to be built somewhere
    let houseGal = 0;
    for (let i = 0; i < 30; i++) { const s = AI.plot('house'); if (s && AI.inGallery(s.x, s.y)) houseGal++; }
    ck('andHutsSettleInland', houseGal <= 3, houseGal + '/30 huts fell in the gallery');
  }

  /* ---- 8. AND WE DO NOT REBUILD INTO OUR OWN ASHES ----
     The general backstop, for whatever the gallery rule cannot measure — a
     trebuchet outranging it, a bombard's deck, a lane the reach flood happens
     to include. Two losses on a spot and the chief stops offering it a third. */
  {
    const tc = Bld.tcOf('A');
    const spot = { x: tc.x + 5, y: tc.y + 2 };
    S.ai.lostAt = {};
    ck('freshGroundIsFine', AI.burnedGround(spot.x, spot.y) === false, '');
    AI.noteLoss(spot.x, spot.y);
    ck('oneLossIsBadLuck', AI.burnedGround(spot.x, spot.y) === false,
      'a single burned hut is not a lesson');
    AI.noteLoss(spot.x, spot.y);
    ck('twiceIsAPattern', AI.burnedGround(spot.x, spot.y) === true, '');
    ck('andItSpreadsToTheGroundBesideIt',
      AI.burnedGround(spot.x + 1, spot.y) === true &&
      AI.burnedGround(spot.x + 3, spot.y) === false,
      'the neighbouring tile is the same spot; three over is not');
    // a DESTROYED rival building stamps it — that is where the memory comes from
    S.ai.lostAt = {};
    const v = Bld.place('A', 'house', spot.x, spot.y, { free: true });
    Bld.finish(v); Bld.damage(v, 999999);
    ck('losingOneStampsTheGround', !!S.ai.lostAt[spot.x + ',' + spot.y],
      'Bld.damage records it, so nothing has to remember to call this');
    // …and the stamps age out: ground the front has moved away from is fair again
    S.ai.lostAt = { [spot.x + ',' + spot.y]: { n: 5, day: S.day - AI.LOST_DAYS - 1 } };
    ck('butOldAshesCoolOff', AI.burnedGround(spot.x, spot.y) === false,
      'after ' + AI.LOST_DAYS + ' days it is ordinary ground again');
    // and the refusal is REAL: burn the spot the chief keeps choosing, twice,
    // and it never offers that spot again
    S.ai.lostAt = {};
    const first = AI.plot('tower');
    ck('itHasASpotItLikes', !!first, first ? first.x + ',' + first.y : 'nowhere');
    AI.noteLoss(first.x, first.y); AI.noteLoss(first.x, first.y);
    let again = 0;
    for (let i = 0; i < 25; i++) {
      const s = AI.plot('tower');
      if (s && s.x === first.x && s.y === first.y) again++;
    }
    ck('andNeverOfferedAgain', again === 0,
      'twelve rebuilds into the same gallery is what this rule exists to stop');
  }

  /* ---- 9. ANSWER THE GUNS ----
     Refusing to feed a shooting gallery stops the bleeding; it does not answer
     it. A tribe shelled from ground it cannot walk to has ONE strategic
     problem — reach out and kill the battery — and everything else waits until
     it can. The tech tree decides what it races for: an engine of its own, or
     a BOMBARD SHIP, whose reach beats anything standing on the far bank
     (that Siege Workshop wants a level-3 hall). It stands down GUN_MEMORY days after the last
     gun is seen and goes back to attacking. */
  {
    G.newGame('guns', 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    const tc = Bld.tcOf('A');
    for (let y = tc.y - 12; y <= tc.y + 12; y++) for (let x = tc.x - 16; x <= tc.x + 16; x++)
      if (MapGen.onBoard(x, y)) S.map.terrain[MapGen.idx(x, y)] = T.GRASS;
    const CH = tc.x - 6;
    for (let y = tc.y - 12; y <= tc.y + 12; y++) for (let x = CH - 3; x <= CH; x++)
      if (MapGen.onBoard(x, y)) S.map.terrain[MapGen.idx(x, y)] = T.WATER;
    Bld._block = null; AI._gallery = null;
    S.ai.res = { food: 9999, wood: 9999, stone: 9999, gold: 9999 };
    S.ai.gunned = null;
    // the chief can see everything, so nothing here is about fog
    AI._vis = new Uint8Array(CFG.W * CFG.H).fill(1);
    // a catapult on the far bank, covering the ground the town lives on
    const gun = Units.spawn('catapult', 'P', CH - 4, tc.y);
    let seen = AI.seenGuns();
    ck('aGunOnGroundWeCannotWalkToIsSeen',
      seen.length === 1 && seen[0].id === gun.id,
      seen.length + ' guns, ' + Math.round(Math.hypot(gun.x - Bld.cx(tc), gun.y - Bld.cy(tc))) + ' tiles from the hall');
    // …but one we could walk up and kill is an ordinary fight, not a gallery
    const near = Units.spawn('catapult', 'P', tc.x + 4, tc.y + 1);
    ck('butOneWeCouldWalkToIsNot',
      AI.seenGuns().every(u => u.id !== near.id),
      'that is a fight, not a battery we cannot answer');
    S.units.splice(S.units.indexOf(near), 1);
    // …and one it has not laid eyes on is not read at all: fog-honest
    AI._vis = new Uint8Array(CFG.W * CFG.H);
    ck('andOneItCannotSeeIsNotReadAtAll', AI.seenGuns().length === 0, '');
    AI._vis = new Uint8Array(CFG.W * CFG.H).fill(1);
    // the memory: stamped when seen, held, then let go
    AI.noteGuns();
    ck('theGunIsRemembered', !!AI.underBombardment(), '');
    S.units.splice(S.units.indexOf(gun), 1);
    AI.noteGuns();
    ck('andStillRememberedAfterItStopsFiring', !!AI.underBombardment(),
      'the guns do not stop being a problem the instant they leave our sight');
    S.day += AI.GUN_MEMORY + 1; AI.noteGuns();
    ck('butLetGoOnceTheyAreGone', AI.underBombardment() === false,
      'a chief that wins the duel goes straight back to attacking');
  }
  {
    // WHAT IT RACES FOR: with the guns up, the day's hammer goes to the answer
    const tc = Bld.tcOf('A');
    tc.level = 2;
    S.ai.res = { food: 9999, wood: 9999, stone: 9999, gold: 9999 };
    S.ai.gunned = { day: S.day, x: Bld.cx(tc) - 10, y: Bld.cy(tc), n: 1 };
    S.ai.acts = 9;
    const had = new Set(Bld.list('A').map(b => b.key));
    let answered = null;
    for (let i = 0; i < 12 && !answered; i++) {
      AI.bestBuild(S.ai.read || {});
      for (const b of Bld.list('A'))
        if (!had.has(b.key) && (b.key === 'dock' || b.key === 'siege')) answered = b.key;
    }
    ck('theDaysHammerGoesToTheAnswer', !!answered,
      answered ? 'it raised a ' + answered : 'it built huts while being shelled');
    // …and a hull is the answer a young town actually has: the workshop wants
    // a level-3 hall, and this one is level 2
    ck('andAYoungTownReachesForAHull', answered === 'dock',
      'CFG.BUILDINGS.siege.reqTC is ' + CFG.BUILDINGS.siege.reqTC);
  }
  {
    // THE ORDER: an engine is walked to the FARTHEST tile it can still fire
    // from — standing at the edge of its own range is what keeps it out of the
    // reply — and one already in range is left alone to shoot.
    const tc = Bld.tcOf('A');
    const g = { x: Bld.cx(tc) - 10 | 0, y: Bld.cy(tc) | 0 };
    S.ai.gunned = { day: S.day, x: g.x, y: g.y, n: 1 };
    const spot = MapGen.findNear(tc.x + 5, tc.y, 6,
      (x, y) => Path.passable(x, y, 'A') && !Bld.at(x, y));
    const eng = Units.spawn('catapult', 'A', spot.x, spot.y);
    ck('itStartsOutOfRange', Math.hypot(eng.x - g.x, eng.y - g.y) > CFG.UNITS.catapult.rng, '');
    ck('theEngineIsSentToAnswer', AI.answerTheGuns() === true && !!eng.task,
      eng.task ? eng.task.type + ' → ' + eng.task.x + ',' + eng.task.y : 'it was left standing');
    const d = Math.hypot(eng.task.x - g.x, eng.task.y - g.y);
    ck('andSentToTheEdgeOfItsOwnRange',
      d <= CFG.UNITS.catapult.rng && d > CFG.UNITS.catapult.rng - 1.6,
      'it stops at ' + d.toFixed(1) + ' of ' + CFG.UNITS.catapult.rng +
      ' — walking closer only puts it in the reply');
    ck('andItStandsOnGroundOfItsOwn', Path.passable(eng.task.x, eng.task.y, 'A'), '');
    // one already in range is left where it is — it fires by itself
    eng.x = g.x + 2.5; eng.y = g.y + 0.5; eng.task = null;
    AI.answerTheGuns();
    ck('oneAlreadyInRangeIsLeftToShoot', !eng.task, '');
  }
  return { res, fails };
});
console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL CONTRACT CHECKS PASS');
console.log('errors:', errs.filter(e => !/supabase|fetch|TUNNEL/.test(e)).slice(0, 4));
await b.close();
process.exit(out.fails.length ? 1 : 0);
