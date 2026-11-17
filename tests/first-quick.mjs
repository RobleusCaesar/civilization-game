/* THE FIRST GAME (CFG.FIRST_QUICK, CFG.MODES.first_quick — build 178;
   operator: "891 games started but only 377 lasted a minute, only 13% of
   games reach a result, winning takes ~140 days, and only 19 players have
   ever earned a card").

     WHO         A device's FIRST game — nothing founded here, no save of its
                 own in the cloud, no card ever won — plays the hidden
                 first_quick profile. A shared ?seed= link overrides it, and
                 game two is the ordinary trial screen.
     THE FLOW    New Game skips the difficulty: straight to three origins
                 dealt from the curated pool (no sea), then the world.
     THE WORLD   The smallest board, Valley · Classic, a Calm rival that
                 grows slower and whose hall comes down sooner, the rival's
                 hall shown on the map, richer ground by the seat, a cheaper
                 and quicker Wonder — and the "two roads" modal says THIS
                 run's price and days.
     THE LESSON  The four fort steps (range, tower, man the tower, wall) are
                 cut from the spine; the rest of the lesson runs.
     THE CARD    The hall's second storey pays ONE card of the milestone tier
                 (Iron), once a run, into the deck — the world holds still
                 while it rises, a tap turns it, CLAIM flies it home.
     THE END     The end screen invites the next game, and the win does not
                 go on the world board.
     THE TABLES  Every table keyed by difficulty reads the profile's base
                 (CFG.baseMode): calm.

   Run after touching: js/config.js (MODES.first_quick, FIRST_QUICK,
   baseMode), screens.js (firstQuickWanted, btnTitleNew, foundRun,
   boardHold, showVictoryPaths), cards.js (offer), buildings.js (milestone,
   effCost, wonderTimeMult, damage), deck.js (milestone, the sync's
   milestone op, lessonHolds), deckscreens.js (milestoneReveal, the end's
   ceNext line), tutorial.js (tutCut), game.js (startResMult, revealRival),
   map.js (startResMin).

     node tests/first-quick.mjs      # exits non-zero on any regression */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });
const res = {}, fails = [];
const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };
const errs = [];
const page = async (q) => {
  const ctx = await b.newContext({ viewport: { width: 430, height: 880 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto('file://' + join(root, 'index.html') + (q || ''), { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.Screens && Screens.current === 'title', null, { timeout: 20000 });
  await p.waitForTimeout(400);
  return { p, ctx };
};

// ---- 1. WHO, and THE FLOW: a fresh device's New Game goes straight to the origins ----
{
  const { p, ctx } = await page();
  const r = await p.evaluate(async () => {
    const out = { wanted: Screens.firstQuickWanted() };
    document.getElementById('btnTitleNew').click();
    const t0 = performance.now();
    while (Screens.current !== 'draft' && performance.now() - t0 < 15000) await new Promise(r => setTimeout(r, 50));
    out.screen = Screens.current;
    out.mode = S.mode; out.size = S.sizeKey; out.land = S.map.landform; out.variant = S.map.variant;
    out.hand = (S.draft && S.draft.hand || []).map(c => c.key);
    out.pool = CFG.FIRST_QUICK.ORIGINS.slice();
    out.naval = out.hand.filter(k => /reaver|mariner|sea|boat|ship/i.test(k + ' ' + ((Cards.DEFS[k] || {}).name || '')));
    out.sawTrials = !!document.querySelector('#scrNewgame.show');
    return out;
  });
  ck('aFreshDeviceWantsTheFirstGame', r.wanted === true, '');
  ck('newGameSkipsTheDifficultyToTheOrigins', r.screen === 'draft' && !r.sawTrials && r.mode === 'first_quick', `screen ${r.screen}, mode ${r.mode}`);
  ck('onTheSmallestValleyClassicBoard', r.size === 'medium' && r.land === 'valley' && r.variant === 'classic', `${r.size} ${r.land}·${r.variant}`);
  ck('threeOriginsFromTheCuratedPoolAndNoneOfTheSea', r.hand.length === 3 && r.hand.every(k => r.pool.includes(k)) && r.naval.length === 0,
    `hand ${r.hand.join(', ')} from ${r.pool.join(', ')}`);
  // GAME TWO: a game founded here — the trial screen is back
  const r2 = await p.evaluate(async () => {
    const c = document.querySelector('#scrDraft .ocard');
    Screens.noteGameFounded && Screens.noteGameFounded();
    Screens.show('title');
    await new Promise(r => setTimeout(r, 100));
    return { wanted: Screens.firstQuickWanted(), founded: Screens.gamesFounded() };
  });
  ck('gameTwoIsTheOrdinaryTrialScreen', r2.wanted === false && r2.founded >= 1, `founded ${r2.founded}`);
  await ctx.close();
}
// A SHARED LINK STILL OVERRIDES
{
  const { p, ctx } = await page('?seed=12345');
  const w = await p.evaluate(() => Screens.firstQuickWanted());
  ck('aSharedSeedLinkStillOverrides', w === false, '');
  await ctx.close();
}
// A CARD WON BEFORE, OR A SAVE IN THE CLOUD: not a first game
{
  const { p, ctx } = await page();
  const r = await p.evaluate(() => {
    const out = {};
    Screens._cloudSaves = 1; out.cloud = Screens.firstQuickWanted(); Screens._cloudSaves = 0;
    const c = Deck.col(); c.runs['x'] = [{ id: 'siege_train', tier: 'iron' }]; out.won = Screens.firstQuickWanted(); delete c.runs['x'];
    out.clean = Screens.firstQuickWanted();
    return out;
  });
  ck('aCloudSaveOrACardWonBeforeIsNoFirstGame', r.cloud === false && r.won === false && r.clean === true, JSON.stringify(r));
  await ctx.close();
}

// ---- 2. THE WORLD, THE LESSON, THE CARD, THE END ----
{
  const { p, ctx } = await page();
  const r = await p.evaluate(async () => {
    const out = {};
    const nap = ms => new Promise(r => setTimeout(r, ms));
    const M = CFG.MODES.first_quick;
    out.base = CFG.baseMode('first_quick');
    out.hidden = !!M.hidden;
    // the world as founded in the profile
    G.newGame('fq-a', 'first_quick', 'medium'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    const rtc = Bld.tcOf('A');
    out.rivalSeen = !!(rtc && S.map.seenB && Object.values(S.map.seenB).some(g => g && g.key === 'tc')) || !!(rtc && S.map.explored[rtc.y * S.map.w + rtc.x]);
    const W = CFG.BUILDINGS.wonder.levels[0];
    const c = Bld.effCost('P', 'wonder');
    out.wonder = c; out.wonderFull = W.cost;
    out.wonderDays = Math.round(W.time * Bld.wonderTimeMult());
    // the rival hall takes more of each blow
    const hp0 = rtc.hp; Bld.damage(rtc, 10, 'P'); out.hallTook = hp0 - rtc.hp;
    rtc.hp = hp0;
    // the same world on Calm, for the comparison
    G.newGame('fq-a', 'calm', 'medium');
    const rtc2 = Bld.tcOf('A'); const h2 = rtc2.hp; Bld.damage(rtc2, 10, 'P'); out.calmTook = h2 - rtc2.hp;
    out.calmWonder = Bld.effCost('P', 'wonder');
    // the "two roads" modal says THIS run's price
    G.newGame('fq-b', 'first_quick', 'medium'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    const el = Screens.showVictoryPaths();
    out.modal = el ? el.querySelector('.vpRoad:last-child p').textContent : '';
    Screens.hideVictoryPaths();
    out.wonderNow = Bld.effCost('P', 'wonder');
    // THE LESSON: the four fort steps are booked done
    Tutorial.maybeStart && (S.tut = null);
    try { localStorage.setItem('neo-tutorial-ask', '1'); } catch (e) {}
    Tutorial.maybeStart();
    for (let i = 0; i < 4; i++) { Tutorial.frame && Tutorial.frame(0.5); await nap(30); }
    out.tutOn = !!(S.tut && S.tut.on);
    out.cut = ['range', 'tower', 'manTower', 'wall'].map(k => !!(S.tut && S.tut.done && S.tut.done[k]));
    out.kept = ['house', 'barracks', 'tcReady'].map(k => !!(S.tut && S.tut.done && S.tut.done[k]));
    return out;
  });
  ck('theProfileIsHiddenAndItsTablesReadCalm', r.base === 'calm' && r.hidden === true, `base ${r.base}`);
  ck('theRivalsHallIsShownOnTheMap', r.rivalSeen === true, '');
  ck('theRivalsHallComesDownSooner', r.hallTook > r.calmTook && r.calmTook > 0, `a 10 blow took ${r.hallTook} (Calm ${r.calmTook})`);
  const cheap = ['food', 'wood', 'stone', 'gold'].every(k => r.wonder[k] < r.calmWonder[k]);
  ck('theWonderIsCheaperAndQuicker', cheap && r.wonderDays < 45 && r.wonderDays > 0, `${JSON.stringify(r.wonder)} in ${r.wonderDays} days (Calm ${JSON.stringify(r.calmWonder)})`);
  const says = r.modal.includes(r.wonderDays + ' days') && Object.values(r.wonderNow).filter(v => v > 0).every(v => r.modal.replace(/,/g, '').includes(String(v)));
  ck('andTheTwoRoadsModalSaysThisRunsPrice', says, r.modal.slice(0, 160));
  ck('theLessonCutsTheFourFortSteps', r.tutOn && r.cut.every(Boolean) && !r.kept.some(Boolean), `cut ${r.cut} kept-open ${r.kept}`);
}

// ---- 3. THE MILESTONE CARD ----
{
  const { p, ctx } = await page();
  const r = await p.evaluate(async () => {
    const out = {};
    const nap = ms => new Promise(r => setTimeout(r, ms));
    const ironN = () => Deck.CATALOG.filter(c => c.tier === 'iron').reduce((a, c) => a + Deck.count(c.id), 0);
    // not on Calm
    G.newGame('fq-m0', 'calm', 'medium'); Screens._demo = false; Screens.show('playing'); S.runId = 'run-calm';
    let tc = Bld.tcOf('P'); const n0 = ironN(); tc.upgrading = 1; Bld.finishUpgrade(tc);
    out.calmGrant = ironN() - n0; out.calmOverlay = !!document.getElementById('msCard');
    // the first game
    G.newGame('fq-m1', 'first_quick', 'medium'); Screens._demo = false; Screens.show('playing'); S.runId = 'run-fq-1';
    S.paused = false;
    tc = Bld.tcOf('P');
    const before = ironN(), q0 = Deck.col().queue.length;
    tc.upgrading = 1; Bld.finishUpgrade(tc);
    out.level = tc.level;
    out.grant = ironN() - before;
    out.milestoneDay = S.milestone;
    const op = Deck.col().queue.slice(q0).find(o => o.op === 'milestone');
    out.op = op ? { run: op.run, tier: Deck.card(op.card).tier } : null;
    // the cloud op goes through its own door
    if (op) {
      const was = Backend.rpc; let asked = null;
      Backend.rpc = async (name, args) => { asked = { name, args }; return { ok: true, data: { ok: true, card: op.card } }; };
      try { out.verdict = (await Deck._syncDeliver(op)).verdict; } finally { Backend.rpc = was; }
      out.door = asked && asked.name + ':' + asked.args.p_run_id;
    }
    out.paused = S.paused;
    const ov = document.getElementById('msCard');
    out.overlay = !!ov;
    out.holdsLesson = Screens.modalUp();
    await nap(1000);
    const face = ov && ov.querySelector('.ccard');
    out.faceTier = face ? [...face.classList].find(c => c.startsWith('t-')) : null;
    face && face.click(); out.flipped = !!(face && face.classList.contains('flip'));
    ov.querySelector('.msClaim').click();
    const t0 = performance.now();
    while (document.getElementById('msCard') && performance.now() - t0 < 3000) await nap(50);
    out.gone = !document.getElementById('msCard');
    out.resumed = S.paused === false;
    // never twice: the third storey pays nothing, nor a second ask
    const n2 = ironN();
    tc.upgrading = 1; Bld.finishUpgrade(tc);
    out.again = ironN() - n2;
    // and it rides the save
    const saved = JSON.parse(G.saveJSON ? G.saveJSON() : JSON.stringify(S));
    out.saved = saved.milestone;
    return out;
  });
  ck('notOnAnOrdinaryGame', r.calmGrant === 0 && !r.calmOverlay, '');
  ck('theFirstGamesHallPaysOneIronCard', r.level === 2 && r.grant === 1 && r.faceTier === 't-iron' && r.op && r.op.tier === 'iron' && r.op.run === 'run-fq-1',
    `level ${r.level}, +${r.grant} Iron, face ${r.faceTier}, op ${JSON.stringify(r.op)}`);
  ck('andTheCloudHearsItThroughItsOwnDoor', r.door === 'grant_milestone:run-fq-1' && r.verdict === 'done', `${r.door} → ${r.verdict}`);
  ck('theWorldHoldsWhileItRises', r.overlay && r.paused === true && r.holdsLesson === true, `paused ${r.paused}, lesson held ${r.holdsLesson}`);
  ck('aTapTurnsItAndClaimFliesItHome', r.flipped && r.gone && r.resumed, `flipped ${r.flipped}, gone ${r.gone}, resumed ${r.resumed}`);
  ck('onceARunAndInTheSave', r.again === 0 && r.saved > 0, `third storey +${r.again}, saved ${r.saved}`);
  await ctx.close();
}

// ---- 4. THE END: the next game invited, the board left alone ----
{
  const { p, ctx } = await page();
  const r = await p.evaluate(async () => {
    const nap = ms => new Promise(r => setTimeout(r, ms));
    G.newGame('fq-e', 'first_quick', 'medium'); Screens._demo = false; Screens.show('playing');
    const hold = Screens.boardHold(true);
    G.end(true, 'razed_rival_tc');
    const t0 = performance.now();
    while (!document.querySelector('.ceNext') && performance.now() - t0 < 8000) await nap(100);
    const line = document.querySelector('.ceNext');
    return { hold, line: line ? line.textContent : '', want: CFG.FIRST_QUICK.NEXT_LINE };
  });
  ck('theEndInvitesTheNextGame', r.line === r.want, r.line || 'no line');
  ck('andTheFirstGameIsNotPostedToTheBoard', !!r.hold && /first game/i.test(String(r.hold.hold || r.hold)), JSON.stringify(r.hold));
  await ctx.close();
}

// ---- 5. THE TABLES: every table keyed by difficulty finds the profile ----
{
  const { p, ctx } = await page();
  const r = await p.evaluate(() => {
    const out = {};
    G.newGame('fq-t', 'first_quick', 'medium');
    out.score = (() => { try { return Score.compute(true).total > 0; } catch (e) { return String(e); } })();
    out.table = (() => { try { return Deck.table({ win: true, mode: 'first_quick' }).length === 5; } catch (e) { return String(e); } })();
    out.endModes = Assets.endgameModes ? Assets.endgameModes().includes('first_quick') : false;
    return out;
  });
  ck('theScoreAndTheDropTableFindTheProfile', r.score === true && r.table === true, JSON.stringify(r));
  ck('andNoArtIsAskedForAHiddenMode', r.endModes === false, '');
  await ctx.close();
}

ck('thePageThrewNothing', errs.length === 0, errs.slice(0, 3).join(' | '));
await b.close();
for (const k in res) console.log('  ' + k + ': ' + res[k]);
console.log(fails.length ? fails.length + ' FAILURE(S) — ' + fails.join(', ') : 'ALL FIRST-GAME CHECKS PASS');
process.exit(fails.length ? 1 : 0);
