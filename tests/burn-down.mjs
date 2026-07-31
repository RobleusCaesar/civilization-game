/* BURN-DOWN CONTRACT — a damaged building shows its destruction in THIRDS
   (Bld.burnPhase, keyed to hp so the fire burns until repair puts it out):

     phase 0  first third lost   — SMALL fires on the roof and at the foot,
              the building's own sprite untouched
     phase 1  second third lost  — BIG fires, the sprite scorched DARKER
              (R.darkOf, cached per base canvas)
     phase 2  final third        — a partially-DESTROYED look (R.ruinOf:
              crown bitten out, remains charred, rafter stubs + embers),
              the fires guttering small again

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
     sprites.js — the flame frames
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

  // ---- 2. burnPhase: destruction in thirds, hp-keyed ----
  {
    const fake = (frac) => ({ key: 'house', level: 1, hp: 100 * frac, maxhp: 100 });
    ck('phaseThirds',
      Bld.burnPhase(fake(1)) === -1 && Bld.burnPhase(fake(0.99)) === -1 &&
      Bld.burnPhase(fake(0.9)) === 0 && Bld.burnPhase(fake(0.67)) === 0 &&
      Bld.burnPhase(fake(0.6)) === 1 && Bld.burnPhase(fake(0.34)) === 1 &&
      Bld.burnPhase(fake(0.3)) === 2 && Bld.burnPhase(fake(0.01)) === 2,
      'sound → small → big+dark → ruined');
  }

  // ---- 3. the scorched and ruined variants: darker, holed, cached ----
  {
    const base = Sprites.building.house[0];
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
    const k3 = keysAt(() => { h.hp = h.maxhp * 0.2; });
    ck('soundBuildingNoFlames', !anyS(k0) && !anyB(k0), '');
    ck('phase0SmallFires', anyS(k1) && !anyB(k1), '');
    ck('phase1BigFires', anyB(k2) && !anyS(k2), '');
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
    const t3 = keysAt(() => { tw2.hp = tw2.maxhp * 0.2; });
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
    const a1 = R.ashOf('house', 1), a2 = R.ashOf('tower', 1);
    ck('ashArtUniquePerBuilding',
      px(a1) > 150 && px(a2) > 150 && a1.toDataURL() !== a2.toDataURL() &&
      R.ashOf('house', 1) === a1,
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

  return { res, fails };
});
console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL BURN-DOWN CHECKS PASS');
console.log('errors:', errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e)));
await b.close();
process.exit(out.fails.length ? 1 : 0);
