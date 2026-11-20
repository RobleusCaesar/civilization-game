/* ART FOR WHAT THE WORLD CAN SHOW, AND THE FRAME FOR THE GAME (build 207).

   The operator, playing two games back to back on the live site: "the characters
   had lots of frozen movements, stutter steps, the initial map area loaded in
   blocky… the game should be smooth, the initial map area should pop right in,
   characters should move smoothly, animations should run smoothly". Measured:

     ART          every founding asked for BOTH tribes' whole armies and sapper sets
                  (~970 strips), cut every strip into frame canvases ON THE MAIN
                  THREAD through the first minute of play, and let nothing go: the
                  tunic rides in every dyed key and a run rolls a fresh tunic, so a
                  second game installed a second set beside the first — 285 MB of
                  frames after one game, 405 MB after two, 509 MB after three.
     BOATS        a fishing boat set down on its own shoal kept its one-step path
                  for as long as it fished, so it was drawn rowing on the spot.
     THE ENDING   a run that ended (the sim stops) left a man mid-path frozen in
                  his stride for the ending's held beat.
     THE GLIDE    the journey's establishing shot started over ground nobody had
                  asked for: the warm-up handed TerrainX the glide's TILE numbers
                  as pixels, and the press waited only for the view it ends on.
     THE WATER    the ripples recomposed twelve times a second whatever the device
                  could draw (a fifth of every second on a 4x-throttled phone).

   What this contract holds, section by section:
     §1 THE FOUNDING ASKS FOR WHAT THE WORLD HOLDS OR CAN RAISE — never a kind
        nobody holds and no yard can train.
     §2 A NEW WORLD LETS THE LAST ONE'S DYE GO — installed and still queued.
     §3 …AND THE FRAMES DO NOT GROW, WORLD AFTER WORLD (same world, new tunic).
     §4 A SOLDIER ASKS FOR HIS STRIPS WHEN HE COMES INTO THE WORLD — counted for
        the player's own, in the background for a rival under the fog, nothing
        for the title's demo; a held army card asks for what it summons.
     §5 A YARD ASKS FOR WHAT IT CAN RAISE, AND A STOREY FOR THE NEXT RANK.
     §6 WHILE A WORLD IS PLAYED THE BACKGROUND ART WAITS FOR THE FRAME LOOP —
        the slices install only what a press waits for, a quick frame installs
        in its room, a slow frame installs nothing (but never LATE_SKIP running),
        only LATE_AHEAD background strips are on the wire, and a world nobody
        plays takes the slices again.
     §7 A BOAT AT ANCHOR SHIPS ITS OARS.
     §8 AN ENDED RUN STANDS ITS PEOPLE DOWN.
     §9 THE JOURNEY OPENS ON EVERY VIEW OF ITS GLIDE — its views in world pixels,
        BEGIN pressed at once waits for all of them, and no stand-in ground is
        drawn in its first seconds (the live build drew 152 there).
     §10 THE WATER KEEPS TO THE DEVICE'S PACE — all twelve turns a second on a
        device that keeps up, at most LIFE_SLOW_HZ on one that does not.

   Run after touching: js/assets.js (the strip loader, wantUnit / wantYard /
   pruneUnitArt / frameTick), G.newGame's or G.loadJSON's art block, G.frame,
   Units.spawn, Bld.place / train / upgrade / finishUpgrade, Deck.wantArt,
   Units.update's fish branch, R.unitPose, Prologue.glideViews,
   TerrainX.prefetchViews / viewFrac / drawWaterLife, Screens.enterGame.

     node tests/art-budget.mjs      # exits non-zero on any regression */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });   // the strips are dyed off their own pixels: file:// must be same-origin
const res = {}, fails = [], errs = [];
const ck = (name, ok, detail) => { res[name] = (ok ? 'PASS' : 'FAIL') + (detail ? ' — ' + detail : ''); if (!ok) fails.push(name); };

/* ---- §1–§8: a page of ordinary worlds ---------------------------------------- */
{
  const ctx = await b.newContext({ viewport: { width: 500, height: 700 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto('file://' + join(root, 'index.html') + '?prologue=0', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.Screens && Screens.current === 'title' && window.Assets && Assets.ready, null, { timeout: 60000 });
  const out = await p.evaluate(async () => {
    const R1 = {};
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const until = async (f, ms) => { const t = performance.now(); while (!f() && performance.now() - t < ms) await sleep(50); return f(); };
    const MIL = Assets.MILITARY_ART;
    // a dyed key's faction, kind and tunic (undyed keys — a deer, a war band — belong to every world)
    const parse = k => {
      let m = /^villager-([pa])-([a-z]+)-l(\d)-[mf]$/.exec(k); if (m) return { o: m[1], kind: 'villager', tunic: m[2], tier: +m[3] };
      m = /^sapper-([pa])-([a-z]+)-l(\d)$/.exec(k); if (m) return { o: m[1], kind: 'sapper', tunic: m[2], tier: +m[3] };
      m = /^wolf-war-([a-z]+)$/.exec(k); if (m) return { o: 'p', kind: 'wolf-war', tunic: m[1] };
      m = /^([a-z]+)-([pa])-([a-z]+)$/.exec(k); if (m && MIL[m[1]]) return { o: m[2], kind: m[1], tunic: m[3] };
      return null;
    };
    // a strip in flight is known by its id, key|facing|pose (Assets._stripLoad)
    const keyOf = id => id.split('|')[0];
    const asked = () => {
      const s = new Set(Object.keys(Assets.unitArt));
      for (const id in Assets._stripLive) s.add(keyOf(id));
      return [...s];
    };
    const live = k => { for (const id in Assets._stripLive) if (keyOf(id) === k) return Assets._stripLive[id]; return null; };
    const queuedKeys = () => Object.keys(Assets._stripLive).map(keyOf);   // queued, on the wire or waiting to install
    const frames = () => { let n = 0; for (const k in Assets.unitArt) { if (!parse(k)) continue; const a = Assets.unitArt[k]; for (const d in a.dirs) for (const ps in a.dirs[d]) n += (a.dirs[d][ps] || []).length; } return n; };
    const own = f => (f === 'a' ? 'A' : 'P');

    /* §1 — the founding asks for what the world holds or can raise */
    Screens._demo = false;
    G.newGame('art-budget', 'moderate', 'medium', 'homesteader', 'green');
    {
      const allow = { P: new Set(), A: new Set() };
      for (const o of ['P', 'A']) for (const u of G.artPresent(o)) allow[o].add(u.kind);
      for (const u of G.artShown()) if (u.owner === 'A') allow.A.add(u.kind);
      for (const bd of S.buildings) if (bd.owner === 'P' || bd.owner === 'A') {
        const d = Bld.def(bd.key);
        if (d && d.train) for (const k in d.train) if ((d.train[k].reqLevel || 1) <= (bd.level || 1)) allow[bd.owner].add(k);
      }
      const extra = [], rivalKinds = new Set();
      for (const k of asked()) {
        const q = parse(k); if (!q) continue;
        if (q.o === 'a' && MIL[q.kind]) rivalKinds.add(q.kind);
        if (!allow[own(q.o)].has(q.kind === 'wolf-war' ? '-' : q.kind)) extra.push(k);
      }
      const pv = asked().some(k => /^villager-p-green-l1-[mf]$/.test(k));
      R1.s1 = { extra, rivalKinds: [...rivalKinds], all: Object.keys(MIL).length, pv };
    }
    /* §2/§3 — a settled world, a new tunic: the old dye goes, the frames do not grow */
    {
      const tc = S.buildings.find(o => o.key === 'tc' && o.owner === 'P');
      Units.spawn('defender', 'P', tc.x, tc.y + 2);
      await until(() => Assets.allArtReady(), 90000);
      const k1 = Object.keys(Assets.unitArt).filter(k => parse(k)), f1 = frames();
      const hadGreen = k1.some(k => /-p-green/.test(k) || /^villager-p-green/.test(k));
      G.newGame('art-budget', 'moderate', 'medium', 'homesteader', 'purple');
      const stale = Object.keys(Assets.unitArt).filter(k => { const q = parse(k); return q && q.o === 'p' && q.tunic === 'green'; });
      const staleQ = queuedKeys().filter(k => { const q = parse(k); return q && q.o === 'p' && q.tunic === 'green'; });
      const tc2 = S.buildings.find(o => o.key === 'tc' && o.owner === 'P');
      Units.spawn('defender', 'P', tc2.x, tc2.y + 2);
      await until(() => Assets.allArtReady(), 90000);
      const f2 = frames();
      const staleAfter = Object.keys(Assets.unitArt).filter(k => { const q = parse(k); return q && q.o === 'p' && q.tunic === 'green'; });
      const tierWrong = Object.keys(Assets.unitArt).filter(k => { const q = parse(k); return q && q.kind === 'villager' && q.tier !== R.villagerTier(own(q.o)); });
      R1.s2 = { hadGreen, k1: k1.length, stale, staleQ, staleAfter, tierWrong, f1, f2 };
    }
    /* §4 — a soldier asks for his strips when he comes into the world */
    {
      const tP = G.tunicOf('P'), tA = G.tunicOf('A');
      const tc = S.buildings.find(o => o.key === 'tc' && o.owner === 'P');
      const lancer = Units.spawn('lancer', 'P', tc.x + 1, tc.y + 2);   // tile coordinates: spawn stands him in the tile's middle
      const lv = live('lancer-p-' + tP), lancerAsked = !!lv || !!Assets.unitArt['lancer-p-' + tP], lancerCounted = !lv || !lv.late;
      // a kind the rival neither holds nor can train, raised on ground the player cannot see
      const aAsked = new Set(asked().map(parse).filter(q => q && q.o === 'a').map(q => q.kind));
      const kindA = Object.keys(MIL).find(k => !aAsked.has(k) && k !== 'bombard');
      const ra = S.buildings.find(o => o.key === 'tc' && o.owner === 'A');
      let spot = null;
      for (let r = 0; r < 8 && !spot; r++) for (let dy = -r; dy <= r && !spot; dy++) for (let dx = -r; dx <= r && !spot; dx++) {
        const x = ra.x + dx, y = ra.y + dy;
        if (Path.passable(x, y, 'A') && !G.visibleAt(x, y)) spot = { x, y };
      }
      const rival = spot && kindA && Units.spawn(kindA, 'A', spot.x, spot.y);
      const rv = kindA && live(kindA + '-a-' + tA);
      // the title's demo world wears no strips: a spawn there asks nothing
      Screens._demo = true;
      const before = asked().filter(k => k.startsWith('marksman-p-')).length;
      const demoU = Units.spawn('marksman', 'P', tc.x, tc.y + 3);
      const demoAsked = asked().filter(k => k.startsWith('marksman-p-')).length > before;
      Screens._demo = false;
      S.units = S.units.filter(u => u !== lancer && u !== rival && u !== demoU);
      R1.s4 = { lancerAsked, lancerCounted, kindA, rivalAsked: !!rv || !!(kindA && Assets.unitArt[kindA + '-a-' + tA]), rivalLate: !!rv && rv.late, demoAsked };
    }
    /* §5 — a yard asks for what it can raise, a storey for the next rank */
    {
      const tc = S.buildings.find(o => o.key === 'tc' && o.owner === 'P'), tP = G.tunicOf('P');
      // a stable wants a hall of level 2, so it is laid where the ground is free (place with free+instant asks nothing)
      const free2 = (x, y) => [[0, 0], [1, 0], [0, 1], [1, 1]].every(([a, c]) => Bld.tileFree(x + a, y + c) && Path.passable(x + a, y + c, 'P'));
      let at = null;
      for (let r = 3; r < 14 && !at; r++) for (let dy = -r; dy <= r && !at; dy++) for (let dx = -r; dx <= r && !at; dx++)
        if (free2(tc.x + dx, tc.y + dy)) at = { x: tc.x + dx, y: tc.y + dy };
      const had = k => asked().includes(k);
      const pre = { rider: had('rider-p-' + tP), horsearcher: had('horsearcher-p-' + tP), lancer: had('lancer-p-' + tP) };
      const st = at && Bld.place('P', 'stable', at.x, at.y, { free: true, instant: true });
      const l1 = { rider: had('rider-p-' + tP), horsearcher: had('horsearcher-p-' + tP) };
      if (st) Bld.finishUpgrade(st);
      const l2 = { horsearcher: had('horsearcher-p-' + tP), lvl: st && st.level };
      R1.s5 = { placed: !!st, pre, l1, l2 };
    }
    /* §4b — a held army card asks for the people it summons (after the yard, which asks the cavalry for itself) */
    {
      const tP = G.tunicOf('P');
      // a held army card asks for the people it summons, in the background
      const realCount = Deck.count;
      const kinds = new Set();
      for (const id in Deck.FX) { const fx = Deck.FX[id]; for (const e of (fx.LIST || (fx.KIND ? [{ kind: fx.KIND }] : []))) if (MIL[e.kind]) kinds.add(e.kind); }
      const unasked = () => [...kinds].filter(k => !live(k + '-p-' + tP) && !Assets.unitArt[k + '-p-' + tP]);
      const before = unasked();                 // what nothing in this world has asked for yet
      Deck.count = () => 1;
      try { Deck.wantArt(); } finally { Deck.count = realCount; }
      R1.s4b = { summoned: [...kinds], before, missing: unasked() };
    }
    /* §6 — while a world is played the background art waits for the frame loop */
    if (!Assets.frameTick) R1.s6 = { slice: {}, quick: -1, idle: -1, forced: -1, wirePlaying: -1, wireTitle: -1, titleRan: -1, ahead: 0, skip: 0, none: true };
    else {
      await until(() => Assets.allArtReady(), 60000);
      const sv = { q: Assets._installQ, on: Assets._installOn, cur: Screens.current, sq: Assets._stripQ, sql: Assets._stripQLate,
        fly: Assets._stripFlying, lfly: Assets._lateFly, per: Assets._period, skip: Assets._lateSkipped };
      const ran = { late: 0, counted: 0 };
      const burn = ms => { const t = performance.now(); while (performance.now() - t < ms); };
      const lateDone = () => {}; lateDone.late = true;
      const cDone = () => {}; cDone.late = false;
      Assets._installQ = []; Assets._installOn = false;
      for (let i = 0; i < 8; i++) Assets._installQ.push([() => { burn(1.5); ran.late++; }, lateDone]);
      for (let i = 0; i < 2; i++) Assets._installQ.push([() => { ran.counted++; }, cDone]);
      Screens.current = 'playing';
      Assets._drainInstalls();
      const slice = { late: ran.late, counted: ran.counted };
      Assets._period = 16.7; Assets._lateSkipped = 0;
      Assets.frameTick(2, 16.7);
      const quick = ran.late;
      let idle = 0;
      for (let i = 0; i < Assets.LATE_SKIP; i++) { const b0 = ran.late; Assets.frameTick(30, 33); if (ran.late === b0) idle++; }
      const b1 = ran.late; Assets.frameTick(30, 33); const forced = ran.late - b1;
      // the wire: at most LATE_AHEAD background strips while a world is played
      const sent = [];
      const img = n => ({ set src(v) { sent.push(n); } });
      Assets._installQ = []; Assets._stripQ = []; Assets._stripFlying = 0; Assets._lateFly = 0;
      Assets._stripQLate = [1, 2, 3, 4, 5].map(n => [img(n), 'u' + n, {}]);
      Assets._pumpStrips();
      const wirePlaying = sent.length;
      Screens.current = 'title';
      Assets._pumpStrips();
      const wireTitle = sent.length;
      // a world nobody plays takes the slices again
      Assets._installQ = []; Assets._installOn = false;
      for (let i = 0; i < 4; i++) Assets._installQ.push([() => { ran.late++; }, lateDone]);
      const b2 = ran.late;
      Assets.frameTick(2, 16.7);
      await sleep(80);
      const titleRan = ran.late - b2;
      Assets._installQ = sv.q; Assets._installOn = sv.on; Screens.current = sv.cur; Assets._stripQ = sv.sq; Assets._stripQLate = sv.sql;
      Assets._stripFlying = sv.fly; Assets._lateFly = sv.lfly; Assets._period = sv.per; Assets._lateSkipped = sv.skip;
      R1.s6 = { slice, quick, idle, forced, wirePlaying, wireTitle, titleRan, ahead: Assets.LATE_AHEAD, skip: Assets.LATE_SKIP };
    }
    /* §7 — a boat at anchor ships its oars */
    {
      let at = null;
      const tc = S.buildings.find(o => o.key === 'tc' && o.owner === 'P');
      let bd = 1e9;
      for (let y = 1; y < CFG.H - 1; y++) for (let x = 1; x < CFG.W - 1; x++)
        if (S.map.terrain[MapGen.idx(x, y)] === T.WATER && Units.canFish(x, y)) { const d = Math.hypot(x - tc.x, y - tc.y); if (d < bd) { bd = d; at = { x, y }; } }
      let r7 = { water: !!at };
      if (at) {
        const fb = Units.spawn('fishboat', 'P', at.x, at.y);
        const ok = Units.assignFish(fb, at.x, at.y);
        const before = Units.moving(fb), poseBefore = R.unitPose(fb), food0 = S.res.food;
        for (let i = 0; i < 4; i++) Units.update(0.05);
        r7 = { water: true, ok, before, poseBefore, after: Units.moving(fb), pose: R.unitPose(fb), onTile: (fb.x | 0) === at.x && (fb.y | 0) === at.y,
          fishing: !!(fb.task && fb.task.type === 'fish'), food: S.res.food > food0 };
        S.units = S.units.filter(u => u !== fb);
      }
      R1.s7 = r7;
    }
    /* §8 — an ended run stands its people down */
    {
      const v = S.units.find(u => u.owner === 'P' && u.kind === 'villager');
      const tc = S.buildings.find(o => o.key === 'tc' && o.owner === 'P');
      let goal = null;
      for (let r = 4; r < 12 && !goal; r++) for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) if (!goal && Path.passable(tc.x + dx, tc.y + dy, 'P')) goal = { x: tc.x + dx, y: tc.y + dy };
      v.task = null; Units.moveTo(v, goal.x, goal.y);
      const walking = R.unitPose(v);
      S.over = { win: true, cause: 'test' };
      const ended = R.unitPose(v);
      S.over = null;
      R1.s8 = { moving: Units.moving(v), walking, ended, again: R.unitPose(v) };
    }
    return R1;
  });

  const s1 = out.s1;
  ck('theFoundingAsksForWhatTheWorldHoldsOrCanRaise', s1.extra.length === 0 && s1.pv,
    s1.extra.length ? 'asked for nothing the world holds or a yard can train: ' + s1.extra.slice(0, 6).join(', ') : `the player's villagers asked: ${s1.pv}`);
  ck('andNeverTheRivalsWholeArmy', s1.rivalKinds.length < s1.all, `the rival's soldiers asked: ${s1.rivalKinds.length} of ${s1.all} kinds (${s1.rivalKinds.join(', ') || 'none'})`);
  const s2 = out.s2;
  ck('aNewWorldLetsTheLastOnesDyeGo', s2.hadGreen && s2.stale.length === 0 && s2.staleQ.length === 0 && s2.staleAfter.length === 0,
    `world 1 held its dye: ${s2.hadGreen}; world 2 kept ${s2.stale.length} of its sets, ${s2.staleQ.length} still queued, ${s2.staleAfter.length} after its own art settled`);
  ck('andKeepsOnlyItsOwnTier', s2.tierWrong.length === 0, s2.tierWrong.slice(0, 4).join(', ') || 'every villager set at its hall\'s tier');
  ck('andTheFramesDoNotGrowWorldAfterWorld', s2.f1 > 0 && s2.f2 <= s2.f1 * 1.15 + 40, `the same world in a new tunic: ${s2.f1} frames, then ${s2.f2} (the live build held both: ~${s2.f1 * 2})`);
  const s4 = out.s4;
  ck('aSoldierAsksForHisStripsWhenHeComesIntoTheWorld', s4.lancerAsked && s4.lancerCounted, `the player's lancer asked: ${s4.lancerAsked}, counted: ${s4.lancerCounted}`);
  ck('andTheRivalsUnderTheFogInTheBackground', !!s4.kindA && s4.rivalAsked && s4.rivalLate, `a rival ${s4.kindA} in the fog: asked ${s4.rivalAsked}, background ${s4.rivalLate}`);
  ck('andTheTitlesDemoAsksNothing', !s4.demoAsked, String(s4.demoAsked));
  const s4b = out.s4b;
  ck('aHeldArmyCardAsksForWhatItSummons', s4b.summoned.length > 3 && s4b.before.length > 0 && s4b.missing.length === 0,
    `${s4b.summoned.length} summoned kinds, ${s4b.before.length} asked by nothing else; still not asked: ${s4b.missing.join(', ') || 'none'}`);
  const s5 = out.s5;
  ck('aYardAsksForWhatItCanRaise', s5.placed && !s5.pre.rider && s5.l1.rider && !s5.l1.horsearcher, JSON.stringify(s5));
  ck('andAStoreyForItsNextRank', s5.l2.lvl === 2 && s5.l2.horsearcher, JSON.stringify(s5.l2));
  const s6 = out.s6;
  ck('whileAWorldIsPlayedTheSlicesInstallOnlyWhatAPressWaitsFor', s6.slice.counted === 2 && s6.slice.late === 0, JSON.stringify(s6.slice));
  ck('aQuickFrameInstallsInItsRoom', s6.quick >= 1 && s6.quick <= 3, `${s6.quick} background strips of 1.5 ms in a frame's 4 ms`);
  ck('aSlowFrameInstallsNothingButNeverForLong', s6.idle === s6.skip && s6.forced === 1, `${s6.idle} of ${s6.skip} slow frames idle, then ${s6.forced} forced`);
  ck('andOnlyAFewBackgroundStripsAreOnTheWire', s6.wirePlaying === s6.ahead && s6.wireTitle === 5, `playing: ${s6.wirePlaying} (LATE_AHEAD ${s6.ahead}); behind the title: ${s6.wireTitle} of 5`);
  ck('aWorldNobodyPlaysTakesTheSlicesAgain', s6.titleRan === 4, `${s6.titleRan} of 4`);
  const s7 = out.s7;
  ck('aBoatAtAnchorShipsItsOars', s7.water && s7.ok && s7.before && s7.poseBefore === 'walk' && !s7.after && s7.pose === 'gather' && s7.onTile && s7.fishing && s7.food,
    JSON.stringify(s7));
  const s8 = out.s8;
  ck('anEndedRunStandsItsPeopleDown', s8.moving && s8.walking === 'walk' && s8.ended === 'idle' && s8.again === 'walk', JSON.stringify(s8));
  await ctx.close();
}

/* ---- §9–§10: the journey's first world, held behind the title ----------------- */
{
  const ctx = await b.newContext({ viewport: { width: 500, height: 700 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto('file://' + join(root, 'index.html') + '?prologue=1', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.Screens && Screens.current === 'title' && !document.getElementById('splash') &&
    window.Prologue && Prologue.holding && Prologue.holding() && S.scenario === 'prologue_1' && window.TerrainX && TerrainX.on && TerrainX.ready, null, { timeout: 60000 });
  /* BEGIN is pressed the moment the held world exists, as a quick player does: the
     press waits for the glide's ground behind its plaque. Counted: a chunk drawn as
     the blurred stand-in while the game is on screen (the world drawn behind the
     opaque title while it waits is nobody's to see). */
  const g = await p.evaluate(() => {
    // (an older build has no glideViews: its checks fail, and BEGIN is still measured below)
    const sc = Scenarios.live(), TL = CFG.TILE, views = (Prologue.glideViews && Prologue.glideViews()) || [];
    const span = (CFG.W || 38) * TL;
    const inPx = views.every(([x, y, z]) => x > 0 && y > 0 && x < span && y < span && z > 0);
    const [sx, sy, sz] = views[0] || [0, 0, 0], last = views[views.length - 1] || [0, 0, 0];
    // the glide's first view is centred on its start in WORLD PIXELS (or as near as the board lets the camera go)
    const startNear = Math.hypot(sx - (sc.glideFrom.x + 0.5) * TL, sy - (sc.glideFrom.y + 0.5) * TL) <= R.viewW() / sz / 2 + TL;
    const vc = v => (TerrainX._viewsChunks && views.length ? TerrainX._viewsChunks(v, 0).length : 0);
    const startOnly = vc([views[0]]), endOnly = vc([last]), union = vc(views);
    window.__seen = { standIn: 0, frames: 0, fracAtOpen: null };
    const draw = TerrainX.drawGround;
    TerrainX.drawGround = function (gx) {
      if (Screens.current === 'playing') {
        const s = window.__seen;
        if (s.fracAtOpen == null) s.fracAtOpen = views.length ? this.viewFrac(views) : 0;
        s.frames++;
        for (const [cx, cy] of this.viewChunks(0)) if (!this.chunks.get(cx + ',' + cy)) s.standIn++;
      }
      return draw.call(this, gx);
    };
    return { n: views.length, inPx, startNear, zoomUp: sz < last[2], startOnly, endOnly, union,
      enter: /glideViews/.test(Screens.enterGame.toString()) && /viewFrac\(/.test(Screens.enterGame.toString()) };
  });
  ck('theGlideIsSeenInWorldPixels', g.n === 5 && g.inPx && g.startNear && g.zoomUp, `${g.n} views, in pixels: ${g.inPx}, the first on its start: ${g.startNear}, zooming in: ${g.zoomUp}`);
  ck('andItsGroundIsMoreThanTheViewItEndsOn', g.union > g.endOnly && g.union >= g.startOnly, `the glide's chunks ${g.union}, the end view's alone ${g.endOnly}, the start's ${g.startOnly}`);
  ck('andThePressWaitsForEveryViewOfIt', g.enter, 'Screens.enterGame asks TerrainX.viewFrac of Prologue.glideViews');
  const tPress = Date.now();
  await p.click('#btnBegin').catch(() => {});
  await p.waitForFunction(() => Screens.current === 'playing' && S.scenario === 'prologue_1', null, { timeout: 60000 });
  const opened = Date.now() - tPress;
  await p.waitForTimeout(3200);
  const seen = await p.evaluate(() => window.__seen);
  ck('theWorldOpensWithEveryViewOfItsGlidePainted', seen.fracAtOpen >= 1, `${Math.round((seen.fracAtOpen || 0) * 100)}% of the glide's ground in at its first frame (BEGIN to the game: ${opened} ms)`);
  ck('theJourneyOpensOnItsOwnGround', seen.frames > 0 && seen.standIn === 0, `stand-in chunks drawn in its first three seconds: ${seen.standIn} over ${seen.frames} frames`);

  /* §10 — the water keeps to the device's pace (a clock of its own, so the machine's
     load decides nothing: two seconds of frames at 60 Hz, drawn over game 1's pond) */
  const w = await p.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const t0 = performance.now();
    const life = () => { let n = 0; for (const [cx, cy] of TerrainX.viewChunks(0)) { const c = TerrainX.chunks.get(cx + ',' + cy); if (c && c.anim && (c.anim.sm || c.anim.cm)) n++; } return n; };
    // the glide and the guide's look may still move the camera: it is put back over the pond every look
    const over = () => { R.cam.z = R.defaultZoom ? R.defaultZoom() : R.cam.z; R.centerOn(28.5, 18.5); };
    over();
    while ((TerrainX.viewFrac() < 1 || !life()) && performance.now() - t0 < 20000) { await sleep(100); over(); }
    over();
    const g = document.createElement('canvas').getContext('2d');
    const realNow = performance.now;
    let fake = realNow.call(performance);
    const run = (iv, thr) => {
      TerrainX.opt.lifeSlowMs = thr; TerrainX._lifeSlowTill = 0; TerrainX._dgIv = iv;
      TerrainX._lifeBox = null; TerrainX._lifeBK = null; TerrainX._kA = TerrainX._kB = null;
      const c0 = TerrainX.stats.lifeComposes || 0;
      for (let i = 0; i < 120; i++) { fake += 1000 / 60; TerrainX.drawWaterLife(g); }
      return (TerrainX.stats.lifeComposes || 0) - c0;
    };
    let fast = 0, slow = 0;
    performance.now = () => fake;
    try { fast = run(16.7, undefined); slow = run(80, undefined); }
    finally { performance.now = realNow; TerrainX.opt.lifeSlowMs = undefined; TerrainX._lifeSlowTill = 0; TerrainX._dgIv = null; }
    return { life: life(), fast, slow, hz: TerrainX.LIFE_SLOW_HZ };
  });
  ck('theWaterKeepsAllItsTurnsOnADeviceThatKeepsUp', w.life > 0 && w.fast >= 18, `${w.fast} composes in two seconds over ${w.life} chunks of water`);
  ck('andTurnsSlowerOnOneThatDoesNot', w.life > 0 && w.slow <= w.hz * 2 + 1 && w.slow >= w.hz, `${w.slow} composes in two seconds at 80 ms a frame (at most ${w.hz} a second)`);
  await ctx.close();
}

console.log(JSON.stringify(res, null, 1));
console.log(fails.length ? 'FAILURES: ' + fails.join(', ') : 'ALL ART-BUDGET CHECKS PASS');
const realErrs = errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e));
console.log('errors:', realErrs.slice(0, 4));
await b.close();
if (fails.length || realErrs.length) process.exit(1);
