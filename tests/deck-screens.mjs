/* THE CARD SYSTEM — the end screen and the collection (js/deckscreens.js).

   This file pins:

     THE SWITCH        off (the shipped default), the end of a run is exactly
                       today's victory and defeat scenes and the title is
                       exactly today's title: no plaque, no element, no
                       stylesheet, no listener, no write
     THE TITLE         on, a "Cards" plaque joins the secondary row as plain
                       text, the row folds two by two so no label runs off
                       its plaque at any phone width, the hero plaques stay
                       three, and the starter hand is dealt once
     THE REWARD        on, a win shows the gold banner with laurels, a loss
                       the cold one without; the card stands on the plinth's
                       slit with its tier and name on the plate below, the
                       run's final score, the cards it played, the deck's
                       size, CLAIM and LEADERBOARD; the old scenes stand down
     THE GRANT         happens once, when the screen opens, however often it
                       reopens; a win earns however short (a two-minute one
                       included); a defeat short of its deeds says how far it
                       got where the card would stand, and earns nothing; a
                       card-assisted run wears its mark in the score's box and
                       carries its count to the board
     THE CEREMONY      the card rises (a real animation), settles, turns
                       over and back on a tap; CLAIM lands it in the deck and
                       the count ticks up; a great victory's bonus card rises
                       only after the first is claimed; REPLAY and MENU wait
                       until every card is claimed
     THE BOARD         the run's board nodes are lent to the reward screen
                       and handed back to the old scene; LEADERBOARD goes and
                       comes back to the screen as it was left
     THE MOTION        every keyframe moves transform or opacity alone; a
                       Stone reveal lands in ~1.2-1.6s and an Enlightenment
                       one in ~2.5s; asking for less motion shows the same
                       screen with nothing animated
     THE COLLECTION    five tier tabs with held counts, ×N badges, played
                       cards greyed, undiscovered ones as "?" silhouettes
                       that carry neither art, name nor text anywhere in the
                       page, completion per tier, tap to enlarge, tap to flip
                       both ways, 44px targets, a grid that fits the phone
     THE FIT           the reward screen fits a 390x844 phone and a
                       1280x800 window without scrolling

   Run after touching: js/deckscreens.js, the DeckScreens hooks in
   js/screens.js (onTitle, onEndgame, leaveEnd/endReplay/endMenu, atEnd,
   ldrBack), Deck.face in js/deck.js, the title's secondary row.

     node tests/deck-screens.mjs      # exits non-zero on any regression

   If a feature genuinely needs different behaviour, update this file in the
   same commit and say so in the commit message. */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });
const url = 'file://' + join(root, 'index.html');

const res = {}, fails = [], errs = [];
const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };

async function page(o) {
  o = o || {};
  const ctx = await b.newContext({ viewport: { width: o.w || 390, height: o.h || 844 }, deviceScaleFactor: o.dpr || 3,
    reducedMotion: o.reduce ? 'reduce' : 'no-preference' });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND|net::/.test(m.text())) errs.push('console: ' + m.text()); });
  await p.goto(url + (o.q || ''), { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.Screens && Screens.current === 'title', null, { timeout: 30000 });
  await p.evaluate(() => Boot.force && Boot.force());
  await p.waitForFunction(() => document.fonts.status === 'loaded', null, { timeout: 15000 });
  // the boot's own art probing holds the main thread for seconds; a finished
  // game never meets it, and the reveal's timing is measured past it
  await p.waitForFunction(() => window.Assets && Assets.artReady && Assets.artReady(), null, { timeout: 60000 }).catch(() => {});
  return p;
}
/* a finished run, founded the way a real one is (never the title's demo
   world) and made eligible for a card unless told otherwise; the grant's
   dice are loaded so the reveal shows the card the check expects */
const SETUP = `window.__run = (o) => {
  Screens._demo = false;
  G.newGame(o.seed, o.mode || 'moderate', 'medium');
  Screens.show('playing'); S.paused = true;
  S.playtime = o.secs == null ? 900 : o.secs;
  S.stats.kills = 80; S.stats.built = o.built == null ? 20 : o.built; S.day = o.day || 140;
  if (o.played) S.deck.played.push(...o.played);
  if (o.cards) {
    let i = 0, j = 0;
    window.__roll = window.__roll || { t: Deck.rollTier, c: Deck.rollCard };
    Deck.rollTier = () => o.cards[Math.min(i++, o.cards.length - 1)][0];
    Deck.rollCard = () => o.cards[Math.min(j++, o.cards.length - 1)][1];
  }
  G.end(o.win, 'test', o.cause || (o.win ? 'razed_rival_tc' : 'tc_destroyed'));
};
window.__fresh = () => { Deck._col = null; Deck._del(Deck.KEY); };
window.__shown = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';`;

/* ================= 1. THE SWITCH, OFF ================= */
{
  const p = await page();
  await p.evaluate(SETUP);
  const a = await p.evaluate(async () => {
    const out = {};
    Deck._dev = null; Deck._del('neo-cards-dev');
    out.shipsOff = CFG.CARDS.ON === false && !Deck.on();
    Screens.show('title');
    out.plaque = !!document.getElementById('btnTitleCards');
    out.row = document.querySelectorAll('#scrTitle .trow3 .abtn').length;
    out.four = document.querySelector('#scrTitle .trow3').classList.contains('clFour');
    window.__run({ seed: 'ds-off-w', win: true });
    await new Promise(r => setTimeout(r, 250));
    out.winScene = getComputedStyle(document.getElementById('victoryScene')).display !== 'none';
    out.pane = getComputedStyle(document.getElementById('victoryPane')).display;
    out.nameHome = !!document.querySelector('#victoryScene #nameRow');
    out.winMode = document.getElementById('scrEndgame').className;
    out.endWin = Screens.current;
    window.__run({ seed: 'ds-off-l', win: false });
    await new Promise(r => setTimeout(r, 250));
    out.lossScene = getComputedStyle(document.getElementById('defeatScene')).display !== 'none';
    out.lossMode = document.getElementById('scrEndgame').className;
    out.trace = ['cardEnd', 'scrCards', 'deckScreensCss', 'btnTitleCards'].filter(id => document.getElementById(id));
    out.listening = DeckScreens._listening;
    out.stored = Deck._get(Deck.KEY);
    return out;
  });
  ck('theSwitchShipsOff', a.shipsOff);
  ck('offTheTitleIsTodaysTitle', !a.plaque && a.row === 3 && !a.four, `plaque ${a.plaque}, ${a.row} secondary plaques, folded ${a.four}`);
  ck('offAVictoryIsTodaysScene', a.endWin === 'endgame' && a.winScene && a.pane === 'none' && a.nameHome && /victoryMode/.test(a.winMode) && !/ceMode/.test(a.winMode),
    `scene ${a.winScene}, tally ${a.pane}, name box home ${a.nameHome}, ${a.winMode}`);
  ck('offADefeatIsTodaysScene', a.lossScene && /defeatMode/.test(a.lossMode) && !/ceMode/.test(a.lossMode), a.lossMode);
  ck('offNothingIsMadeOrWritten', a.trace.length === 0 && !a.listening && a.stored == null,
    `made: ${a.trace.join(',') || 'nothing'}, listening ${a.listening}, stored ${a.stored}`);
  await p.close();
}

/* ================= 2. THE TITLE, ON ================= */
{
  const p = await page({ q: '?cards=1' });
  const a = await p.evaluate(() => {
    const out = {};
    out.on = Deck.on();
    const btn = document.getElementById('btnTitleCards');
    out.inRow = !!document.querySelector('#scrTitle .trow3 #btnTitleCards');
    out.four = document.querySelector('#scrTitle .trow3').classList.contains('clFour');
    out.label = btn ? btn.querySelector('.blab').childNodes[0].textContent : '';
    out.n = btn ? btn.querySelector('.clN').textContent : '';
    out.svg = btn ? !!btn.querySelector('svg') : true;
    out.big = btn ? btn.classList.contains('big') : true;
    out.emoji = btn ? /[\u{1F000}-\u{1FAFF}\u{2190}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u.test(btn.textContent) : true;
    out.heroes = document.querySelectorAll('#scrTitle .tmenu .abtn.big').length;
    out.total = Deck.total();
    out.hand = JSON.stringify(Deck.col().counts);
    Screens.show('title');   // a second visit deals nothing more
    out.total2 = Deck.total();
    out.one = document.querySelectorAll('#btnTitleCards').length;
    return out;
  });
  ck('theTitleWearsACardsPlaque', a.on && a.inRow && a.four && a.label === 'Cards' && !a.svg && !a.big && !a.emoji,
    `in the secondary row ${a.inRow}, folded ${a.four}, "${a.label}", icon ${a.svg}, emoji ${a.emoji}`);
  ck('andTheHeroPlaquesAreStillThree', a.heroes === 3, a.heroes + ' hero plaques');
  ck('theStarterHandIsDealtOnceOnTheTitle', a.total === 3 && a.total2 === 3 && a.one === 1 && a.n === '3', `${a.hand}, plaque says ${a.n}`);
  /* the same measurement tests/boot.mjs noTitleLabelRunsOffItsPlaque makes,
     with the fourth plaque in the row: four across cannot fit "Settings",
     two by two leaves every label room */
  const tight = [];
  for (const w of [320, 359, 360, 375, 390, 430]) {
    await p.setViewportSize({ width: w, height: 780 });
    await p.waitForTimeout(80);
    const rows = await p.evaluate(() => [...document.querySelectorAll('#scrTitle .trow3 .abtn')].map(el => {
      const lab = el.querySelector('.blab'), cs = getComputedStyle(el);
      const inner = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const r = lab.getBoundingClientRect();
      return { t: lab.textContent.trim(), slack: +(inner - r.width).toFixed(1), h: r.height };
    }));
    for (const r of rows) if (r.slack < 2 || r.h > 26) tight.push(`${w}px ${r.t} slack=${r.slack}`);
    if (rows.length !== 4) tight.push(`${w}px ${rows.length} plaques`);
  }
  ck('noTitleLabelRunsOffItsPlaque', tight.length === 0, tight.join(' | ') || 'all four fit at 320-430px');
  await p.close();
}

/* ================= 3. THE REWARD, ON — measured without motion ================= */
{
  const p = await page({ reduce: true });
  await p.evaluate(SETUP);
  const a = await p.evaluate(async () => {
    const out = {};
    CFG.CARDS.ON = true;
    __fresh();
    Deck.ensureStarter();
    window.__run({ seed: 'ds-win', win: true, cards: [['iron', 'swift_raiders']] });
    const root = document.getElementById('cardEnd');
    out.current = Screens.current;
    out.shown = __shown(root);
    out.oldHidden = !__shown(document.getElementById('victoryScene')) && !__shown(document.getElementById('defeatScene'));
    out.win = root.classList.contains('ceWin');
    out.banner = root.querySelector('.ceRib b').textContent;
    out.laurels = root.querySelectorAll('.ceRib .ceBL').length;
    out.eyebrow = root.querySelector('.ceEye span').textContent;
    const face = root.querySelector('.ceMove .ccard'), plinth = root.querySelector('.cePlinth');
    out.card = face && face.dataset.card;
    const u = parseFloat(root.style.getPropertyValue('--u'));
    out.foot = face ? +(face.getBoundingClientRect().bottom - (plinth.getBoundingClientRect().top + DeckScreens.PLINTH.ty * u)).toFixed(2) : null;
    out.plateKick = root.querySelector('.cePlate small').textContent;
    out.plateName = root.querySelector('.cePlate b').textContent;
    out.score = root.querySelector('.ceScoreN').textContent;
    out.want = Score.compute(true).total.toLocaleString();
    out.played = root.querySelector('.cePlayed span').textContent;
    out.total = Deck.total();
    out.tile = root.querySelector('.ceTileN').textContent;
    out.deckN = root.querySelector('.ceDeckN').textContent;
    out.claim = __shown(root.querySelector('[data-act="claim"]'));
    out.board = __shown(root.querySelector('[data-act="board"]'));
    out.leave = __shown(root.querySelector('[data-act="replay"]')) || __shown(root.querySelector('[data-act="menu"]'));
    out.nameLent = !!root.querySelector('#nameRow') && !!root.querySelector('#vicRank') && !!root.querySelector('#savedNote');
    out.entry = !!Screens._entry && Screens._entry.score === Score.compute(true).total;
    out.ready = DeckScreens._ready;
    out.anim = !!root.querySelector('.ceReveal, .ceIntro') || root.classList.contains('ceIntro');
    out.unassisted = !root.querySelector('.ceAssist') && Screens._entry && Screens._entry.cards === 0;
    // THE GRANT HAPPENS ONCE: the screen reopened, and the finished save loaded again
    UI.showEnd(true, 'again');
    out.again = Deck.total();
    G.loadJSON(G.saveJSON());
    out.loaded = Deck.total();
    out.runs = Object.keys(Deck.col().runs).length;
    out.stillCard = !!document.querySelector('#cardEnd .ceMove .ccard[data-card="swift_raiders"]');
    // CLAIM
    const before = +document.querySelector('#cardEnd .ceTileN').textContent;
    DeckScreens.claim();
    await new Promise(r => setTimeout(r, 400));
    const r2 = document.getElementById('cardEnd');
    out.claimed = { before, tile: +r2.querySelector('.ceTileN').textContent, deck: +r2.querySelector('.ceDeckN').textContent, total: Deck.total() };
    out.after = { s: r2.querySelector('.ceBtns').dataset.s, claim: __shown(r2.querySelector('[data-act="claim"]')),
      replay: __shown(r2.querySelector('[data-act="replay"]')), menu: __shown(r2.querySelector('[data-act="menu"]')),
      plate: r2.querySelector('.cePlate small').textContent, empty: !r2.querySelector('.ceMove .ccard') };
    // a run told in an earlier session is shown already claimed
    DeckScreens._runs = {};
    UI.showEnd(true, 'told');
    const r3 = document.getElementById('cardEnd');
    out.told = { s: r3.querySelector('.ceBtns').dataset.s, card: !!r3.querySelector('.ceMove .ccard'), total: Deck.total(),
      tile: +r3.querySelector('.ceTileN').textContent };
    return out;
  });
  ck('theRewardScreenTakesTheEnd', a.current === 'endgame' && a.shown && a.oldHidden, `screen ${a.current}, shown ${a.shown}, old scenes hidden ${a.oldHidden}`);
  ck('aVictoryWearsTheGoldBanner', a.win && /^victory$/i.test(a.banner) && a.laurels === 2 && a.eyebrow.length > 0,
    `"${a.banner}", ${a.laurels} laurels, eyebrow "${a.eyebrow}"`);
  ck('theCardStandsOnThePlinth', a.card === 'swift_raiders' && a.foot != null && Math.abs(a.foot) <= 1, `card ${a.card}, foot ${a.foot}px off the slit`);
  ck('itsPlateNamesTierAndCard', /reward card/i.test(a.plateKick) && /iron/i.test(a.plateKick) && a.plateName === 'Swift Raiders', `"${a.plateKick}" / "${a.plateName}"`);
  ck('theFinalScoreIsTheRuns', a.score === a.want, `${a.score} vs ${a.want}`);
  ck('thePlayedLineSaysNone', a.played === 'None', a.played);
  ck('theDeckTileCountsTheDeckLessThePlinth', a.total === 4 && a.tile === '3' && a.deckN === '3', `collection ${a.total}, tile ${a.tile}, corner ${a.deckN}`);
  ck('claimAndLeaderboardAreOffered', a.claim && a.board && !a.leave, `claim ${a.claim}, board ${a.board}, replay/menu before claim ${a.leave}`);
  ck('theBoardIsLentToTheScreen', a.nameLent && a.entry, `nodes lent ${a.nameLent}, entry armed ${a.entry}`);
  ck('lessMotionPlaysNothing', a.ready && !a.anim, `ready ${a.ready}, animating ${a.anim}`);
  ck('aRunWithNoCardPlayedWearsNoMark', a.unassisted, `mark absent, board entry cards 0: ${a.unassisted}`);
  ck('theGrantHappensOnce', a.again === 4 && a.loaded === 4 && a.runs === 1 && a.stillCard, `reopened ${a.again}, reloaded ${a.loaded}, ${a.runs} run ledger`);
  ck('claimTicksTheCount', a.claimed.tile === a.claimed.before + 1 && a.claimed.deck === a.claimed.tile && a.claimed.tile === a.claimed.total,
    JSON.stringify(a.claimed));
  ck('andThenTheWayOut', a.after.s === 'done' && !a.after.claim && a.after.replay && a.after.menu && /added to your deck/i.test(a.after.plate) && a.after.empty,
    JSON.stringify(a.after));
  ck('aRunToldBeforeIsShownClaimed', a.told.s === 'done' && !a.told.card && a.told.total === 4 && a.told.tile === 4, JSON.stringify(a.told));

  // the board and back, the collection and back — the screen as it was left
  const nav = await p.evaluate(async () => {
    const out = {};
    document.querySelector('#cardEnd [data-act="board"]').click();
    out.board = Screens.current;
    document.getElementById('ldrBack').click();
    out.back = Screens.current;
    out.kept = document.querySelector('#cardEnd .ceBtns').dataset.s === 'done' && Deck.total() === 4;
    document.querySelector('#cardEnd [data-act="deck"]').click();
    out.cards = Screens.current;
    out.tab = (document.querySelector('#scrCards .clTab.sel') || {}).dataset;
    out.tab = out.tab && out.tab.tier;
    out.atEnd = Screens.atEnd();
    document.querySelector('#scrCards [data-act="back"]').click();
    out.back2 = Screens.current;
    // MENU leaves through Screens' own door
    document.querySelector('#cardEnd [data-act="menu"]').click();
    out.menu = Screens.current;
    return out;
  });
  ck('leaderboardGoesAndComesBack', nav.board === 'leaders' && nav.back === 'endgame' && nav.kept, JSON.stringify(nav));
  ck('theDeckOpensTheCollectionAtTheNewCard', nav.cards === 'cards' && nav.tab === 'iron' && nav.atEnd && nav.back2 === 'endgame', `${nav.cards} at ${nav.tab}, back to ${nav.back2}`);
  ck('menuLeaves', nav.menu === 'title', nav.menu);

  // a loss: the cold banner, no laurels anywhere, and still a card and a score
  const l = await p.evaluate(async () => {
    const out = {};
    window.__run({ seed: 'ds-loss', win: false, cards: [['bronze', 'harvest_festival']],
      played: [{ id: 'forager_cache', day: 3 }, { id: 'forager_cache', day: 9 }, { id: 'starfall', day: 40 }] });
    const root = document.getElementById('cardEnd');
    out.loss = root.classList.contains('ceLoss');
    out.banner = root.querySelector('.ceRib b').textContent;
    out.laurels = root.querySelectorAll('.ceBL').length + (root.querySelector('.ceStage').classList.contains('ceLaurels') ? 1 : 0);
    out.card = (root.querySelector('.ceMove .ccard') || {}).dataset;
    out.card = out.card && out.card.card;
    out.score = root.querySelector('.ceScoreN').textContent;
    out.want = Score.compute(false).total.toLocaleString();
    out.claim = __shown(root.querySelector('[data-act="claim"]'));
    out.board = __shown(root.querySelector('[data-act="board"]'));
    out.entry = Screens._entry;
    out.played = root.querySelector('.cePlayed span').textContent;
    const mk = root.querySelector('.ceAssist');
    out.assist = __shown(mk) && /card-assisted/i.test(mk.textContent) && !!mk.closest('.ceScore') && !!mk.querySelector('svg');
    return out;
  });
  ck('aDefeatWearsTheColdBanner', l.loss && /^defeat$/i.test(l.banner) && l.laurels === 0, `"${l.banner}", laurels ${l.laurels}`);
  ck('andStillRevealsItsCard', l.card === 'harvest_festival' && l.claim && l.board, `card ${l.card}, claim ${l.claim}, board ${l.board}`);
  ck('aDefeatShowsItsScoreAndPostsNothing', l.score === l.want && l.entry === null, `${l.score} vs ${l.want}, entry ${JSON.stringify(l.entry)}`);
  ck('thePlayedLineNamesTheRunsCards', l.played === "Forager's Cache ×2, Starfall", l.played);
  ck('aCardAssistedRunSaysSoInTheScoresBox', l.assist, `mark shown in the score box with its icon: ${l.assist}`);

  /* THE EARN RULE on the screen: a WIN earns however short — the old gate
     told a two-minute victory "Play 10 minutes" — and a card played on the
     way rides to the board as its count */
  const q = await p.evaluate(async () => {
    const out = {};
    const t0 = Deck.total();
    window.__run({ seed: 'ds-short', win: true, secs: 120, played: [{ id: 'forager_cache', day: 2 }] });
    const root = document.getElementById('cardEnd');
    out.card = !!root.querySelector('.ceMove .ccard');
    out.why = __shown(root.querySelector('.ceWhy'));
    out.gained = Deck.total() - t0;
    out.cards = Screens._entry && Screens._entry.cards;
    out.assist = __shown(root.querySelector('.ceAssist'));
    return out;
  });
  ck('aShortWinStillEarns', q.card && !q.why && q.gained >= 1, `card ${q.card}, why shown ${q.why}, gained ${q.gained}`);
  ck('andACardAssistedWinCarriesItsCountToTheBoard', q.cards === 1 && q.assist, `entry cards ${q.cards}, mark ${q.assist}`);

  // a defeat short of its deeds: the reason, with the count, stands where the
  // card would — and nothing is earned
  const n = await p.evaluate(async () => {
    const out = {};
    const t0 = Deck.total();
    window.__run({ seed: 'ds-token', win: false, built: 1 });
    let root = document.getElementById('cardEnd');
    out.why = __shown(root.querySelector('.ceWhy')) ? root.querySelector('.ceWhy span').textContent : '';
    out.head = root.querySelector('.ceWhy b').textContent;
    out.card = !!root.querySelector('.ceMove .ccard');
    out.claim = __shown(root.querySelector('[data-act="claim"]'));
    out.leave = __shown(root.querySelector('[data-act="replay"]')) && __shown(root.querySelector('[data-act="menu"]'));
    out.board = __shown(root.querySelector('[data-act="board"]'));
    out.banner = root.querySelector('.ceRib b').textContent;
    out.score = root.querySelector('.ceScoreN').textContent === Score.compute(false).total.toLocaleString();
    window.__run({ seed: 'ds-struck', win: false, cause: 'struck_banner' });
    root = document.getElementById('cardEnd');
    out.struck = root.querySelector('.ceWhy span').textContent;
    out.struckCard = !!root.querySelector('.ceMove .ccard');
    out.gained = Deck.total() - t0;
    return out;
  });
  ck('anIneligibleRunSaysWhy', n.why === 'Build, train, upgrade or raze to earn a card from a defeat — 1 of 5 deeds.' && !n.card &&
    n.struck === 'A banner struck earns no card.' && !n.struckCard, `"${n.head}: ${n.why}" / "${n.struck}"`);
  ck('andEarnsNothingButKeepsTheRest', n.gained === 0 && !n.claim && n.leave && n.board && /defeat/i.test(n.banner) && n.score,
    `gained ${n.gained}, claim ${n.claim}, replay/menu ${n.leave}, board ${n.board}`);

  // and the switch thrown back hands every lent node home to the old scene
  const g = await p.evaluate(async () => {
    CFG.CARDS.ON = false;
    window.__run({ seed: 'ds-back-off', win: true });
    await new Promise(r => setTimeout(r, 120));
    return {
      home: !!document.querySelector('#victoryScene #nameRow') && !!document.querySelector('#victoryScene #vicRank') && !!document.querySelector('#victoryScene #savedNote'),
      order: [...document.getElementById('victoryScene').children].map(e => e.id).filter(Boolean).join(','),
      mode: document.getElementById('scrEndgame').className,
      scene: getComputedStyle(document.getElementById('victoryScene')).display !== 'none',
    };
  });
  ck('switchedOffTheBoardGoesHome', g.home && g.scene && !/ceMode/.test(g.mode) &&
    /vicRank,vicMeta,nameRow,savedNote,btnVicScore/.test(g.order), `${g.order} | ${g.mode}`);
  await p.close();
}

/* ================= 4. THE CEREMONY, with motion ================= */
{
  const p = await page();
  await p.evaluate(SETUP);
  const a = await p.evaluate(async () => {
    const out = {};
    CFG.CARDS.ON = true;
    __fresh();
    window.__run({ seed: 'ds-great', mode: 'hard', win: true, cards: [['iron', 'swift_raiders'], ['imperial', 'starfall']] });
    const root = document.getElementById('cardEnd'), st = root.querySelector('.ceStage');
    out.great = DeckScreens._view.cards.length;
    out.rising = st.classList.contains('ceReveal') && root.querySelector('.ceMove').getAnimations().length > 0;
    out.secondEarly = !!root.querySelector('[data-card="starfall"]');
    out.readyEarly = DeckScreens._ready;
    const until = (f, ms) => new Promise(r => { const t0 = performance.now(); const k = () => (f() || performance.now() - t0 > ms) ? r(f()) : setTimeout(k, 30); k(); });
    out.settled = await until(() => DeckScreens._ready, 15000);
    // a tap turns it over, a tap turns it back
    const mv = root.querySelector('.ceMove');
    mv.click(); out.flip1 = root.querySelector('.ceMove .ccard').classList.contains('flip');
    mv.click(); out.flip2 = root.querySelector('.ceMove .ccard').classList.contains('flip');
    out.total = Deck.total();
    out.tile0 = +root.querySelector('.ceTileN').textContent;
    root.querySelector('[data-act="claim"]').click();
    out.flying = !!root.querySelector('.ceFly .ccard');
    out.bonus = await until(() => !!root.querySelector('.ceMove .ccard[data-card="starfall"]'), 15000);
    out.tile1 = +root.querySelector('.ceTileN').textContent;
    out.kick = root.querySelector('.cePlate small').textContent;
    out.rising2 = st.classList.contains('ceReveal');
    out.waits = root.querySelector('.ceBtns').dataset.s;
    await until(() => DeckScreens._ready, 15000);
    root.querySelector('[data-act="claim"]').click();
    out.done = await until(() => root.querySelector('.ceBtns').dataset.s === 'done', 15000);
    out.tile2 = +root.querySelector('.ceTileN').textContent;
    return out;
  });
  ck('aGreatVictoryEarnsTwo', a.great === 2, a.great + ' cards');
  ck('theCardRisesFromThePlinth', a.rising && !a.readyEarly && a.settled, `animating ${a.rising}, settled ${a.settled}`);
  ck('aFlipTurnsItOverAndBack', a.flip1 && !a.flip2, `first tap ${a.flip1}, second ${a.flip2}`);
  ck('claimFliesItToTheDeck', a.flying && a.tile1 === a.tile0 + 1, `in flight ${a.flying}, ${a.tile0} -> ${a.tile1}`);
  ck('theBonusRisesOnlyAfterTheFirstIsClaimed', !a.secondEarly && a.bonus && /bonus card/i.test(a.kick) && a.rising2 && a.waits === 'claim',
    `early ${a.secondEarly}, then ${a.bonus}, "${a.kick}", buttons ${a.waits}`);
  ck('andTheLastClaimFillsTheDeck', a.done && a.tile2 === a.total, `${a.tile2} of ${a.total}`);

  const m = await p.evaluate(() => {
    const T = k => { const t = DeckScreens._timeline(k, true); return t.info + 4 * 70 + 380; };
    const css = DeckScreens.CSS, bad = [];
    for (const kf of css.matchAll(/@keyframes\s+([\w-]+)\s*\{([\s\S]*?\})\s*\}/g)) {
      for (const pr of kf[2].matchAll(/([a-z-]+)\s*:/g)) if (!['transform', 'opacity'].includes(pr[1])) bad.push(kf[1] + ':' + pr[1]);
    }
    return { stone: T('stone'), enlight: T('enlight'), hold: DeckScreens.REVEAL.enlight.hold, bad, n: [...css.matchAll(/@keyframes/g)].length };
  });
  ck('theRevealMovesOnlyTransformAndOpacity', m.bad.length === 0 && m.n >= 10, m.bad.join(', ') || m.n + ' keyframes, transform and opacity only');
  ck('aStoneRevealTakesASecondAndAHalf', m.stone >= 1200 && m.stone <= 1600, m.stone + 'ms');
  ck('anEnlightenmentRevealHoldsItsBreath', m.enlight >= 2300 && m.enlight <= 2700 && m.hold >= 500, `${m.enlight}ms, held ${m.hold}ms`);
  await p.close();
}

/* ================= 4b. IMPATIENT HANDS ================= */
/* A great victory's bonus is the rarest moment on the screen, and a double tap
   on CLAIM across the first card's landing used to claim it unseen; a tap
   where CLAIM is about to appear, mid-reveal, claimed a card before it rose.
   And a player who asks for less motion still hears the ending. */
{
  const p = await page();
  await p.evaluate(SETUP);
  const a = await p.evaluate(async () => {
    const out = {};
    CFG.CARDS.ON = true;
    __fresh();
    const cues = [];
    const cue0 = UI.cue; UI.cue = function (k) { cues.push(k); return cue0.apply(this, arguments); };
    const until = (f, ms) => new Promise(r => { const t0 = performance.now(); const k = () => (f() || performance.now() - t0 > ms) ? r(f()) : setTimeout(k, 30); k(); });
    window.__run({ seed: 'ds-hands', mode: 'hard', win: true, cards: [['iron', 'swift_raiders'], ['imperial', 'starfall']] });
    const root = document.getElementById('cardEnd');
    // mid-reveal, a tap on the (still invisible) CLAIM only hurries it along
    const n0 = DeckScreens._view.claimed;
    root.querySelector('[data-act="claim"]').click();
    out.introClaimed = DeckScreens._view.claimed - n0;
    out.stung = cues.includes('win');
    await until(() => DeckScreens._ready, 15000);
    // CLAIM, then CLAIM again the moment the first lands, before the bonus is staged
    root.querySelector('[data-act="claim"]').click();
    await until(() => !DeckScreens._flying, 5000);
    root.querySelector('[data-act="claim"]').click();
    out.afterDouble = { claimed: DeckScreens._view.claimed, onPlinth: (root.querySelector('.ceMove .ccard') || {}).dataset ? root.querySelector('.ceMove .ccard').dataset.card : null };
    // …and the same gap left by LEADERBOARD and back: the bonus waits on the plinth
    UI.cue = cue0;
    return out;
  });
  ck('aTapMidRevealNeverClaims', a.introClaimed === 0 && a.stung, `claimed ${a.introClaimed} during the reveal; the sting played ${a.stung}`);
  ck('aDoubleTapNeverClaimsTheBonusUnseen', a.afterDouble.claimed === 1 && a.afterDouble.onPlinth === 'starfall',
    `after two quick taps: ${a.afterDouble.claimed} claimed, on the plinth ${a.afterDouble.onPlinth}`);
  await p.close();
  const q = await page({ reduce: true });
  await q.evaluate(SETUP);
  const r = await q.evaluate(() => {
    CFG.CARDS.ON = true;
    __fresh();
    const cues = [];
    const cue0 = UI.cue; UI.cue = function (k) { cues.push(k); return cue0.apply(this, arguments); };
    window.__run({ seed: 'ds-quiet', win: false, cards: [['stone', 'gold_nugget']] });
    UI.cue = cue0;
    /* a retired card left in a finished run's grant ledger never reaches a
       renderer: the run is granted, its ledger is made to name a card the
       catalog no longer carries, and the ending is shown again as a reload
       of that finished save would show it */
    window.__run({ seed: 'ds-retired', win: true, cards: [['stone', 'gold_nugget']] });
    const key = DeckScreens._view.key, c = Deck.col();
    const led = c.runs[key];
    if (Array.isArray(led)) led.push(typeof led[0] === 'string' ? 'a_card_no_longer_made' : Object.assign({}, led[0], { id: 'a_card_no_longer_made' }));
    Deck.saveCol();
    DeckScreens._runs = {}; DeckScreens._view = null;
    let threw = null;
    try { Screens.show('endgame', { win: true, msg: 'again' }); } catch (e) { threw = String(e); }
    const drawn = !!document.querySelector('#cardEnd .cePlate b');
    return { cues, threw, shown: Screens.current, drawn, ledger: JSON.stringify(c.runs[key]).slice(0, 120) };
  });
  ck('lessMotionStillSoundsTheEnding', r.cues.includes('lose'), r.cues.join(',') || 'no cue');
  ck('aRetiredCardNeverBreaksTheEnding', !r.threw && r.shown === 'endgame' && r.drawn, (r.threw || 'the ending drew') + '; ledger ' + r.ledger);
  await q.close();
}

/* ================= 5. THE COLLECTION ================= */
{
  const p = await page({ q: '?cards=1' });
  const a = await p.evaluate(async () => {
    const out = {};
    Deck._col = null; Deck._del(Deck.KEY);
    Deck.ensureStarter();
    Deck._add('swift_raiders', 2);
    Deck._add('loose_stone', 1); Deck._add('loose_stone', -1);   // found, and since played
    Deck.saveCol();
    DeckScreens.openCollection('title', 'stone');
    const scr = document.getElementById('scrCards');
    out.current = Screens.current;
    const tabs = [...scr.querySelectorAll('.clTab')];
    out.tabs = tabs.map(t => t.dataset.tier + ':' + t.querySelector('.clTabN').textContent).join(',');
    out.want = Deck.TIERS.map(t => t.k + ':' + Deck.ofTier(t.k).reduce((n, c) => n + Deck.count(c.id), 0)).join(',');
    const stone = Deck.ofTier('stone'), seen = stone.filter(c => Deck.seen(c.id));
    out.pct = scr.querySelector('.clPct strong').textContent;
    out.wantPct = Math.round(100 * seen.length / stone.length) + '%';
    const unk = [...scr.querySelectorAll('.clCell[data-unknown]')];
    out.unknown = unk.length; out.wantUnknown = stone.length - seen.length;
    out.q = unk.every(c => c.querySelector('.cc-nm').textContent === '?' && !c.querySelector('.cc-b') && !c.querySelector('[data-card]')
      && !/url\(/.test(c.querySelector('.cc-art').getAttribute('style') || '') && getComputedStyle(c.querySelector('.cc-art')).backgroundImage.indexOf('assets/cards/art') < 0);
    // nothing about an undiscovered card is anywhere in the page: not its name, its text, its flavor or its id
    const html = scr.innerHTML;
    out.leak = stone.filter(c => !Deck.seen(c.id)).filter(c => html.includes(c.name) || html.includes(c.flavor) || html.includes('"' + c.id + '"')).map(c => c.id);
    const played = scr.querySelector('.clCell[data-card="loose_stone"] .ccard');
    out.played = !!played && played.classList.contains('off');
    // the held count rides on the card
    scr.querySelector('.clTab[data-tier="iron"]').click();
    out.badge = (scr.querySelector('.clCell[data-card="swift_raiders"] .cc-n') || {}).textContent;
    // tap to enlarge, tap to turn it over, tap to turn it back
    const cell = scr.querySelector('.clCell[data-card="swift_raiders"]');
    cell.click();
    const zoom = scr.querySelector('.clZoom'), zc = () => zoom.querySelector('.ccard');
    // layout widths: the enlarged card is mid-flight out of the cell, scaled by its transform
    out.zoomed = !zoom.hidden && !!zc() && zc().offsetWidth > cell.offsetWidth * 1.5;
    zoom.querySelector('.clZCard').click(); out.f1 = zc().classList.contains('flip');
    zoom.querySelector('.clZCard').click(); out.f2 = zc().classList.contains('flip');
    zoom.querySelector('[data-act="unzoom"]').click();
    await new Promise(r => setTimeout(r, 350));
    out.unzoomed = zoom.hidden;
    // an undiscovered card comes up close as a silhouette, and has no back to show
    scr.querySelector('.clCell[data-unknown]').click();
    zoom.querySelector('.clZCard').click();
    out.unkFlip = zc().classList.contains('flip');
    out.unkLeak = Deck.ofTier('iron').filter(c => !Deck.seen(c.id)).some(c => zoom.innerHTML.includes(c.name));
    // 44px targets (measured with the close button up)
    const sz = el => { const r = el.getBoundingClientRect(); return Math.min(r.width, r.height); };
    out.small = [...scr.querySelectorAll('.clTab'), scr.querySelector('[data-act="back"]'), scr.querySelector('.clX')]
      .filter(el => !el.getClientRects().length || sz(el) < 44).map(el => el.className);
    DeckScreens._zoomClose(true);
    scr.querySelector('[data-act="back"]').click();
    out.back = Screens.current;
    return out;
  });
  ck('theCollectionOpens', a.current === 'cards', a.current);
  ck('itsTabsCountWhatIsHeld', a.tabs === a.want, a.tabs);
  ck('eachTierShowsItsCompletion', a.pct === a.wantPct, `${a.pct} vs ${a.wantPct}`);
  ck('undiscoveredCardsAreSilhouettes', a.unknown === a.wantUnknown && a.q, `${a.unknown} silhouettes, "?" and no art ${a.q}`);
  ck('andGiveNothingAway', a.leak.length === 0, a.leak.join(',') || 'no name, text, flavor or id in the page');
  ck('aPlayedCardIsGreyedNotHidden', a.played);
  ck('aDuplicateWearsItsCount', a.badge === '×2', String(a.badge));
  ck('aTapEnlargesTheCard', a.zoomed && a.unzoomed, `enlarged ${a.zoomed}, closed ${a.unzoomed}`);
  ck('andATapTurnsItOverAndBack', a.f1 && !a.f2, `${a.f1} / ${a.f2}`);
  ck('anUndiscoveredCardHasNoBack', !a.unkFlip && !a.unkLeak, `flipped ${a.unkFlip}, leaked ${a.unkLeak}`);
  ck('everyCollectionTargetIs44px', a.small.length === 0, a.small.join(',') || 'tabs, back and close');
  ck('backReturnsToTheTitle', a.back === 'title', a.back);

  // the grid fits a phone at every width, on whole-pixel cards
  const over = [];
  for (const w of [320, 360, 390, 430]) {
    await p.setViewportSize({ width: w, height: 844 });
    const r = await p.evaluate(() => {
      DeckScreens.openCollection('title', 'stone');
      const body = document.querySelector('#scrCards .clBody'), grid = body.querySelector('.clGrid');
      const cw = grid.querySelector('.ccard').getBoundingClientRect().width * devicePixelRatio / Deck.W;
      return { over: body.scrollWidth - body.clientWidth, cols: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
        whole: Math.abs(cw - Math.round(cw)) < 0.02, w: +grid.querySelector('.ccard').getBoundingClientRect().width.toFixed(1) };
    });
    if (r.over > 0 || !r.whole || r.cols < 2 || r.w < 110) over.push(`${w}px: overflow ${r.over}, ${r.cols} cols of ${r.w}px, whole ${r.whole}`);
  }
  ck('theGridFitsEveryPhone', over.length === 0, over.join(' | ') || 'no overflow, 2+ readable whole-pixel columns, 320-430px');
  await p.close();
}

/* ================= 6. THE FIT ================= */
{
  const fit = [], tight = [];
  // the narrowest phone may scroll (it must, for a card this size) but nothing on it may run off its line
  for (const [w, h, dpr, scrolls] of [[390, 844, 3, false], [1280, 800, 1, false], [320, 568, 3, true]]) {
    const p = await page({ w, h, dpr, reduce: true });
    await p.evaluate(SETUP);
    const r = await p.evaluate(() => {
      CFG.CARDS.ON = true;
      __fresh();
      // two played cards with long names: the line wraps, and the screen must still fit
      const played = [{ id: 'harvest_festival', day: 9 }, { id: 'wonders_foundation', day: 30 }];
      window.__run({ seed: 'ds-fit', win: true, cards: [['enlight', 'wonders_foundation']], played });
      // the live site's first-time winner: the board's rank, name box and note are lent in
      Screens._promptName('Name your chief for the world board.');
      const rank = document.getElementById('vicRank'); if (rank) { rank.style.display = 'block'; rank.textContent = '#12 of 340 this week'; }
      const root = document.getElementById('cardEnd'), sc = root.querySelector('.ceScroll');
      const sz = el => { const r = el.getBoundingClientRect(); return Math.min(r.width, r.height); };
      const small = [...root.querySelectorAll('button')].filter(el => el.getClientRects().length && sz(el) < 44).map(el => el.dataset.act);
      const deck = root.querySelector('.ceDeck').getBoundingClientRect(), rib = root.querySelector('.ceRib').getBoundingClientRect();
      const clash = !(deck.right <= rib.left || deck.left >= rib.right || deck.bottom <= rib.top || deck.top >= rib.bottom);
      // every eyebrow the screen can wear, and the plate's kicker and name, inside their own boxes
      const eye = root.querySelector('.ceEye'), span = eye.querySelector('span'), runs = [];
      for (const t of Object.values(DeckScreens.EYEBROW)) {
        span.textContent = t;
        const er = eye.getBoundingClientRect(), d = deck;
        if (eye.scrollWidth > eye.clientWidth + 1 || (er.right > d.left && er.top < d.bottom)) runs.push(t);
      }
      const plate = root.querySelector('.cePlate');
      for (const el of plate.querySelectorAll('small > *, b')) if (el.getBoundingClientRect().right > plate.getBoundingClientRect().right + 0.5) runs.push(el.textContent);
      return { over: sc.scrollHeight - sc.clientHeight, wide: sc.scrollWidth - sc.clientWidth, small, clash, runs };
    });
    if ((!scrolls && r.over > 1) || r.wide > 0 || r.small.length || r.clash) fit.push(`${w}x${h}: ${JSON.stringify(r)}`);
    if (r.runs.length) tight.push(`${w}px: ${r.runs.join(' / ')}`);
    await p.close();
  }
  ck('theRewardFitsAPhoneAndAWideWindow', fit.length === 0, fit.join(' | ') || '390x844 and 1280x800 without scrolling; 44px buttons and the deck clear of the banner at 320-1280px');
  ck('noRewardLineRunsOffItsBox', tight.length === 0, tight.join(' | ') || 'every eyebrow, the kicker and the longest names, 320-1280px');
}

for (const [k, v] of Object.entries(res)) console.log((v.startsWith('PASS') ? ' ' : '✗') + ' ' + k + ': ' + v);
if (errs.length) console.log('PAGE ERRORS:', errs.slice(0, 4));
await b.close();
if (fails.length || errs.length) { console.log('FAILURES:', fails.join(', ') || 'pageerrors'); process.exit(1); }
console.log('ALL DECK-SCREENS CHECKS PASS');
