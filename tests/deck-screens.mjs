/* THE CARD SYSTEM — the end screen and the collection (js/deckscreens.js).

   This file pins:

     THE SWITCH        off (the shipped default), the end of a run is exactly
                       today's victory and defeat scenes and the title is
                       exactly today's title: no plaque, no element, no
                       stylesheet, no listener, no write
     THE TITLE         on, a "Cards" plaque joins the secondary row (on the
                       night title the deck switch stages, a vector icon
                       beside the word, like its neighbours; never a pixel
                       icon or an emoji), the row folds two by two so no
                       label runs off its plaque at any phone width, the hero
                       plaques stay three, and the starter hand is dealt once
     THE REWARD        on, a win shows the gold banner with laurels, a loss
                       the cold one without; the card stands on the plinth's
                       slit with its tier and name on the plate below, the
                       run's final score, the cards it played, the deck's
                       size, CLAIM and LEADERBOARD; the old scenes stand down
     THE GRANT         happens once, when the screen opens, however often it
                       reopens; a win earns however short (a two-minute one
                       included); a defeat short of its deeds says how far it
                       got where the card would stand — in words and in a
                       row of pips, the deeds done lit — and earns nothing; a
                       card-assisted run wears its mark on the score box's
                       day line (no extra height) and carries its count to
                       the board
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
                       both ways, 44px targets, a grid that fits the phone,
                       and tier tabs whose gem, name and count sit inside
                       their own padding, centred and level, 320-1440px
     THE PAINTED VALLEY the backdrop (dawn for a win, dusk for a loss; wide
                       on a landscape window, tall on a phone) and the carved
                       pedestal land by filename from assets/endgame/reward/,
                       drawn at a whole scale; a 404 leaves the procedural
                       land and drum, the card still on its slit
     THE GAP           the card's frame stands clear of the banner at
                       390x844, 430x932, 768x1024, 1440x900 and 1920x1080,
                       and nothing overlaps either
     THE FIT           the reward screen fits a 390x844 phone and a
                       1280x800 window without scrolling
     THE CHROME        is drawn at the device's own resolution (the
                       operator's ruling on UI chrome): measured in the live
                       page — the reward screen won, lost and empty, the
                       collection with a card held up, the deck sheet and its
                       HUD button — at six sizes, a phone on its side
                       included, every raster that is not a card face, the
                       painted valley or the pedestal is shown at or below
                       its own pixels on a 3x screen (CSS size × 3 ≤ natural
                       size); nothing asks for nearest-neighbour or stepped
                       edges; the banner, its sprigs, the laurels, the
                       corner brackets and the eyebrow's knots are
                       vectors; the pedestal, world art standing in the
                       scene, is never past twice its pixels

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
  S.stats.actDays = o.days == null ? 30 : o.days;
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
    // the word itself — the night title (js/titlescreen.js, staged with the
    // deck) sets a vector icon before it, as it does on every plaque
    out.label = btn ? [...btn.querySelector('.blab').childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim() : '';
    out.n = btn ? btn.querySelector('.clN').textContent : '';
    // no PIXEL icon: the only picture a minor plaque may carry is the night's vector (.t2i, smooth)
    out.svg = btn ? [...btn.querySelectorAll('.blab svg')].some(g => !g.classList.contains('t2i') || g.getAttribute('shape-rendering') === 'crispEdges') : true;
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
    out.unassisted = !root.querySelector('.ceAssist') && Screens._entry && Screens._entry.cards_played === 0;
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
    // the mark rides the day's line — a line of its own pushed the phone's reward past its fold
    const day = root.querySelector('.ceDay');
    out.sameLine = !!mk && !!day && Math.abs(mk.getBoundingClientRect().top - day.getBoundingClientRect().top) < 3;
    return out;
  });
  ck('aDefeatWearsTheColdBanner', l.loss && /^defeat$/i.test(l.banner) && l.laurels === 0, `"${l.banner}", laurels ${l.laurels}`);
  ck('andStillRevealsItsCard', l.card === 'harvest_festival' && l.claim && l.board, `card ${l.card}, claim ${l.claim}, board ${l.board}`);
  ck('aDefeatShowsItsScoreAndPostsNothing', l.score === l.want && l.entry === null, `${l.score} vs ${l.want}, entry ${JSON.stringify(l.entry)}`);
  ck('thePlayedLineNamesTheRunsCards', l.played === "Forager's Cache ×2, Starfall", l.played);
  ck('aCardAssistedRunSaysSoInTheScoresBox', l.assist && l.sameLine, `mark shown in the score box with its icon: ${l.assist}; on the day's line ${l.sameLine}`);

  /* THE EARN RULE on the screen: a WIN earns however short — the old gate
     told a two-minute victory "Play 10 minutes" — and A CARD-ASSISTED WIN
     NEVER STANDS UNMARKED ON THE BOARD: until submit_score can carry the
     mark (Backend.BOARD_MARKS_CARDS) it is kept off it, and says so in the
     score box's note line; once it can, the entry carries its count. A TEST
     deck's assisted win never goes up at all. */
  const q = await p.evaluate(async () => {
    const out = {};
    const t0 = Deck.total();
    const note = () => { const e = document.getElementById('savedNote'); return __shown(e) && !!e.closest('#cardEnd') ? e.textContent : ''; };
    const was = Backend.BOARD_MARKS_CARDS;
    Backend.BOARD_MARKS_CARDS = false;
    window.__run({ seed: 'ds-short', win: true, secs: 120, played: [{ id: 'forager_cache', day: 2 }] });
    const root = document.getElementById('cardEnd');
    out.card = !!root.querySelector('.ceMove .ccard');
    out.why = __shown(root.querySelector('.ceWhy'));
    out.gained = Deck.total() - t0;
    out.held = Screens._entry === null;
    out.heldNote = note();
    out.nameBox = __shown(document.getElementById('nameRow'));
    out.assist = __shown(root.querySelector('.ceAssist'));
    Backend.BOARD_MARKS_CARDS = true;
    window.__run({ seed: 'ds-short-b', win: true, secs: 120, played: [{ id: 'forager_cache', day: 2 }] });
    out.cards = Screens._entry && Screens._entry.cards_played;
    out.markedNote = note();
    // a TEST deck (?cards=all) played: never posted, mark or no mark
    Deck.col().test = Date.now();
    window.__run({ seed: 'ds-short-t', win: true, secs: 120, played: [{ id: 'forager_cache', day: 2 }] });
    out.testHeld = Screens._entry === null;
    out.testNote = note();
    // …but a test deck's win with NO card played is an ordinary win
    window.__run({ seed: 'ds-short-u', win: true, secs: 120 });
    out.testUnassisted = !!Screens._entry && Screens._entry.cards_played === 0;
    delete Deck.col().test;
    Backend.BOARD_MARKS_CARDS = was;
    return out;
  });
  ck('aShortWinStillEarns', q.card && !q.why && q.gained >= 1, `card ${q.card}, why shown ${q.why}, gained ${q.gained}`);
  ck('aCardAssistedWinNeverStandsUnmarkedOnTheBoard', q.held && !q.nameBox && q.assist &&
    q.heldNote === 'Not posted to the world board — it cannot wear the card mark yet.',
    `entry held ${q.held}, name box ${q.nameBox}, mark ${q.assist}, note "${q.heldNote}"`);
  ck('andOnceTheBoardCanMarkItTheEntryCarriesItsCount', q.cards === 1 && q.markedNote === '', `entry cards ${q.cards}, note "${q.markedNote}"`);
  ck('aTestDecksAssistedWinIsNeverPosted', q.testHeld && q.testNote === 'Test-deck run — not posted to the world board.' && q.testUnassisted,
    `held ${q.testHeld}, note "${q.testNote}"; an unassisted test-deck win posts as ever: ${q.testUnassisted}`);

  // a defeat short of its deeds: the reason, with the count, stands where the
  // card would — and nothing is earned
  const n = await p.evaluate(async () => {
    const out = {};
    const t0 = Deck.total();
    window.__run({ seed: 'ds-token', win: false, built: 1 });
    let root = document.getElementById('cardEnd');
    out.why = __shown(root.querySelector('.ceWhy')) ? root.querySelector('.ceWhy span').textContent : '';
    out.head = root.querySelector('.ceWhy b').textContent;
    // …and the count as a row of pips, the deeds done lit
    out.pips = root.querySelectorAll('.ceWhy .cePips i').length;
    out.lit = root.querySelectorAll('.ceWhy .cePips i.on').length;
    out.card = !!root.querySelector('.ceMove .ccard');
    out.claim = __shown(root.querySelector('[data-act="claim"]'));
    out.leave = __shown(root.querySelector('[data-act="replay"]')) && __shown(root.querySelector('[data-act="menu"]'));
    out.board = __shown(root.querySelector('[data-act="board"]'));
    out.banner = root.querySelector('.ceRib b').textContent;
    out.score = root.querySelector('.ceScoreN').textContent === Score.compute(false).total.toLocaleString();
    window.__run({ seed: 'ds-struck', win: false, cause: 'struck_banner' });
    root = document.getElementById('cardEnd');
    out.struck = root.querySelector('.ceWhy span').textContent;
    out.struckPips = root.querySelectorAll('.ceWhy .cePips i').length;
    out.struckCard = !!root.querySelector('.ceMove .ccard');
    // a BURST: deeds to spare, given on one day — the pips count the days
    window.__run({ seed: 'ds-burst', win: false, built: 9, days: 1 });
    root = document.getElementById('cardEnd');
    out.burst = root.querySelector('.ceWhy span').textContent;
    out.burstPips = root.querySelectorAll('.ceWhy .cePips i').length;
    out.burstLit = root.querySelectorAll('.ceWhy .cePips i.on').length;
    out.burstCard = !!root.querySelector('.ceMove .ccard');
    out.gained = Deck.total() - t0;
    return out;
  });
  ck('anIneligibleRunSaysWhy', n.why === 'Build, train, gather, upgrade or raze to earn a card from a defeat — 1 of 5 deeds.' && !n.card &&
    n.struck === 'A banner struck earns no card.' && !n.struckCard, `"${n.head}: ${n.why}" / "${n.struck}"`);
  ck('andShowsHowFarItGot', n.pips === 5 && n.lit === 1 && n.struckPips === 0, `${n.lit} of ${n.pips} pips lit; a struck banner shows ${n.struckPips}`);
  ck('aBurstIsToldTheFightMustLast', !n.burstCard && n.burstPips === 6 && n.burstLit === 1 &&
    n.burst === 'Keep up the fight across the days to earn a card from a defeat — orders given on 1 of 6 days.',
    `"${n.burst}", ${n.burstLit} of ${n.burstPips} pips`);

  /* NO WAY BACK: the game's own offer to a village already lost. Accepting
     it through its Resign is the defeat it is ('doomed', logged a loss) and
     earns on the deeds like any defeat — it used to end as a struck banner,
     the honest button the one that lost the card */
  const dm = await p.evaluate(async () => {
    const out = {};
    const t0 = Deck.total();
    let sent = null;
    const keep = Backend.logRunEnd;
    Backend.logRunEnd = (r) => { sent = r; };
    try {
      Screens._demo = false;
      G.newGame('ds-doomed', 'hard', 'medium');
      Screens.show('playing'); S.paused = true;
      S.stats.built = 6; S.stats.actDays = 9; S.day = 30;
      Screens.show('doomed');
      document.getElementById('btnDoomResign').click();
      await new Promise(r => setTimeout(r, 60));
    } finally { Backend.logRunEnd = keep; }
    const root = document.getElementById('cardEnd');
    out.cause = S.over && S.over.cause;
    out.card = !!(root && root.querySelector('.ceMove .ccard'));
    out.gained = Deck.total() - t0;
    out.outcome = sent && sent.outcome;
    out.logged = sent && sent.cause;
    return out;
  });
  ck('aDoomedResignIsADefeatAndEarnsOnItsDeeds', dm.cause === 'doomed' && dm.card && dm.gained >= 1 && dm.outcome === 'loss' && dm.logged === 'doomed',
    `cause ${dm.cause}, card ${dm.card}, gained ${dm.gained}, logged ${dm.outcome}/${dm.logged}`);
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

  /* the tier tabs hold what they say: gem, name (or I-V on a phone) and
     count inside each tab's own padding, centred, on one line, and the row
     inside the screen — five equal columns used to squeeze "Enlightenment 6"
     onto its tab's border on a desktop. The gem is the deck sheet's faceted
     one, a vector (DeckUI.gemIcon). */
  const tabBad = [];
  let gems = 0;
  for (const w of [320, 360, 390, 430, 600, 700, 768, 1024, 1440]) {
    await p.setViewportSize({ width: w, height: 900 });
    const r = await p.evaluate(() => {
      DeckScreens.openCollection('title', 'enlight');
      const row = document.querySelector('#scrCards .clTabs'), rr = row.getBoundingClientRect(), bad = [];
      let svg = 0;
      for (const t of row.querySelectorAll('.clTab')) {
        const b = t.getBoundingClientRect(), cs = getComputedStyle(t);
        const inL = b.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft), inR = b.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight);
        const kids = [...t.children].filter(k => k.getClientRects().length).map(k => k.getBoundingClientRect());
        const l = Math.min(...kids.map(k => k.left)), rt = Math.max(...kids.map(k => k.right)), mid = b.top + b.height / 2;
        const off = Math.max(...kids.map(k => Math.abs(k.top + k.height / 2 - mid)));
        if (l < inL - 0.5 || rt > inR + 0.5) bad.push(`${t.dataset.tier} runs ${Math.max(inL - l, rt - inR).toFixed(1)}px off its padding`);
        if (Math.abs((l - b.left) - (b.right - rt)) > 1.5) bad.push(`${t.dataset.tier} off-centre by ${Math.abs((l - b.left) - (b.right - rt)).toFixed(1)}px`);
        if (off > 2) bad.push(`${t.dataset.tier} not on one line (${off.toFixed(1)}px)`);
        if (b.left < rr.left - 0.5 || b.right > rr.right + 0.5 || b.right > innerWidth) bad.push(`${t.dataset.tier} outside the row`);
        if (t.querySelector('svg.clGem')) svg++;
      }
      return { bad, svg };
    });
    r.bad.forEach(x => tabBad.push(`${w}px ${x}`));
    gems += r.svg;
  }
  ck('theTierTabsHoldTheirLabels', tabBad.length === 0 && gems === 45, tabBad.slice(0, 5).join(' | ') ||
    `gem, name and count inside every tab, centred, level, 320-1440px; faceted vector gems ${gems}/45`);
  await p.close();
}

/* ================= 5b. THE NEW CARD IS FOUND FOR YOU =================
   Opened from the reward screen the collection landed on the right tier but
   scrolled to its top, in catalog order: the new Kraken's Call half off the
   screen behind a row of "?"s, Barbarian Pact below the fold, and nothing to
   say which was new (playtest earn, b-win-05). On a short phone with every
   face drawn: the run's card wears NEW, its tier's tab is marked, and it is
   in view when the collection opens — and from the title nothing is new. */
{
  const p = await page({ h: 600, reduce: true });
  await p.evaluate(SETUP);
  const a = await p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const out = {};
    CFG.CARDS.ON = true;
    __fresh();
    Deck.ensureStarter();
    const c = Deck.col();
    for (const card of Deck.CATALOG) if (!c.seen[card.id]) c.seen[card.id] = 1;   // every face drawn: the new one has company
    Deck.saveCol();
    window.__run({ seed: 'ds-new', win: true, cards: [['imperial', 'barbarian_pact']] });
    await wait(300);
    document.querySelector('#cardEnd [data-act="deck"]').click();
    await wait(300);
    const scr = document.getElementById('scrCards'), body = scr.querySelector('.clBody');
    out.cur = Screens.current;
    out.tab = (scr.querySelector('.clTab.sel') || {}).dataset;
    out.tab = out.tab && out.tab.tier;
    const cell = scr.querySelector('.clCell[data-card="barbarian_pact"]');
    out.tag = !!cell && cell.classList.contains('clNew') ? ((cell.querySelector('.clNewTag') || {}).textContent || '') : '';
    const br = body.getBoundingClientRect(), cr = cell ? cell.getBoundingClientRect() : { top: 1e9, bottom: 1e9 };
    out.inView = cr.top >= br.top - 1 && cr.bottom <= br.bottom + 1;
    out.scrolled = Math.round(body.scrollTop);
    out.marked = [...scr.querySelectorAll('.clCell.clNew')].map(e => e.dataset.card).join(',');
    out.fresh = [...scr.querySelectorAll('.clTab.clFresh')].map(e => e.dataset.tier).join(',');
    document.querySelector('#scrCards [data-act="back"]').click();
    DeckScreens.openCollection('title', 'imperial');
    out.titleNew = document.querySelectorAll('#scrCards .clCell.clNew').length;
    return out;
  });
  ck('theCollectionOpensOnTheNewCard', a.cur === 'cards' && a.tab === 'imperial' && /^new$/i.test(a.tag) && a.inView && a.scrolled > 0 &&
    a.marked === 'barbarian_pact' && a.fresh === 'imperial' && a.titleNew === 0,
    `tab ${a.tab}; tag "${a.tag}"; in view ${a.inView} (scrolled ${a.scrolled}px); NEW on ${a.marked || 'nothing'}; tab marked ${a.fresh || 'none'}; from the title ${a.titleNew} new`);
  await p.close();
}

/* ================= 5c. THE PAINTED VALLEY =================
   The backdrop and the plinth are supplied art that lands by FILENAME
   (assets/endgame/reward/{win|loss}-{wide|tall}.webp, a .jpg behind each,
   pedestal.png) — a landscape window takes the wide valley and a phone the
   tall one — and a picture that is not there leaves the procedural painting
   standing, the card still on its slit and nothing thrown. */
{
  const want = { 'win-wide': 0, 'loss-wide': 0, 'win-tall': 0, 'loss-tall': 0 };
  const landed = [], wrong = [];
  for (const [w, h, dpr, orient] of [[1440, 900, 1, 'wide'], [390, 844, 3, 'tall']]) {
    const p = await page({ w, h, dpr, reduce: true });
    await p.evaluate(SETUP);
    // a page this young is still probing the late art tier; a real run's end never meets that queue
    await p.waitForFunction(() => Assets.allArtReady && Assets.allArtReady(), null, { timeout: 60000 }).catch(() => {});
    for (const win of [true, false]) {
      const r = await p.evaluate(async (win) => {
        CFG.CARDS.ON = true;
        __fresh();
        window.__run({ seed: 'ds-art-' + win, win, cards: [['iron', 'swift_raiders']] });
        const root = document.getElementById('cardEnd');
        for (let i = 0; i < 300 && !(root.classList.contains('ceArtBg') && root.querySelector('.cePlinth.ceArt')); i++) await new Promise(r => setTimeout(r, 50));
        const name = root.dataset.bg, art = DeckScreens._art[name] || {}, ped = DeckScreens._art.pedestal || {};
        const cv = root.querySelector('.ceBgArt'), img = art.img;
        const k = img ? cv.width / img.naturalWidth : 0;
        const u = parseFloat(root.style.getPropertyValue('--u'));
        const face = root.querySelector('.ceMove .ccard'), plinth = root.querySelector('.cePlinth');
        return { name, url: art.url || '', ped: ped.url || '', shown: getComputedStyle(cv).display !== 'none' && root.classList.contains('ceArtBg'),
          k, whole: k === Math.round(k) && cv.height === img.naturalHeight * k,
          pedArt: plinth.classList.contains('ceArt') && plinth.width === DeckScreens.PLINTH.w && plinth.height === DeckScreens.PLINTH.h,
          foot: +(face.getBoundingClientRect().bottom - (plinth.getBoundingClientRect().top + DeckScreens.PLINTH.ty * u)).toFixed(2) };
      }, win);
      const exp = (win ? 'win' : 'loss') + '-' + orient;
      if (r.name === exp && r.shown && /assets\/endgame\/reward\/(win|loss)-(wide|tall)\.webp\?v=\d+$/.test(r.url) && r.url.includes(exp + '.webp') &&
          /assets\/endgame\/reward\/pedestal\.png\?v=\d+$/.test(r.ped) && r.pedArt && r.whole && Math.abs(r.foot) <= 1) { want[exp]++; landed.push(`${exp}@${w} k${r.k}`); }
      else wrong.push(`${w}x${h} ${win ? 'win' : 'loss'}: ${JSON.stringify(r)}`);
    }
    await p.close();
  }
  ck('theRewardArtLandsByFilename', wrong.length === 0 && Object.values(want).every(n => n === 1),
    wrong.join(' | ') || landed.join(', ') + '; the pedestal on its slit');

  // a 404: the picture never lands, the procedural land and drum stay, and the card still stands on the slit
  const p = await page({ w: 1440, h: 900, dpr: 1, reduce: true });
  await p.evaluate(SETUP);
  const f = await p.evaluate(async () => {
    CFG.CARDS.ON = true;
    __fresh();
    DeckScreens.ART_DIR = 'assets/endgame/no-such-folder/';
    DeckScreens._art = {};
    window.__run({ seed: 'ds-art-404', win: true, cards: [['iron', 'swift_raiders']] });
    // a 404 is asked twice, 1.5s apart, before the painting is kept for the session
    for (let i = 0; i < 200 && Object.values(DeckScreens._art).some(e => e.ok === null); i++) await new Promise(r => setTimeout(r, 50));
    const root = document.getElementById('cardEnd'), cv = root.querySelector('.ceBgArt'), bg = root.querySelector('.ceBg');
    const plinth = root.querySelector('.cePlinth'), face = root.querySelector('.ceMove .ccard');
    const u = parseFloat(root.style.getPropertyValue('--u'));
    return { settled: Object.values(DeckScreens._art).map(e => e.ok), art: root.classList.contains('ceArtBg'), shown: getComputedStyle(cv).display,
      bg: [bg.width, bg.height], pedArt: plinth.classList.contains('ceArt'), plinth: [plinth.width, plinth.height],
      foot: +(face.getBoundingClientRect().bottom - (plinth.getBoundingClientRect().top + DeckScreens.PLINTH.ty * u)).toFixed(2),
      claim: !!root.querySelector('[data-act="claim"]') };
  });
  await p.close();
  ck('andAMissingPictureLeavesThePaintedLand', f.settled.length === 2 && f.settled.every(x => x === false) && !f.art && f.shown === 'none' &&
    f.bg[0] >= 60 && f.bg[0] !== 300 && !f.pedArt && f.plinth[0] === 240 && Math.abs(f.foot) <= 1 && f.claim,
    `asked ${f.settled.length} pictures (${f.settled}), art shown ${f.art}/${f.shown}, procedural land ${f.bg.join('x')}, drum ${f.plinth.join('x')} (art ${f.pedArt}), foot ${f.foot}px off the slit`);
}

/* ================= 5d. THE TITLE NEVER CROWDS THE CARD =================
   The card's frame stands clear of the banner — a real gap, not a touch —
   at every size the game is played at, and nothing on the screen overlaps
   the banner or the card. */
{
  const bad = [], seen = [];
  for (const [w, h, dpr, min] of [[390, 844, 3, 14], [430, 932, 3, 14], [768, 1024, 2, 14], [1440, 900, 1, 28], [1920, 1080, 1, 28]]) {
    const p = await page({ w, h, dpr, reduce: true });
    await p.evaluate(SETUP);
    for (const win of [true, false]) {
      const r = await p.evaluate((win) => {
        CFG.CARDS.ON = true;
        __fresh();
        window.__run({ seed: 'ds-gap-' + win, win, cards: [['imperial', 'golden_age']] });
        const root = document.getElementById('cardEnd'), sc = root.querySelector('.ceScroll');
        const R = el => el.getBoundingClientRect();
        const rib = R(root.querySelector('.ceRib')), card = R(root.querySelector('.ceMove .ccard')), eye = R(root.querySelector('.ceEye'));
        const hit = (a, b) => !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
        const others = [...root.querySelectorAll('.cePlate, .ceScore, .cePlayed, .ceTile, .ceBtns, .ceDeck')].filter(el => el.getClientRects().length);
        const over = others.filter(el => hit(R(el), rib) || hit(R(el), card)).map(el => el.className);
        return { gap: Math.round(card.top - rib.bottom), eyeGap: Math.round(rib.top - eye.bottom), over, scroll: sc.scrollHeight - sc.clientHeight };
      }, win);
      seen.push(`${w}x${h} ${r.gap}px`);
      if (r.gap < min || r.eyeGap < -1 || r.over.length || r.scroll > 1) bad.push(`${w}x${h} ${win ? 'win' : 'loss'}: ${JSON.stringify(r)}`);
    }
    await p.close();
  }
  ck('theTitleNeverCrowdsTheCard', bad.length === 0, bad.join(' | ') || [...new Set(seen)].join(', ') + ' between banner and card; nothing overlaps either, nothing scrolls');
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

/* ================= 7. THE CHROME IS DRAWN AT THE DEVICE'S OWN RESOLUTION =================
   The operator's standing ruling: the world's art — the painted valley, the
   pedestal standing in it, the card paintings — stays pixel art, but the
   CHROME (the banner and its sprigs, the laurels, brackets, icons, buttons,
   gems, the close, the sparks) is high quality at the device's own pixels,
   never a small pixel-art picture blown up. Measured in the live page, on
   every screen this file owns, at every size the screens lay out for — a
   phone ON ITS SIDE included (3x, and the wide window's layout): every
   raster drawn (a canvas, an <img>, a CSS background url() on any element
   or pseudo-element) is shown at or below its own pixel count on a 3x
   screen — CSS size × 3 ≤ natural size. A vector passes by being one. The
   exempt pictures are named, never guessed: a card face (Deck.face), the
   painted valley (and its procedural stand-in), the pedestal — world art,
   held instead to never more than twice its pixels — and the HUD's shared
   plank texture (ui.js, the whole HUD's material, not this screen's). No
   inline SVG asks for crisp edges and no chrome for nearest-neighbour. The
   probe is shown it can see a blow-up: the old 22x44 sprig canvas put back
   on the banner, and a crisp-edged icon, must both be named. */
{
  const PROBE = async (scopes) => {
    const out = [], nat = {};
    const natOf = u => nat[u] || (nat[u] = new Promise(res => { const i = new Image(); i.onload = () => res([i.naturalWidth, i.naturalHeight]); i.onerror = () => res(null); i.src = u; }));
    const wood = getComputedStyle(document.documentElement).getPropertyValue('--wood-tex').trim();
    // how wide one copy of a background picture is drawn, in CSS px
    const tileW = (cs, rc, n) => {
      const bs = cs.backgroundSize.split(',')[0].trim();
      if (bs === 'cover') return n[0] * Math.max(rc.width / n[0], rc.height / n[1]);
      if (bs === 'contain') return n[0] * Math.min(rc.width / n[0], rc.height / n[1]);
      const [a, b] = bs.split(/\s+/), v = (s, box) => /%$/.test(s) ? box * parseFloat(s) / 100 : /px$/.test(s) ? parseFloat(s) : null;
      const w = a && a !== 'auto' ? v(a, rc.width) : null, h = b && b !== 'auto' ? v(b, rc.height) : null;
      if (w != null) return w;
      if (h != null) return h * n[0] / n[1];
      return n[0];
    };
    for (const sel of scopes) {
      const root = document.querySelector(sel);
      if (!root) continue;
      for (const el of [root, ...root.querySelectorAll('*')]) {
        if (!el.getClientRects().length) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden') continue;
        const rc = el.getBoundingClientRect(), name = el.tagName.toLowerCase() + (el.className && el.className.baseVal == null ? '.' + String(el.className).trim().split(/\s+/).join('.') : '');
        const exempt = el.closest('.ccard') ? 'card' : el.matches('.ceBg, .ceBgArt') ? 'scene' : el.matches('.cePlinth') ? 'pedestal' : null;
        if (/pixelated|crisp-edges/.test(cs.imageRendering) && !exempt) out.push({ name, nn: true });
        if (el.tagName.toLowerCase() === 'svg' && /crisp/i.test(el.getAttribute('shape-rendering') || '') && !exempt) out.push({ name, crisp: true });
        if (el.tagName === 'CANVAS' && rc.width) out.push({ name, exempt, w: rc.width, nw: el.width, h: rc.height, nh: el.height });
        if (el.tagName === 'IMG' && el.naturalWidth && rc.width) out.push({ name, exempt, w: rc.width, nw: el.naturalWidth, h: rc.height, nh: el.naturalHeight });
        for (const pse of [null, '::before', '::after']) {
          const ps = getComputedStyle(el, pse);
          if (pse && ps.content === 'none') continue;
          for (const m of ps.backgroundImage.matchAll(/url\("?([^")]+)"?\)/g)) {
            if (/^data:image\/svg|\.svg(\?|$)/.test(m[1])) { out.push({ name: name + (pse || ''), svg: true }); continue; }
            const n = await natOf(m[1]);
            if (!n) continue;
            const isWood = wood && wood.includes(m[1].slice(0, 80));
            out.push({ name: name + (pse || '') + ' bg', exempt: exempt || (isWood ? 'hud-wood' : null), w: tileW(ps, rc, n), nw: n[0] });
          }
        }
      }
    }
    return out;
  };
  // the test link's deck (every card, every face found) for the collection
  // and the sheet; then fresh collections for the three endings
  const SCENES = {
    collection: async () => { DeckScreens.openCollection('title', 'imperial'); DeckScreens._zoom(document.querySelector('#scrCards .clCell')); },
    sheet: async () => {
      Screens._demo = false; G.newGame('ds-chrome-s', 'moderate', 'medium'); Screens.show('playing');
      for (let i = 0; i < 200 && !DeckUI.built; i++) await new Promise(r => setTimeout(r, 30));
      DeckUI.openSheet();
    },
    won: async () => { DeckUI.closeSheet && DeckUI.closeSheet(); CFG.CARDS.ON = true; __fresh(); window.__run({ seed: 'ds-chrome-w', win: true, played: [{ id: 'golden_age', day: 5 }], cards: [['imperial', 'golden_age']] }); },
    lost: async () => { CFG.CARDS.ON = true; __fresh(); window.__run({ seed: 'ds-chrome-l', win: false, cards: [['bronze', 'war_band']] }); },
    empty: async () => { CFG.CARDS.ON = true; __fresh(); window.__run({ seed: 'ds-chrome-e', win: false, built: 0, days: 1 }); },
  };
  const SCOPE = { won: ['#cardEnd'], lost: ['#cardEnd'], empty: ['#cardEnd'], collection: ['#scrCards'], sheet: ['#dkSheet', '#deckBtn'] };
  const bad = [], seen = new Set(), vec = [], ped = [], looked = {};
  let control = null;
  for (const [w, h, dpr] of [[390, 844, 3], [430, 932, 3], [844, 390, 3], [768, 1024, 2], [1440, 900, 1], [1920, 1080, 1]]) {
    const p = await page({ w, h, dpr, reduce: true, q: '?cards=all' });
    await p.evaluate(SETUP);
    await p.waitForFunction(() => Assets.allArtReady && Assets.allArtReady(), null, { timeout: 60000 }).catch(() => {});
    for (const sc of Object.keys(SCENES)) {
      await p.evaluate(`(${SCENES[sc].toString()})()`);
      if (sc === 'won') await p.waitForFunction(() => document.querySelector('#cardEnd .cePlinth.ceArt'), null, { timeout: 15000 }).catch(() => {});
      await p.waitForTimeout(250);
      const r = await p.evaluate(PROBE, SCOPE[sc]);
      // every screen must actually have been looked at: its chrome measured, not skipped
      if (r.length) looked[sc] = (looked[sc] || 0) + 1;
      for (const x of r) {
        const tag = `${sc}@${w}x${h}`;
        if (x.nn) bad.push(`${tag} ${x.name} asks for nearest-neighbour`);
        else if (x.crisp) bad.push(`${tag} ${x.name} is a crisp-edged SVG`);
        else if (x.svg) seen.add(x.name.replace(/\s.*$/, ''));
        else if (x.exempt === 'pedestal') { if (x.w > x.nw * 2 + 0.5) bad.push(`${tag} the pedestal at ${(x.w / x.nw).toFixed(2)}x its pixels`); else ped.push((x.w / x.nw).toFixed(2)); }
        else if (!x.exempt && (x.w * 3 > x.nw + 0.5 || (x.h && x.h * 3 > x.nh + 0.5))) bad.push(`${tag} ${x.name} ${Math.round(x.w)}px wide from ${x.nw}px (${(x.w * 3 / x.nw).toFixed(2)}x at 3x)`);
      }
      if (sc === 'won') {
        vec.push(await p.evaluate(() => {
          const svg = s => /^url\("data:image\/svg\+xml/.test(s);
          const one = ['.ceRibArt', '.ceBL.l', '.ceBL.r', '.ceLaurel.l', '.ceLaurel.r'].every(s => {
            const e = document.querySelector('#cardEnd ' + s);
            return e && svg(getComputedStyle(e).backgroundImage) && e.getBoundingClientRect().width > 0;
          });
          // the brackets: four SVG corners on each panel and on the screen's
          // frame — never bars of colour, whose overlap lit every corner
          const four = ['.ceScore', '.ceTile', '.ceLines'].every(s => {
            const imgs = getComputedStyle(document.querySelector('#cardEnd ' + s)).backgroundImage.split(/,\s*(?=url|linear|radial|none)/);
            return imgs.length === 4 && imgs.every(svg);
          });
          // and each rule of the eyebrow ends in an SVG knot
          const knots = [...document.querySelectorAll('#cardEnd .ceEye i')].every(i => svg(getComputedStyle(i, '::after').backgroundImage));
          return one && four && knots;
        }));
        if (!control) {
          // the control: the old pixel sprig and a crisp-edged icon, put back — the probe must name both
          control = await p.evaluate(async (probe) => {
            const rib = document.querySelector('#cardEnd .ceRib'), c = document.createElement('canvas');
            c.width = 22; c.height = 44; c.className = 'oldSprig'; c.style.cssText = 'width:22px;height:44px';
            rib.appendChild(c);
            const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            s.setAttribute('shape-rendering', 'crispEdges'); s.setAttribute('viewBox', '0 0 4 4'); s.style.cssText = 'width:12px;height:12px';
            rib.appendChild(s);
            const r = await (eval('(' + probe + ')'))(['#cardEnd']);
            c.remove(); s.remove();
            return { sprig: r.some(x => /oldSprig/.test(x.name) && x.w * 3 > x.nw), crisp: r.some(x => x.crisp) };
          }, PROBE.toString());
        }
      }
    }
    await p.close();
  }
  const all = Object.keys(SCENES).every(k => looked[k] === 6);
  ck('theChromeIsDrawnAtTheDevicesResolution', bad.length === 0 && all && control && control.sprig && control.crisp,
    (bad.length ? 'per screen ' + JSON.stringify(bad.reduce((o, b) => { const k = b.split('@')[0]; o[k] = (o[k] || 0) + 1; return o; }, {})) + ': ' + [...new Set(bad.map(b => b.replace(/^\S+ /, '')))].slice(0, 6).join(' | ') : '') || (!all ? 'a screen went unmeasured: ' + JSON.stringify(looked) :
      `no raster chrome past its pixels at 3x on the reward (won, lost, empty), the collection or the deck sheet, 390-1920px and a phone on its side; ` +
      `${seen.size} vector pieces; the control's old sprig and crisp icon named: ${control && control.sprig}/${control && control.crisp}`));
  ck('andTheBannerLaurelsAndBracketsAreVectors', vec.length === 6 && vec.every(Boolean),
    `the ribbon, two sprigs, two laurels, the panels' and the frame's corner brackets and the eyebrow's knots are SVG at ${vec.filter(Boolean).length} of 6 sizes`);
  ck('andThePedestalIsNeverPastTwiceItsPixels', ped.length > 0 && !bad.some(b => /pedestal/.test(b)), `shown at ${[...new Set(ped)].join('x, ')}x its pixels`);
}

for (const [k, v] of Object.entries(res)) console.log((v.startsWith('PASS') ? ' ' : '✗') + ' ' + k + ': ' + v);
if (errs.length) console.log('PAGE ERRORS:', errs.slice(0, 4));
await b.close();
if (fails.length || errs.length) { console.log('FAILURES:', fails.join(', ') || 'pageerrors'); process.exit(1); }
console.log('ALL DECK-SCREENS CHECKS PASS');
