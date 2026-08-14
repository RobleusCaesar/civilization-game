/* BURN-DOWN CONTRACT — a damaged building shows how far gone it is
   (Bld.burnPhase, keyed to hp so the fire burns until repair puts it out):

     phase 0  first third lost   — SMALL fires on the roof and at the foot,
              the building's own sprite untouched
     phase 1  badly hurt         — BIG fires, the sprite scorched DARKER
              (R.darkOf, cached per base canvas)
     phase 2  the LAST CFG.RUIN_AT of the hp bar — a partially-DESTROYED look
              (R.ruinOf: crown bitten out, remains charred, rafter stubs +
              embers), the fires guttering small again

   Phase 2 waits deliberately late. It is the last look a building shows
   before it comes down, so it belongs to the final tenth of the hp bar; held
   at a third, a building spent most of a long fight already looking ruined
   and the moment it actually fell read as nothing happening.

   And when a building whose kind is in R.COLLAPSE is DESTROYED, it TOPPLES
   once on screen in a cloud of dust (R.startCollapse / collapseSheet /
   drawCollapses). The registry is the extension point — a key in R.COLLAPSE
   is all a building needs, and authored `misc/<key>Fall1..N` art takes over
   the whole animation if it exists. Only the TOWER is registered today;
   walls, gates and every other building must come down exactly as before.

   The flames are misc/flameSmall/0..3 and misc/flameBig/0..3 — four-frame
   animated fire, opaque flame on transparent ground, drawn OVER the
   building via Assets.drawSprite (render.js drawBurn). Work sites burn too.

   And a destroyed building leaves an ASH PILE (S.ashes, R.ashOf) generated
   from the building's own sprite silhouette — unique per building — that
   blocks BUILDING (never movement) on its footprint for CFG.ASH_DAYS (5),
   then cools away in G.dayTick. Walls/gates are exempt (a breached line
   must stay instantly mendable — AI.mendWallLine depends on it); a broken
   dock washes into open water and leaves nothing. Ash rides in every save;
   legacy saves backfill to [].

   Run this after touching any of:
     buildings.js — burnPhase / ashAt / damage / tileFree / canPlace
     render.js — drawBurn / darkOf / ruinOf / ashOf / the building draw
                 COLLAPSE / startCollapse / collapseSheet / drawCollapses
     sprites.js — the flame frames
     config.js — RUIN_AT, ASH_DAYS
     game.js — dayTick ash expiry, newGame/loadJSON ashes field

     node tests/burn-down.mjs      # exits non-zero on any regression */
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
  const px = (c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 10) n++; return n; };
  const avgLum = (c) => {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let s = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 96) { s += d[i] + d[i + 1] + d[i + 2]; n++; }
    return n ? s / n : 0;
  };

  // ---- 1. the flame animation: 4 frames, two sizes, opaque fire on a
  // transparent ground, frames genuinely animate ----
  {
    const S1 = Sprites.misc.flameSmall, B1 = Sprites.misc.flameBig;
    ck('flameFramesExist',
      Array.isArray(S1) && S1.length === 4 && Array.isArray(B1) && B1.length === 4 &&
      S1.every(c => c && c.width === 64) && B1.every(c => c && c.width === 64), '4+4 frames at 64px');
    ck('flamesHaveFireAndAir',
      S1.every(c => px(c) > 60) && B1.every(c => px(c) > 200) &&
      S1.every(c => px(c) < 64 * 64 * 0.5),
      'opaque flame, transparent ground');
    ck('flamesAnimate',
      S1[0].toDataURL() !== S1[1].toDataURL() && S1[1].toDataURL() !== S1[2].toDataURL() &&
      B1[0].toDataURL() !== B1[3].toDataURL(), 'frames differ');
    ck('bigBurnsHotter', px(B1[0]) > px(S1[0]) * 1.8, 'the blaze is genuinely bigger');
  }

  // ---- 2. burnPhase: hp-keyed, and the RUINED look waits for the last sliver ----
  {
    const fake = (frac) => ({ key: 'house', level: 1, hp: 100 * frac, maxhp: 100 });
    ck('phaseLadder',
      Bld.burnPhase(fake(1)) === -1 && Bld.burnPhase(fake(0.99)) === -1 &&
      Bld.burnPhase(fake(0.9)) === 0 && Bld.burnPhase(fake(0.67)) === 0 &&
      Bld.burnPhase(fake(0.6)) === 1 && Bld.burnPhase(fake(0.34)) === 1 &&
      Bld.burnPhase(fake(0.2)) === 1 && Bld.burnPhase(fake(0.12)) === 1 &&
      Bld.burnPhase(fake(0.05)) === 2 && Bld.burnPhase(fake(0.01)) === 2,
      'sound → small → big+dark → ruined');
    // the threshold is CFG.RUIN_AT and nothing else — never a hard-coded third
    ck('ruinWaitsForTheLastTenth',
      CFG.RUIN_AT >= 0.85 && CFG.RUIN_AT < 1 &&
      Bld.burnPhase(fake(1 - CFG.RUIN_AT + 0.02)) === 1 &&
      Bld.burnPhase(fake(1 - CFG.RUIN_AT)) === 2,
      'RUIN_AT=' + CFG.RUIN_AT);
  }

  // ---- 3. the scorched and ruined variants: darker, holed, cached ----
  // measured on a PROCEDURAL base: a shipped PNG loaded over file:// taints
  // every canvas it touches and the pixel reads here would throw. The pick
  // is dynamic (first key whose sprite is still a canvas), so new art
  // shipping later never breaks the check — it just moves it.
  const procKeys = Object.keys(Sprites.building)
    .filter(k => Sprites.building[k][0] && Sprites.building[k][0].getContext);
  {
    const base = Sprites.building[procKeys[0]][0];
    const dark = R.darkOf(base), ruin = R.ruinOf(base);
    ck('darkVariantScorches',
      dark !== base && dark.width === base.width && avgLum(dark) < avgLum(base) * 0.9,
      'same size, visibly darker');
    ck('ruinVariantBreaks',
      ruin !== base && px(ruin) < px(base) * 0.92 && avgLum(ruin) < avgLum(base) * 0.85,
      'chunks bitten out AND charred');
    ck('variantsCached', R.darkOf(base) === dark && R.ruinOf(base) === ruin, 'WeakMap identity');
    // walls get their variants for free off the mask canvas
    const wm = Sprites.wallMask[0][10];
    ck('wallMasksBurnToo', R.darkOf(wm).width === wm.width && px(R.ruinOf(wm)) < px(wm), '');
  }

  // ---- 4. the render path: flames ride the phases, sites burn too ----
  {
    G.newGame('burn1', 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    S.res = { food: 9999, wood: 9999, stone: 9999, gold: 9999 };
    const tc = Bld.tcOf('P');
    tc.x = 20; tc.y = 25; Bld._block = null;
    for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
      const x = tc.x + dx, y = tc.y + dy;
      if (MapGen.inB(x, y)) { S.map.terrain[MapGen.idx(x, y)] = T.GRASS; S.map.explored[MapGen.idx(x, y)] = 1; }
    }
    S.units = [];
    const h = Bld.place('P', 'house', tc.x + 3, tc.y, { free: true });
    Bld.finish(h);
    G.updateVisibility();
    R.centerOn(tc.x + 3.5, tc.y + 0.5);
    const keysAt = (setup) => {
      setup();
      const calls = [];
      const orig = Assets.drawSprite;
      Assets.drawSprite = function (g, key, x, y, o) { calls.push(key); return orig.call(Assets, g, key, x, y, o); };
      try { R.draw(0.016); } finally { Assets.drawSprite = orig; }
      return calls;
    };
    const anyS = (k) => k.some(x => /^misc\/flameSmall\//.test(x));
    const anyB = (k) => k.some(x => /^misc\/flameBig\//.test(x));
    const k0 = keysAt(() => { h.hp = h.maxhp; });
    const k1 = keysAt(() => { h.hp = h.maxhp * 0.9; });
    const k2 = keysAt(() => { h.hp = h.maxhp * 0.5; });
    const k2b = keysAt(() => { h.hp = h.maxhp * 0.2; });
    const k3 = keysAt(() => { h.hp = h.maxhp * 0.05; });
    ck('soundBuildingNoFlames', !anyS(k0) && !anyB(k0), '');
    ck('phase0SmallFires', anyS(k1) && !anyB(k1), '');
    // the BLAZE is phase 1's alone — but the per-building anchors now put
    // small licks at the doorway and the foot ALONGSIDE the roof's flameBig,
    // so ph1 is no longer big-only (it was, when the fire was three fixed
    // fractions of the tile)
    ck('phase1BigFires', anyB(k2), '');
    ck('stillBlazingAtAFifth', anyB(k2b), 'the ruined look has NOT arrived yet');
    ck('phase2SmallFiresAgain', anyS(k3) && !anyB(k3), '');
    // a construction site is fragile BY DESIGN (it starts at siteStartHp, a
    // fraction of finished hp) — an UNTOUCHED site must never read as on
    // fire (the regression: fresh sites burning). Only real damage below
    // what the site was given lights it.
    h.hp = h.maxhp;   // the house is whole again — only the site under test may burn
    const site = Bld.place('P', 'barracks', tc.x - 3, tc.y, { free: true });
    G.updateVisibility();
    ck('siteStartsFragile', site.hp === Bld.siteStartHp(site.maxhp) && site.hp < site.maxhp, '');
    const kFresh = keysAt(() => {});
    ck('freshSiteNeverBurns', !anyS(kFresh) && !anyB(kFresh),
      'building under construction is not under fire');
    const k4 = keysAt(() => { site.hp = Bld.siteStartHp(site.maxhp) * 0.5; });
    ck('damagedSitesBurnToo', anyB(k4), 'flames once a site takes REAL damage');
    Bld.finish(site); site.hp = site.maxhp;

    /* ---- 4b. A TOWER CRUMBLES INSTEAD OF BLAZING. There is nothing in a
       stone shaft to burn: it gets SMALL fires only, never the big roof
       blaze, and sheds masonry to the ground (R.drawTowerCrumble). ---- */
    const tw2 = Bld.place('P', 'tower', tc.x + 3, tc.y + 3, { free: true });
    Bld.finish(tw2);
    G.updateVisibility();
    let crumbles = 0;
    const origCrumble = R.drawTowerCrumble;
    R.drawTowerCrumble = function (...a) { if (a[1] && a[1].id === tw2.id) crumbles++; return origCrumble.apply(R, a); };
    const t0 = keysAt(() => { tw2.hp = tw2.maxhp; });
    const t1 = keysAt(() => { tw2.hp = tw2.maxhp * 0.9; });
    const t2 = keysAt(() => { tw2.hp = tw2.maxhp * 0.5; });
    const t3 = keysAt(() => { tw2.hp = tw2.maxhp * 0.05; });
    R.drawTowerCrumble = origCrumble;
    ck('soundTowerDoesNotCrumble', !anyS(t0) && !anyB(t0), '');
    ck('towerNeverTakesTheBigBlaze',
      !anyB(t1) && !anyB(t2) && !anyB(t3), 'stone gets no roof fire');
    ck('towerKeepsSmallFiresAtEveryPhase',
      anyS(t1) && anyS(t2) && anyS(t3), '');
    ck('towerShedsMasonry', crumbles === 3,
      'drawTowerCrumble ran for each damaged phase (' + crumbles + '/3)');
    tw2.hp = tw2.maxhp;
    h.hp = h.maxhp;

    // ---- 5. ash: unique per building, blocks building 5 days, never movement ----
    const hx = h.x, hy = h.y;
    const ashBefore = S.ashes.length;
    Bld.damage(h, 999999);
    ck('burnLeavesAsh',
      S.ashes.length === ashBefore + 1 &&
      S.ashes[S.ashes.length - 1].key === 'house' && S.ashes[S.ashes.length - 1].x === hx,
      'S.ashes records the footprint');
    ck('ashBlocksBuilding',
      !Bld.tileFree(hx, hy) && !Bld.canPlace('P', 'house', hx, hy).ok &&
      /smoulder/i.test(Bld.canPlace('P', 'house', hx, hy).why),
      Bld.canPlace('P', 'house', hx, hy).why);
    ck('ashNeverBlocksMovement', Path.passable(hx, hy, 'P'), 'ash is ground, not a wall');
    // two dynamically-picked PROCEDURAL keys (the file:// taint rule again)
    const a1 = R.ashOf(procKeys[0], 1), a2 = R.ashOf(procKeys[1], 1);
    ck('ashArtUniquePerBuilding',
      px(a1) > 150 && px(a2) > 150 && a1.toDataURL() !== a2.toDataURL() &&
      R.ashOf(procKeys[0], 1) === a1,
      'derived from each building\'s own silhouette, cached');
    // expiry: present through day 4, cool and buildable on day 5
    const burnedDay = S.ashes[S.ashes.length - 1].day;
    for (let i = 0; i < CFG.ASH_DAYS - 1; i++) G.dayTick();
    ck('ashHoldsFourDays',
      S.day - burnedDay === CFG.ASH_DAYS - 1 && !!Bld.ashAt(hx, hy) && !Bld.tileFree(hx, hy), 'day +' + (S.day - burnedDay));
    G.dayTick();
    ck('ashCoolsOnDayFive',
      !Bld.ashAt(hx, hy) && Bld.canPlace('P', 'house', hx, hy).ok === true,
      'the ground is buildable again');

    // ---- 6. walls leave no ash (the mend loop must keep working) ----
    const w = Bld.place('P', 'wall', tc.x + 5, tc.y + 2, { free: true });
    Bld.finish(w);
    const n2 = S.ashes.length;
    Bld.damage(w, 999999);
    ck('wallsLeaveNoAsh', S.ashes.length === n2, 'a breach is instantly re-buildable');

    // ---- 7. ash survives save/load; legacy saves backfill ----
    const hh2 = Bld.place('P', 'house', tc.x + 3, tc.y + 3, { free: true });
    Bld.finish(hh2);
    Bld.damage(hh2, 999999);
    const nAsh = S.ashes.length, json = G.saveJSON();
    G.loadJSON(json);
    ck('ashSurvivesSaveLoad',
      S.ashes.length === nAsh && S.ashes.some(a => a.key === 'house'),
      nAsh + ' pile(s) through the round trip');
    const legacy = JSON.parse(json); delete legacy.ashes;
    G.loadJSON(JSON.stringify(legacy));
    ck('legacySavesBackfill', Array.isArray(S.ashes) && S.ashes.length === 0, '');
  }

  /* ---- 8. THE COLLAPSE: a destroyed tower topples once, in dust ---- */
  {
    // 8a. the registry IS the feature, and only the tower is in it
    const cfg = R.COLLAPSE.tower;
    ck('towerIsRegisteredToCollapse', !!cfg, '');
    ck('collapseIsFiveToTenFrames', cfg.frames >= 5 && cfg.frames <= 10, cfg.frames + ' frames');
    ck('nothingElseCollapsesYet',
      Object.keys(R.COLLAPSE).join() === 'tower',
      'walls, gates and every other building come down as before');

    // 8b. frames are cut from the building's own sprite: roomier than the
    // tile, starting whole and ending with the tower gone
    const base = Sprites.building.tower[0];
    const sheet = R.collapseSheet(base, cfg);
    const PD = R.COLLAPSE_PAD;
    ck('sheetHasEveryFrame', Array.isArray(sheet) && sheet.length === cfg.frames, '');
    ck('framesAreRoomierThanTheTile',
      sheet[0].width === Math.round(base.width * PD.w) &&
      sheet[0].height === Math.round(base.height * PD.h),
      'the dust needs room to roll: ' + sheet[0].width + 'x' + sheet[0].height);
    // the SOLID mass only — dust is deliberately translucent, and counting it
    // would say the last frame has more building in it than the first
    const solid = (c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 200) n++; return n; };
    ck('itStartsStanding', solid(sheet[0]) >= solid(base) * 0.9, 'frame 0 is still the building');
    ck('itFalls',
      sheet.every((f, i) => i === 0 || f.toDataURL() !== sheet[i - 1].toDataURL()) &&
      solid(sheet[cfg.frames - 1]) < solid(sheet[0]) * 0.75,
      'every frame differs and the tower is gone by the end');
    ck('andItRaisesDust',
      px(sheet[cfg.frames - 2]) > px(sheet[0]) * 2.5,
      'translucent cloud far wider than the building ever was');
    ck('sheetCached', R.collapseSheet(base, cfg) === sheet, 'WeakMap identity, one sheet per artwork');
    // the mural tower's bonded self gets a collapse for free, off the same code
    ck('everyArtworkCollapses',
      R.collapseSheet(Sprites.towerMural[0], cfg).length === cfg.frames &&
      R.collapseSheet(Sprites.buildingA.tower[0], cfg).length === cfg.frames,
      'mural + rival sets included');

    // 8c. destroying a tower starts ONE topple; nothing else starts any
    G.newGame('burn2', 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    S.res = { food: 9999, wood: 9999, stone: 9999, gold: 9999 };
    const tc2 = Bld.tcOf('P');
    for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
      const x = tc2.x + dx, y = tc2.y + dy;
      if (MapGen.inB(x, y)) { S.map.terrain[MapGen.idx(x, y)] = T.GRASS; S.map.explored[MapGen.idx(x, y)] = 1; }
    }
    Bld._block = null;
    const mk = (key, dx, dy) => { const z = Bld.place('P', key, tc2.x + dx, tc2.y + dy, { free: true }); Bld.finish(z); return z; };
    const tw = mk('tower', 4, 0), hs = mk('house', 4, 3), wl = mk('wall', 4, -3);
    G.updateVisibility(); R.centerOn(tw.x + 0.5, tw.y + 0.5);
    R.collapses.length = 0;
    Bld.damage(hs, 999999);
    Bld.damage(wl, 999999);
    ck('onlyRegisteredKindsTopple', R.collapses.length === 0, 'a house and a wall start nothing');
    Bld.damage(tw, 999999);
    ck('aDestroyedTowerTopples', R.collapses.length === 1 && R.collapses[0].x === tw.x, '');
    ck('itSnapshotsItsOwnSprite', !!R.collapses[0].spr, 'the building is already gone by draw time');

    /* 8c-ii. A WORK SITE HAS NOTHING TO TOPPLE. The collapse frames are cut
       from the building's OWN sprite, and a site's sprite is the finished
       tower — so knocking down a half-raised shaft played its life story
       backwards in one second: staked plot → scaffold → a whole finished
       tower → the whole thing falling over. A site just stops being a site
       and leaves its rubble, like every other unfinished building. */
    {
      const site = Bld.place('P', 'tower', tc2.x + 4, tc2.y + 5, { free: true });
      const nBefore = R.collapses.length;
      ck('aTowerSiteIsStillASite', site.construction > 0, '');
      Bld.damage(site, 999999);
      ck('aHalfRaisedTowerNeverTopples', R.collapses.length === nBefore,
        'no finished tower is conjured up just to knock it down');
      ck('butItStillLeavesItsRubble',
        S.map.terrain[MapGen.idx(site.x, site.y)] === T.RUIN && !Bld.at(site.x, site.y), '');
      // …while an UPGRADING tower is a standing tower, and still comes down
      const up = Bld.place('P', 'tower', tc2.x + 5, tc2.y + 5, { free: true });
      Bld.finish(up); up.upgrading = 2; up.upTotal = 2;
      Bld.damage(up, 999999);
      ck('anUpgradingOneStillDoes', R.collapses.length === nBefore + 1,
        'it is a tower standing in scaffolding, not a hole in the ground');
      R.collapses.length = nBefore;
    }

    // 8d. the ash it leaves WAITS for the topple to finish
    ck('ashWaitsForTheFall', !!R.collapseAt(tw.x, tw.y) && !!Bld.ashAt(tw.x, tw.y),
      'the pile exists in state but is held back on screen');

    /* 8d-ii. …AND SO DOES THE GROUND. Bld.removeToRuin lays rubble the instant
       the building dies and bakes it straight into the terrain cache, so the
       brown scar used to appear UNDER a tower that was still standing — the
       ending given away a second early, exactly what holding the ash back is
       meant to prevent. startCollapse snapshots the ground while it is still
       whole (which is why it must keep running BEFORE removeToRuin) and
       drawCollapseGround stamps it back until the topple ends. The rubble is
       real in STATE the whole time; only the picture waits. */
    ck('theRuinIsAlreadyRealInState',
      S.map.terrain[MapGen.idx(tw.x, tw.y)] === T.RUIN, 'the game knows the tower is gone');
    ck('theGroundIsHeldWhileItFalls', !!R.collapses[0].ground,
      'a snapshot of the tile taken before the rubble was laid');
    ck('theHeldGroundIsTheWholeFootprint',
      R.collapses[0].ground.width === Bld.size('tower') * CFG.TILE &&
      R.collapses[0].ground.height === Bld.size('tower') * CFG.TILE,
      R.collapses[0].ground.width + '×' + R.collapses[0].ground.height);
    {
      // it is STAMPED, every frame, over the tile the tower stood on
      const proto = CanvasRenderingContext2D.prototype, orig = proto.drawImage;
      const drawn = [];
      proto.drawImage = function (img) { drawn.push(img); return orig.apply(this, arguments); };
      try { R.draw(0.016); } finally { proto.drawImage = orig; }
      ck('andItIsStampedOverTheScar', drawn.includes(R.collapses[0].ground), '');
    }
    ck('theHeldGroundIsNeverSaved',
      !/"ground"/.test(G.saveJSON()), 'render-side only, like the topple itself');

    // 8e. it is a ONE-SHOT, and it never reaches a save file
    R.draw(0.016);
    ck('stillPlayingAfterAFrame', R.collapses.length === 1, '');
    ck('collapsesAreNeverSaved',
      S.collapses === undefined && !/"collapses"/.test(G.saveJSON()),
      'render-side only, same rule as R._fighting');
    const dur = cfg.ms / 1000;
    R.draw(dur * 0.6); R.draw(dur * 0.6);
    ck('itPlaysExactlyOnce', R.collapses.length === 0, 'the topple retires itself');

    // 8f. the OTHER half of the extension point: hand-drawn fall art wins
    ck('noAuthoredFallArtYet', R.collapseArt('tower', cfg.frames) === 0, 'the tower uses the cut sheet');
    Sprites.misc.towerFall1 = base; Sprites.misc.towerFall2 = base; Sprites.misc.towerFall3 = base;
    ck('authoredFallArtIsPickedUp', R.collapseArt('tower', cfg.frames) === 3,
      'misc/<key>Fall1..N takes over the whole animation');
    delete Sprites.misc.towerFall1; delete Sprites.misc.towerFall2; delete Sprites.misc.towerFall3;
  }

  /* ---- 9. WHERE A BUILDING BURNS (R.FIRE_AT): the fire is anchored to the
     hand-made art's real roofs, doorways and yards — per key, per level —
     and the GROUND-LEVEL kinds (a field, a pit, an open yard) smoulder low
     instead of blazing tall. ---- */
  {
    // every shipped PNG slot has anchors, resolved through the [{lv,…}] form
    const SHIPPED = [['tc', 3], ['house', 3], ['barracks', 3], ['range', 3],
      ['farm', 1], ['sapper', 1], ['siege', 1]];
    const probs = [];
    for (const [id, top] of SHIPPED) for (let lv = 1; lv <= top; lv++) {
      const a = R.smokeAnchor(R.FIRE_AT, id, lv);
      if (!a || !a.spots || a.spots.length < 3) { probs.push(id + '-l' + lv + ' unanchored'); continue; }
      if (!a.spots.every(sp => sp.x >= 0 && sp.x <= 1 && sp.y >= 0 && sp.y <= 1))
        probs.push(id + '-l' + lv + ' out of rect');
    }
    ck('everyShippedArtHasFireAnchors', probs.length === 0,
      probs.length ? probs.slice(0, 5).join('; ') : '15 PNG slots anchored');
    ck('theGroundKindsAreMarked',
      R.smokeAnchor(R.FIRE_AT, 'farm', 1).ground === 1 &&
      R.smokeAnchor(R.FIRE_AT, 'sapper', 1).ground === 1 &&
      R.smokeAnchor(R.FIRE_AT, 'siege', 1).ground === 1 &&
      R.smokeAnchor(R.FIRE_AT, 'barracks', 1).ground === 1 &&
      !R.smokeAnchor(R.FIRE_AT, 'barracks', 3).ground &&
      !R.smokeAnchor(R.FIRE_AT, 'house', 1).ground,
      'field, pit, open yards — a roofed hall is not among them');
    // a level with no entry of its own resolves down (the smokeAnchor rule),
    // and a WORK SITE always burns the classic way — the anchors are for the
    // building, not for the piled materials
    ck('anchorsResolveDownTheLevels',
      R.smokeAnchor(R.FIRE_AT, 'sapper', 3) === R.smokeAnchor(R.FIRE_AT, 'sapper', 1), '');
    ck('sitesKeepTheClassicBurn',
      R.fireAnchors({ key: 'house', level: 1, construction: 5, upgrading: 0 }) === null &&
      R.fireAnchors({ key: 'house', level: 1, construction: 0, upgrading: 2 }) === null &&
      !!R.fireAnchors({ key: 'house', level: 1, construction: 0, upgrading: 0 }), '');

    // the render path: a burning FARM never draws flameBig at any phase, and
    // never takes the ruinOf crown-bite (holes in a flat field); a burning
    // HOUSE still does both
    G.newGame('burn4', 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    const tc = Bld.tcOf('P');
    tc.x = 20; tc.y = 25; Bld._block = null;
    for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
      const x = tc.x + dx, y = tc.y + dy;
      if (MapGen.inB(x, y)) { S.map.terrain[MapGen.idx(x, y)] = T.GRASS; S.map.explored[MapGen.idx(x, y)] = 1; }
    }
    S.units = [];
    const farm = Bld.place('P', 'farm', tc.x + 3, tc.y, { free: true });
    Bld.finish(farm);
    const hs = Bld.place('P', 'house', tc.x - 3, tc.y, { free: true });
    Bld.finish(hs);
    G.updateVisibility();
    R.centerOn(tc.x + 0.5, tc.y + 0.5);
    const keysAt = (setup) => {
      setup();
      const calls = [];
      const orig = Assets.drawSprite;
      Assets.drawSprite = function (g, key, x, y, o) { calls.push(key); return orig.call(Assets, g, key, x, y, o); };
      try { R.draw(0.016); } finally { Assets.drawSprite = orig; }
      return calls;
    };
    const anyB = (k) => k.some(x => /^misc\/flameBig\//.test(x));
    const anyS = (k) => k.some(x => /^misc\/flameSmall\//.test(x));
    hs.hp = hs.maxhp;
    const g1 = keysAt(() => { farm.hp = farm.maxhp * 0.5; });
    const g2 = keysAt(() => { farm.hp = farm.maxhp * 0.05; });
    ck('theGroundNeverBlazes', !anyB(g1) && !anyB(g2) && anyS(g1),
      'small smoulder flames only, at every phase');
    let ruins = 0;
    const oRuin = R.ruinOf;
    R.ruinOf = function (...a) { ruins++; return oRuin.apply(R, a); };
    try { R.draw(0.016); } finally { R.ruinOf = oRuin; }
    ck('aRuinedFieldStaysDarkNotHoled', ruins === 0,
      'ground kinds keep darkOf at phase 2 — ruinOf is for things with rooflines');
    farm.hp = farm.maxhp;
    hs.hp = hs.maxhp * 0.05;
    ruins = 0;
    R.ruinOf = function (...a) { ruins++; return oRuin.apply(R, a); };
    try { R.draw(0.016); } finally { R.ruinOf = oRuin; }
    ck('aRuinedHouseIsStillHoled', ruins >= 1, '');
    // the blaze breaks out BEHIND the ridge: the back-pass draws flameBig
    // before the sprite at phase 1, and only at phase 1
    hs.hp = hs.maxhp * 0.5;
    const back1 = keysAt(() => { const o = R.draw; }); // full frame — back-pass included
    ck('theBlazeBreaksOutBehindTheRidge',
      (() => {
        const calls = [];
        const orig = Assets.drawSprite;
        Assets.drawSprite = function (g, key, x, y, o) { calls.push(key); return orig.call(Assets, g, key, x, y, o); };
        try { R.drawBurnBack(R.g, hs, 0, 0, 64); } finally { Assets.drawSprite = orig; }
        return calls.some(k => /^misc\/flameBig\//.test(k));
      })() && back1.length >= 0, 'drawBurnBack issues the behind-the-ridge blaze at ph1');
    ck('theBackPassRestsOutsideTheBlaze',
      (() => {
        const calls = [];
        const orig = Assets.drawSprite;
        Assets.drawSprite = function (g, key, x, y, o) { calls.push(key); return orig.call(Assets, g, key, x, y, o); };
        try {
          hs.hp = hs.maxhp * 0.9; R.drawBurnBack(R.g, hs, 0, 0, 64);   // ph0
          hs.hp = hs.maxhp * 0.05; R.drawBurnBack(R.g, hs, 0, 0, 64);  // ph2
        } finally { Assets.drawSprite = orig; }
        return calls.length === 0;
      })(), 'catching and guttering keep the fire in front');
    hs.hp = hs.maxhp;
  }

  /* ---- 10. THE FALL THROWS DUST (R.startDestructPoof): the placement poof,
     reused at the other end of a building's life. One full-size burst under
     the footprint, a smaller residual a beat later; the tower holds its dust
     for the LANDING; fog-gated; capped; never from a demolition. ---- */
  {
    G.newGame('burn5', 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    const tc = Bld.tcOf('P');
    tc.x = 20; tc.y = 25; Bld._block = null;
    for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) {
      const x = tc.x + dx, y = tc.y + dy;
      if (MapGen.inB(x, y)) { S.map.terrain[MapGen.idx(x, y)] = T.GRASS; S.map.explored[MapGen.idx(x, y)] = 1; }
    }
    S.units = [];
    const mk = (key, dx, dy) => { const z = Bld.place('P', key, tc.x + dx, tc.y + dy, { free: true }); Bld.finish(z); return z; };
    const h1 = mk('house', 3, 0), bk = mk('barracks', 5, 3), tw = mk('tower', -3, 0), h2 = mk('house', 3, 2);
    G.updateVisibility();
    R.placePoofs.length = 0; R.collapses.length = 0;
    Bld.damage(h1, 999999);
    ck('theFallThrowsDust',
      R.placePoofs.length === 2 && R.placePoofs[0].t === 0 && R.placePoofs[0].sz === 1 &&
      R.placePoofs[0].x === h1.x && R.placePoofs[0].y === h1.y, '');
    ck('andALittleMoreSettlesAfter',
      R.placePoofs[1].t === -250 && R.placePoofs[1].scale === 0.65,
      'a 0.65-scale echo, 250ms behind');
    Bld.damage(bk, 999999);
    ck('theDustScalesWithTheFootprint',
      R.placePoofs[2].sz === Bld.size('barracks'), '2×2 ground, 2×2 cloud');
    R.placePoofs.length = 0;
    Bld.damage(tw, 999999);
    ck('theTowerDustWaitsForTheLanding',
      R.placePoofs.length === 2 &&
      R.placePoofs[0].t === -(R.COLLAPSE.tower.ms * 0.84) &&
      R.placePoofs[1].t === -(R.COLLAPSE.tower.ms * 0.84 + 250),
      'the poof answers the block hitting the ground, not the killing blow');
    R.collapses.length = 0;
    // …but a tower SITE has nothing to topple, so its dust flies at once
    const twSite = Bld.place('P', 'tower', tc.x - 3, tc.y + 3, { free: true });
    R.placePoofs.length = 0;
    Bld.damage(twSite, 999999);
    ck('aTowerSitePoofsAtOnce', R.placePoofs.length === 2 && R.placePoofs[0].t === 0, '');
    // a DEMOLITION is a teardown, not a kill — no dust
    R.placePoofs.length = 0;
    Bld.demolish(h2);
    ck('aDemolitionThrowsNoDust', R.placePoofs.length === 0, '');
    // dust nobody can see is a cloud drawn for nobody: a building destroyed
    // outside the vis grid starts nothing (placed AFTER updateVisibility ran,
    // so the stale grid genuinely cannot see it)
    const farX = tc.x + 14, farY = tc.y + 14;
    if (MapGen.inB(farX, farY)) {
      S.map.terrain[MapGen.idx(farX, farY)] = T.GRASS;
      const far = Bld.place('P', 'house', farX, farY, { free: true });
      Bld.finish(far);
      R.placePoofs.length = 0;
      Bld.damage(far, 999999);
      ck('unseenFallsThrowNoDust', R.placePoofs.length === 0, 'fog-gated at the trigger');
    } else ck('unseenFallsThrowNoDust', false, 'probe tile off the board — rework the test scene');
    // a razed town block stays a scene, not a whiteout: the pile is capped
    R.placePoofs.length = 0;
    for (let i = 0; i < 12; i++) {
      const z = Bld.place('P', 'house', tc.x - 6 + i, tc.y + 5, { free: true });
      Bld.finish(z); G.updateVisibility();
      Bld.damage(z, 999999);
    }
    ck('theDustPileIsCapped', R.placePoofs.length <= 17, R.placePoofs.length + ' clouds live');
    R.placePoofs.length = 0; R.collapses.length = 0;
  }

  return { res, fails };
});
console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL BURN-DOWN CHECKS PASS');
console.log('errors:', errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e)));
await b.close();
process.exit(out.fails.length ? 1 : 0);
