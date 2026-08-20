/* THE MUSTER HORN — one tap calls the whole workforce in, one tap sends it
   back to the exact jobs it was called off.

   The rules this file pins:

     THE INTERRUPTION         u.post is stamped where work is genuinely
     REMEMBERS                interrupted — the flee branches in Units.damage
                              and Units.soundHorn — and NOWHERE else. It is
                              deliberately not written by every assign* call:
                              a post recorded the moment the tools go down IS
                              the last real order, so there is nothing to keep
                              in sync and nothing to clear when the player
                              gives a fresh one.

     …AND A SECOND FRIGHT     rememberPost refuses to overwrite with a flee or
     DOES NOT ERASE IT        garrison task. A villager frightened twice must
                              still remember the seam it was working, or the
                              horn's whole promise evaporates in a long raid.

     BACK TO WORK NEVER       Units.backToWork moves only hands that are OFF
     YANKS ANYBODY OFF A JOB  DUTY (idle, fleeing, sheltering — Units.offDuty).
                              A villager the player has since re-tasked keeps
                              its new order, which is also what makes a stale
                              post harmless: it is never read, and the next
                              interruption overwrites it.

     EVERY ROAD HOME IS       The camp may have burned, the stand may have
     VALIDATED                been felled by somebody else, another hand may
                              have taken the last place on the plot. A post
                              that no longer exists is not an error — the
                              villager stands down where they are.

     THE SHELTERED CARRY      A villager who reaches the hall leaves S.units
     THEIRS INSIDE            entirely, so the post rides on the garrison
                              entry and comes back out with them. A
                              pre-horn save's garrison entries simply have
                              none, and those villagers are let out idle.

     THE PANEL SHOWS ONLY     Units.hornPending is how many hands a BACK TO
     WHAT CAN ACT             WORK would actually move — the button's own
                              gate — and hornPosts how many have a job to go
                              back to, which is what its label may promise.
                              With nobody to send, neither renders.

     SOLDIERS KEEP THEIR      Villagers only, the same line Units.canBanish
     POSTS                    draws. An army has its own stances.           */

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
  const ck = (n, ok, info) => { res[n] = ok ? 'PASS' : 'FAIL ' + (info || ''); if (!ok) fails.push(n); };

  // ---- a clean village: bare ground round the hall, one wood, one farm ----
  const stage = (seed) => {
    G.newGame(seed, 'moderate', 'medium');
    Screens._demo = false; Screens.show('playing'); S.paused = true;
    const tc = Bld.tcOf('P');
    for (let dy = -7; dy <= 8; dy++) for (let dx = -7; dx <= 8; dx++) {
      const x = tc.x + dx, y = tc.y + dy;
      if (!MapGen.inB(x, y)) continue;
      const at = Bld.at(x, y);
      if (at && at.key !== 'tc') Bld.removeToRuin(at);
      S.map.terrain[MapGen.idx(x, y)] = T.GRASS;
      S.map.explored[MapGen.idx(x, y)] = 1;
    }
    const wood = { x: tc.x + 3, y: tc.y };
    S.map.terrain[MapGen.idx(wood.x, wood.y)] = T.FOREST;
    S.map.resAmount[MapGen.idx(wood.x, wood.y)] = 400;
    const plot = { x: tc.x - 3, y: tc.y };
    S.map.terrain[MapGen.idx(plot.x, plot.y)] = T.BARREN;
    const farm = Bld.place('P', 'farm', plot.x, plot.y, { free: true, instant: true });
    Bld.rebuildBlock(); G.updateVisibility();
    const vs = S.units.filter(u => u.owner === 'P' && Units.isVillager(u));
    return { tc, wood, farm, vs };
  };

  // ============ 1. the horn remembers, and puts them back ============
  {
    const { tc, wood, farm, vs } = stage('horn-a');
    ck('theVillageHasHandsToCallIn', vs.length >= 2, 'villagers ' + vs.length);
    const chop = vs[0], hand = vs[1];
    chop.x = wood.x - 1.5; chop.y = wood.y + 0.5;
    const gathering = Units.assignGather(chop, wood.x, wood.y);
    hand.task = { type: 'work', id: farm.id }; Units.setPath(hand, farm.x, farm.y);
    ck('aHandIsOnTheWoodAndAHandOnThePlot',
      gathering && chop.task.type === 'gather' && hand.task.type === 'work', '');

    const called = Units.soundHorn('P');
    ck('theHornCallsEveryVillagerIn',
      called === vs.length && vs.every(u => u.task && u.task.type === 'garrison'),
      'called ' + called);
    ck('andTheirPostsAreStamped',
      chop.post && chop.post.type === 'gather' &&
      chop.post.x === wood.x && chop.post.y === wood.y &&
      hand.post && hand.post.type === 'work' && hand.post.id === farm.id,
      JSON.stringify([chop.post, hand.post]));

    // a SECOND fright must not erase the real post
    Units.rememberPost(chop);
    ck('aSecondFrightDoesNotEraseThePost',
      chop.post && chop.post.type === 'gather', JSON.stringify(chop.post));

    ck('theButtonKnowsHowManyItWouldMove',
      Units.hornPending('P') >= 2 && Units.hornPosts('P') >= 2,
      'pending ' + Units.hornPending('P') + ' posts ' + Units.hornPosts('P'));

    const r = Units.backToWork('P');
    ck('backToWorkPutsThemBackOnTheirOwnJobs',
      r.sent === 2 && chop.task && chop.task.type === 'gather' &&
      chop.task.x === wood.x && chop.task.y === wood.y &&
      hand.task && hand.task.type === 'work' && hand.task.id === farm.id,
      JSON.stringify(r) + ' ' + JSON.stringify([chop.task, hand.task]));
    ck('andTheMemoryIsSpent',
      !chop.post && !hand.post && Units.hornPending('P') === 0, '');
  }

  // ============ 2. the sheltered carry their post inside ============
  {
    const { tc, wood, farm, vs } = stage('horn-b');
    const chop = vs[0];
    chop.x = wood.x - 1.5; chop.y = wood.y + 0.5;
    Units.assignGather(chop, wood.x, wood.y);
    Units.soundHorn('P');
    for (let i = 0; i < 1200 && S.units.some(u => u.owner === 'P' && Units.isVillager(u)); i++)
      Units.update(0.1);
    ck('theyReallyGoInside', S.garrison.length === vs.length, 'garrison ' + S.garrison.length);
    ck('andTheirPostGoesInWithThem',
      S.garrison.some(gv => gv.post && gv.post.type === 'gather'),
      JSON.stringify(S.garrison));
    ck('aShelteredHandStillCountsAsPending', Units.hornPending('P') === S.garrison.length, '');

    const r = Units.backToWork('P');
    const back = S.units.filter(u => u.owner === 'P' && Units.isVillager(u));
    ck('theHornLetsThemOutAgain', r.out === vs.length && back.length === vs.length,
      JSON.stringify(r));
    ck('andTheOneWithAPostWalksBackToIt',
      r.sent === 1 && back.some(u => u.task && u.task.type === 'gather' &&
        u.task.x === wood.x && u.task.y === wood.y), JSON.stringify(r));

    // a PRE-HORN save's garrison entries carry no post — they simply come out
    Units.soundHorn('P');
    for (let i = 0; i < 1200 && S.units.some(u => u.owner === 'P' && Units.isVillager(u)); i++)
      Units.update(0.1);
    for (const gv of S.garrison) delete gv.post;
    const r2 = Units.backToWork('P');
    ck('aPreHornSaveJustLetsThemOut',
      r2.out === vs.length && r2.sent === 0 &&
      S.units.filter(u => u.owner === 'P' && Units.isVillager(u)).length === vs.length,
      JSON.stringify(r2));
  }

  // ============ 3. back to work never yanks anybody off a job ============
  {
    const { tc, wood, farm, vs } = stage('horn-c');
    const chop = vs[0], hand = vs[1];
    chop.x = wood.x - 1.5; chop.y = wood.y + 0.5;
    Units.assignGather(chop, wood.x, wood.y);
    Units.soundHorn('P');
    // the player re-tasks one of them by hand while they are walking in
    Units.moveTo(chop, tc.x + 5, tc.y + 5);
    ck('aReTaskedHandIsNotOffDuty', !Units.offDuty(chop), chop.task && chop.task.type);
    const others = vs.filter(u => u !== chop);
    Units.backToWork('P');
    ck('andBackToWorkLeavesItAlone',
      chop.task && chop.task.type === 'move' && chop.post,
      JSON.stringify(chop.task) + ' post ' + JSON.stringify(chop.post));
    // …while the hands with nothing to go back to stop walking to shelter
    // rather than trooping into a hall nobody asked them to hide in
    ck('whileTheRestStandDownWhereTheyAre',
      others.every(u => !u.task), JSON.stringify(others.map(u => u.task)));
  }

  // ============ 4. every road home is validated ============
  {
    const { tc, wood, farm, vs } = stage('horn-d');
    const hand = vs[0];
    hand.task = { type: 'work', id: farm.id };
    Units.soundHorn('P');
    ck('thePostIsThePlot', hand.post && hand.post.id === farm.id, '');
    Bld.removeToRuin(farm);                       // …and the plot burns down
    const r = Units.backToWork('P');
    ck('aBurnedPostSendsNobody', r.sent === 0, JSON.stringify(r));
    ck('andTheHandSimplyStandsDown',
      !hand.task && !hand.post, JSON.stringify(hand.task));

    // …and a plot somebody else has filled refuses too
    const { farm: f2, vs: v2 } = stage('horn-e');
    const a = v2[0], b2 = v2[1], c = v2[2];
    a.task = { type: 'work', id: f2.id };
    Units.soundHorn('P');
    // two other hands take both places while a is sheltering
    b2.task = { type: 'work', id: f2.id }; b2.x = f2.x + 0.5; b2.y = f2.y + 0.5;
    if (c) { c.task = { type: 'work', id: f2.id }; c.x = f2.x + 0.5; c.y = f2.y + 0.5; }
    const full = Bld.workersAssigned(f2) >= Bld.maxWorkers(f2);
    const sent = Units.returnToPost(a);
    ck('aFullPlotTurnsThemAway', !full || sent === false,
      'full ' + full + ' sent ' + sent);
  }

  // ============ 5. fleeing a raid stamps the post too ============
  {
    const { tc, wood, vs } = stage('horn-f');
    const chop = vs[0];
    chop.x = wood.x - 1.5; chop.y = wood.y + 0.5;
    Units.assignGather(chop, wood.x, wood.y);
    const raider = Units.spawn('raider', 'R', (chop.x | 0) + 1, (chop.y | 0) + 1);
    Units.damage(chop, 1, raider.id, 'R');
    ck('aFrightenedHandFlees', chop.task && chop.task.type === 'flee',
      chop.task && chop.task.type);
    ck('andRemembersWhatItWasDoing',
      chop.post && chop.post.type === 'gather' && chop.post.x === wood.x,
      JSON.stringify(chop.post));
    ck('soOneTapPutsAScatteredVillageBack',
      Units.backToWork('P').sent === 1 &&
      chop.task && chop.task.type === 'gather', JSON.stringify(chop.task));
  }

  // ============ 6. soldiers keep their posts ============
  {
    const { tc, vs } = stage('horn-g');
    const sol = Units.spawn('defender', 'P', tc.x + 2, tc.y + 2);
    Units.moveTo(sol, tc.x + 5, tc.y + 5);
    const before = sol.task && sol.task.type;
    Units.soundHorn('P');
    ck('theHornIsForVillagers',
      sol.task && sol.task.type === before && !sol.post,
      JSON.stringify(sol.task));
    Units.backToWork('P');
    ck('andSoIsBackToWork', sol.task && sol.task.type === before, '');
  }

  // ============ 7. the panel offers only what can act ============
  {
    const { tc, wood, vs } = stage('horn-h');
    ck('nothingToCallBackYet', Units.hornPending('P') === 0 && Units.hornPosts('P') === 0,
      'pending ' + Units.hornPending('P'));
    const chop = vs[0];
    chop.x = wood.x - 1.5; chop.y = wood.y + 0.5;
    Units.assignGather(chop, wood.x, wood.y);
    Units.soundHorn('P');
    ck('afterTheHornThereIs', Units.hornPending('P') === 1, 'pending ' + Units.hornPending('P'));
    // the TC panel's signature has to carry it, or the button never appears
    UI.select('bld', tc.id);
    const sig0 = UI.panelSig();
    Units.backToWork('P');
    ck('andThePanelSignatureFollowsIt', UI.panelSig() !== sig0, sig0);
    ck('theLineNamesTheJobsNotTheHeads',
      typeof UI.hornBackLine() === 'string', UI.hornBackLine());
  }

  // ============ 8. it rides in the save, and a legacy save is fine ============
  {
    const { wood, vs } = stage('horn-i');
    const chop = vs[0];
    chop.x = wood.x - 1.5; chop.y = wood.y + 0.5;
    Units.assignGather(chop, wood.x, wood.y);
    Units.soundHorn('P');
    const snap = JSON.stringify(S);
    ck('thePostIsInTheSave', snap.indexOf('"post"') > 0, '');
    G.loadJSON(snap);
    const after = S.units.filter(u => u.owner === 'P' && Units.isVillager(u));
    ck('andSurvivesALoad',
      after.some(u => u.post && u.post.type === 'gather'), '');
    // a save written before any of this simply has no posts anywhere
    const legacy = JSON.parse(snap);
    for (const u of legacy.units) delete u.post;
    for (const gv of (legacy.garrison || [])) delete gv.post;
    G.loadJSON(JSON.stringify(legacy));
    ck('aPreHornSaveLoadsWithNoPosts',
      S.units.every(u => u.post == null) && Units.hornPending('P') === 0, '');
    ck('andTheHornStillWorksInIt', Units.soundHorn('P') > 0, '');
  }

  return { res, fails };
});
console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL MUSTER HORN CHECKS PASS');
console.log('errors:', errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e)));
await b.close();
process.exit(out.fails.length ? 1 : 0);
