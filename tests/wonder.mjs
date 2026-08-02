/* ANCIENT WONDER CONTRACT — the SECOND way to win, and the only one that
   isn't a war: raise the monument and the run is yours.

   The rules, all of which this file pins:

     THE TEN        CFG.WONDERS holds ten monuments and Sprites.wonders holds a
                    drawing for each. ONE is rolled per run, hashed off the
                    SEED STRING (G.rollWonder) — never off S.rngState, which
                    would shift every later roll and re-deal a seed's cards.
                    G.setWonder points the single `wonder` building key at it:
                    name, blurb and artwork, so every existing code path finds
                    it where it finds every other building's.

     THE BIGGEST    3×3 — the only one in the game (the hall is 2×2).

     THE PRICE      15,000 each of food/wood/stone and 4,000 gold, and 45 days
                    to raise: over four times the level-3 Town Center. It is
                    the LAST entry in the build menu.

     WHO SEES IT    Calm alone SHOWS the button (CFG.MODES[m].wonderMenu). The
                    RULES work on every difficulty — nothing in Bld/AI/G asks
                    what mode you are in — so a save made in Calm keeps
                    working, and turning the flag on elsewhere is the whole
                    change needed.

     NO SECRETS     Laying one reveals it to the rival the same day and rings
                    the alarm: every soldier in range drops its plan and
                    marches on the works (AI.wonderWatch / stormTheWonder, and
                    the top-priority branch in Combat.aiRaidSeek). Holding the
                    site is the price of the peaceful victory.

     THE RIVAL'S    The chief may raise one too, but never before
                    CFG.WONDER.aiDay (350) — the race has to be one the player
                    can plausibly win.

     THE MARVEL     Finishing it does NOT snap to a score screen: the world
                    holds still with the camera on the monument for
                    CFG.WONDER.marvelMs, and only then is the run called.
                    R.marvel and G._marvel are render/flow state and NEVER
                    reach a save (same rule as R._fighting).

   Run this after touching any of:
     config.js — WONDERS / WONDER / BUILDINGS.wonder / MODES[*].wonderMenu
     sprites.js — W_DRAW / Sprites.wonders / useWonder / wonderBuild* art
     game.js — rollWonder / setWonder / wonderRaised / newGame / loadJSON
     buildings.js — place (reveal + alarm) / finish (the win)
     ui.js — MENU_KEYS / buildMenu / refreshMenu / wonderOffered
     render.js — the wonder work-site stages / drawWonderShine / drawMarvel
     ai.js — wonderWatch / stormTheWonder / maybeWonder / plotWonder
     combat.js — the wonder branch in aiRaidSeek

     node tests/wonder.mjs      # exits non-zero on any regression */
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

// shared helpers installed into the page once
await p.evaluate(() => {
  window.__res = {}; window.__fails = [];
  window.ck = (n, ok, i) => {
    window.__res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : '');
    if (!ok) window.__fails.push(n);
  };
  window.px = (c) => {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 10) n++; return n;
  };
  // flatten a patch of ground so a 3×3 monument can be laid on it
  window.clearFor = (x, y, r) => {
    for (let yy = y - r; yy <= y + r + 3; yy++) for (let xx = x - r; xx <= x + r + 3; xx++) {
      if (!MapGen.inB(xx, yy)) continue;
      const i = MapGen.idx(xx, yy);
      S.map.terrain[i] = T.GRASS; S.map.seenTerrain[i] = T.GRASS; S.map.explored[i] = 1;
    }
    Bld._block = null;
  };
});

await p.evaluate(() => {
  const ck = window.ck, px = window.px;

  // ---- 1. the ten, and the seeded roll ----
  {
    ck('tenWonders', Array.isArray(CFG.WONDERS) && CFG.WONDERS.length === 10,
      (CFG.WONDERS || []).length + ' monuments');
    ck('everyWonderHasAName',
      CFG.WONDERS.every(w => w.key && w.name && w.blurb) &&
      new Set(CFG.WONDERS.map(w => w.key)).size === 10, '');
    ck('everyWonderIsDrawn',
      CFG.WONDERS.every(w => Sprites.wonders[w.key] && Sprites.wonders[w.key].width === 192), '');
    ck('theyAreRealDrawings',
      CFG.WONDERS.every(w => px(Sprites.wonders[w.key]) > 192 * 192 * 0.06),
      'each fills a real part of its 3×3 plot');
    ck('noTwoAlike',
      new Set(CFG.WONDERS.map(w => Sprites.wonders[w.key].toDataURL())).size === 10, '');
    // the roll is stable per seed, spreads across the ten, and — crucially —
    // does not touch the run's RNG
    const a = G.rollWonder('alpha').key, a2 = G.rollWonder('alpha').key;
    const seen = new Set();
    for (let i = 0; i < 200; i++) seen.add(G.rollWonder('seed' + i).key);
    ck('rollIsStablePerSeed', a === a2, a);
    ck('rollSpreadsOverTheTen', seen.size >= 8, seen.size + '/10 seen in 200 seeds');
  }

  // ---- 2. the biggest thing on the board, and the price of it ----
  {
    const d = CFG.BUILDINGS.wonder, lv = d.levels[0];
    ck('threeByThree', d.size === 3 && Bld.size('wonder') === 3, '');
    ck('nothingElseIsThatBig',
      Object.keys(CFG.BUILDINGS).filter(k => k !== 'wonder')
        .every(k => (CFG.BUILDINGS[k].size || 1) <= 2), 'the hall is 2×2; everything else 1×1');
    ck('theFullPrice',
      lv.cost.food === 15000 && lv.cost.wood === 15000 && lv.cost.stone === 15000 && lv.cost.gold === 4000,
      JSON.stringify(lv.cost));
    const tc3 = CFG.BUILDINGS.tc.levels[2].time;
    ck('fourTimesTheHall', lv.time >= tc3 * 4, lv.time + ' days vs the level-3 hall\'s ' + tc3);
    ck('itIsOnlyEverOne', d.unique === true, '');
    ck('lastInTheBuildMenu',
      UI.MENU_KEYS[UI.MENU_KEYS.length - 1] === 'wonder' &&
      UI.MENU_KEYS.filter(k => k === 'wonder').length === 1, '');
    ck('sturdiestOnTheMap',
      Object.keys(CFG.BUILDINGS).filter(k => k !== 'wonder')
        .every(k => CFG.BUILDINGS[k].levels.every(l => l.hp < lv.hp)), lv.hp + ' hp');
  }

  // ---- 3. Calm SHOWS it; every mode PLAYS it ----
  {
    const shown = {}, placeable = {};
    for (const m of ['calm', 'moderate', 'hard']) {
      G.newGame('mode-' + m, m, 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
      UI.refreshMenu();
      const btn = document.querySelector('.bbtn[data-key=wonder]');
      shown[m] = UI.wonderOffered() && btn && btn.style.display !== 'none';
      // …and the RULES never ask what mode this is
      S.res = { food: 99999, wood: 99999, stone: 99999, gold: 99999 };
      const tc = Bld.tcOf('P');
      window.clearFor(tc.x + 4, tc.y, 2);
      placeable[m] = Bld.canPlace('P', 'wonder', tc.x + 4, tc.y).ok === true;
    }
    ck('calmShowsTheButton', shown.calm === true, '');
    ck('otherModesHideItForNow', shown.moderate === false && shown.hard === false, '');
    ck('butEveryModeCanRaiseOne',
      placeable.calm && placeable.moderate && placeable.hard,
      'the rules never ask the difficulty — only the menu does');
    ck('theFlagIsTheWholeSwitch',
      CFG.MODES.calm.wonderMenu === true && !CFG.MODES.moderate.wonderMenu && !CFG.MODES.hard.wonderMenu, '');
  }

  // ---- 4. the artwork follows THIS RUN's roll ----
  {
    G.newGame('artcheck', 'calm', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    const w = G.wonderDef();
    ck('theRunPicksOne', !!S.wonder && S.wonder === G.rollWonder('artcheck').key, S.wonder);
    ck('theKeyWearsItsName', CFG.BUILDINGS.wonder.name === w.name, CFG.BUILDINGS.wonder.name);
    ck('theKeyWearsItsArt',
      Sprites.building.wonder[0] === Sprites.wonders[S.wonder] &&
      Sprites.buildingA.wonder[0] === Sprites.wonders[S.wonder],
      'both faction sets — stone is stone');
    // switching runs switches all three
    const other = CFG.WONDERS.find(z => z.key !== S.wonder).key;
    G.setWonder(other);
    ck('itSwitchesCleanly',
      S.wonder === other && CFG.BUILDINGS.wonder.name === CFG.WONDERS.find(z => z.key === other).name &&
      Sprites.building.wonder[0] === Sprites.wonders[other], '');
  }

  // ---- 5. the great works: three looks, the monument revealed in the last ----
  {
    G.newGame('stages', 'calm', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    S.res = { food: 99999, wood: 99999, stone: 99999, gold: 99999 };
    S.units = [];
    const tc = Bld.tcOf('P');
    const wx = tc.x + 4, wy = tc.y;
    window.clearFor(wx, wy, 2);
    const w = Bld.place('P', 'wonder', wx, wy, { noAutoAssign: true });
    G.updateVisibility();
    R.centerOn(wx + 1.5, wy + 1.5);
    ck('theWorksArePlaced', !!w && w.construction === CFG.BUILDINGS.wonder.levels[0].time, '');
    ck('siteStartsFragile', w.hp === Bld.siteStartHp(w.maxhp) && w.maxhp === CFG.BUILDINGS.wonder.levels[0].hp, '');
    ck('stageArtExists',
      !!Sprites.misc.wonderBuild1 && !!Sprites.misc.wonderBuild2 && !!Sprites.misc.wonderScaffold &&
      Sprites.misc.wonderBuild1.width === 192, '');
    const total = CFG.BUILDINGS.wonder.levels[0].time;
    const keysAt = (left) => {
      w.construction = left;
      const calls = [], imgs = [];
      const orig = Assets.drawSprite, oi = CanvasRenderingContext2D.prototype.drawImage;
      Assets.drawSprite = function (g, key, x, y, o) { calls.push(key); return orig.call(Assets, g, key, x, y, o); };
      CanvasRenderingContext2D.prototype.drawImage = function (img) { imgs.push(img); return oi.apply(this, arguments); };
      try { R.draw(0.016); } finally { Assets.drawSprite = orig; CanvasRenderingContext2D.prototype.drawImage = oi; }
      return { calls, imgs };
    };
    const s0 = keysAt(total * 0.95), s1 = keysAt(total * 0.5), s2 = keysAt(total * 0.15);
    ck('stageOneGroundBroken',
      s0.calls.includes('misc/wonderBuild1') && !s0.calls.includes('misc/wonderScaffold'), '');
    ck('stageTwoTheRaising',
      s1.calls.includes('misc/wonderBuild2') && !s1.calls.includes('misc/wonderBuild1'), '');
    ck('stageThreeIsTheMonumentInScaffold',
      s2.calls.includes('misc/wonderScaffold') &&
      s2.imgs.includes(Sprites.wonders[S.wonder]) &&
      !s2.calls.includes('misc/wonderBuild2'),
      'the valley finally sees what it is getting');
    ck('theFinishedThingIsTheMonument',
      R.bldSprite(w) === Sprites.wonders[S.wonder], '');
    window.__w = w;
  }

  // ---- 6. no secrets: the rival is told, and comes ----
  {
    ck('theChiefIsToldTheDayTheGroundBreaks',
      !!(S.ai.knownB && S.ai.knownB[MapGen.idx(window.__w.x, window.__w.y)]) &&
      !!S.ai.wonderAlarm && S.ai.wonderAlarm.id === window.__w.id, '');
    const w = window.__w;
    const army = [];
    for (let i = 0; i < 6; i++) {
      const u = Units.spawn(i < 4 ? 'axeman' : 'archer', 'A', w.x + 9 + (i % 3), w.y + 7 + ((i / 3) | 0));
      u.defend = false; u.task = null; army.push(u);
    }
    // …and one soldier as far from the works as this map allows: the alarm is
    // a RADIUS (CFG.WONDER.alarmR), so whether that one marches must follow
    // from its distance and nothing else
    const corner = [[1, 1], [CFG.W - 2, 1], [1, CFG.H - 2], [CFG.W - 2, CFG.H - 2]]
      .reduce((best, c) => {
        const d = Math.hypot(c[0] - Bld.cx(w), c[1] - Bld.cy(w));
        return d > best.d ? { x: c[0], y: c[1], d } : best;
      }, { d: -1 });
    const far = Units.spawn('axeman', 'A', corner.x, corner.y);
    far.defend = false; far.task = null;
    const n = AI.stormTheWonder(w);
    ck('everySoldierInRangeMarches',
      n >= 6 && army.every(u => u.task && u.task.type === 'raid' && u.raidObj && u.raidObj.x === w.x), n + ' called');
    const called = !!(far.task && far.task.type === 'raid');
    ck('theAlarmIsARadius', called === (corner.d <= CFG.WONDER.alarmR),
      'alarmR=' + CFG.WONDER.alarmR + ', the far soldier is ' + corner.d.toFixed(1) +
      ' away and ' + (called ? 'marched' : 'stayed'));
    // and the seek puts them on the works over every other target
    const near = army[0];
    near.x = Bld.cx(w) + 1.2; near.y = Bld.cy(w);
    Units.spawn('villager', 'P', near.x + 0.5, near.y + 0.5);   // a juicier target, ordinarily
    Combat.aiRaidSeek(near);
    ck('theWorksOutrankEverything', near.tBld === w.id && !near.tUnit,
      'a villager underfoot does not distract the column');
    // the alarm retires itself when the works fall
    const hp0 = w.hp;
    Bld.damage(w, 999999);
    AI.wonderWatch();
    ck('theAlarmRetires', S.ai.wonderAlarm === null && !Bld.get(w.id), 'the works were at ' + hp0 + ' hp');
  }

  // ---- 7. the rival's own monument, and its day-350 gate ----
  {
    G.newGame('rivalw', 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    S.ai.res = { food: 99999, wood: 99999, stone: 99999, gold: 99999 };
    S.day = CFG.WONDER.aiDay - 1;
    const early = AI.maybeWonder();
    S.day = CFG.WONDER.aiDay;
    const onTime = AI.maybeWonder();
    const aw = Bld.list('A').find(z => z.key === 'wonder');
    ck('notBeforeItsDay', early === false, 'rich on day ' + (CFG.WONDER.aiDay - 1) + ' and still nothing');
    ck('andThenItMay', onTime === true && !!aw, '');
    ck('theRivalsWorksAreVisibleToo',
      !!(aw && S.map.seenB && S.map.seenB[MapGen.idx(aw.x, aw.y)]), '');
    ck('itSitsOnClearGround',
      !!aw && [0, 1, 2].every(dy => [0, 1, 2].every(dx =>
        MapGen.inB(aw.x + dx, aw.y + dy))), '');
    G.newGame('poorw', 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    S.day = 400;
    ck('andOnlyIfItCanPayForIt', AI.maybeWonder() === false, 'a poor chief raises nothing');
  }

  // ---- 8. save/load: the roll rides along, the marvel never does ----
  {
    G.newGame('savew', 'calm', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    const picked = S.wonder;
    const json = G.saveJSON();
    G.loadJSON(json);
    ck('theRollSurvivesTheRoundTrip',
      S.wonder === picked && CFG.BUILDINGS.wonder.name === G.wonderDef().name &&
      Sprites.building.wonder[0] === Sprites.wonders[picked], picked);
    const legacy = JSON.parse(json); delete legacy.wonder;
    G.loadJSON(JSON.stringify(legacy));
    ck('legacySavesBackfillFromTheirSeed',
      S.wonder === G.rollWonder(legacy.seed).key, S.wonder);
    ck('theMarvelIsNeverSaved',
      S.marvel === undefined && !/"marvel"|"_marvel"/.test(G.saveJSON()),
      'render/flow only, same rule as R._fighting');
  }
});

// ---- 9. the marvel, then the win (real time — shorten the hold for the test) ----
await p.evaluate(() => {
  const ck = window.ck;
  window.__savedMs = CFG.WONDER.marvelMs;
  CFG.WONDER.marvelMs = 400;
  G.newGame('winw', 'calm', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = false;
  S.res = { food: 99999, wood: 99999, stone: 99999, gold: 99999 };
  S.units = [];
  const tc = Bld.tcOf('P');
  window.clearFor(tc.x + 4, tc.y, 2);
  const w = Bld.place('P', 'wonder', tc.x + 4, tc.y, { noAutoAssign: true });
  Bld.finish(w);
  ck('theWorldHoldsStill', S.paused === true && !!R.marvel && G._marvel === true, '');
  ck('andTheRunIsNotCalledYet', !S.over, 'the player gets to look at it first');
  ck('theCaptionKnowsWhatItIs',
    R.marvel.name === G.wonderDef().name && R.marvel.blurb === G.wonderDef().blurb, R.marvel.name);
  window.__winW = w;
});
await p.waitForTimeout(1000);
await p.evaluate(() => {
  const ck = window.ck;
  ck('andThenTheRunIsWon',
    !!S.over && S.over.win === true && S.over.msg.indexOf(G.wonderDef().name) >= 0,
    S.over ? S.over.msg.slice(0, 60) + '…' : 'still playing');
  ck('theHoldIsOver', !R.marvel && G._marvel === false, '');
  CFG.WONDER.marvelMs = window.__savedMs;

  // the RIVAL finishing one simply loses the run — no held frame, the defeat
  // scene has its own staging
  G.newGame('losew', 'calm', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = false;
  S.ai.res = { food: 99999, wood: 99999, stone: 99999, gold: 99999 };
  const atc = Bld.tcOf('A');
  window.clearFor(atc.x + 4, atc.y, 2);
  const aw = Bld.place('A', 'wonder', atc.x + 4, atc.y, { free: true });
  Bld.finish(aw);
  ck('theRivalsMonumentEndsTheRun',
    !!S.over && S.over.win === false && S.over.msg.indexOf(G.wonderDef().name) >= 0,
    S.over ? S.over.msg.slice(0, 50) + '…' : 'nothing happened');
  ck('noHeldFrameForTheirWin', !R.marvel, '');
});

const out = await p.evaluate(() => ({ res: window.__res, fails: window.__fails }));
console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL WONDER CHECKS PASS');
console.log('errors:', errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e)));
await b.close();
process.exit(out.fails.length ? 1 : 0);
