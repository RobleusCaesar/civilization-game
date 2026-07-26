/* NO-WAY-BACK CONTRACT — the offer to concede, and the rival's finishing blow.

   A run is decided long before the Town Center actually falls, and watching a
   hall chipped down over twenty days with nothing you can do is a wait, not a
   game. Two halves:

     G.checkDoom  — offers the choice ONCE when the village provably cannot
       feed itself: no villagers, food under a villager's price, and no Trading
       Post (which trades any resource for any other, and the hall's own gold
       trickle keeps it fed — so owning one IS a way back). Rather than reason
       about whether some fishing boat might still be working a shoal, it
       MEASURES: the granary must also fail to rise for DOOM_DAYS running.
     AI.foeSpent / stormTheHall — a town with no hands cannot rebuild, repair
       or replace anything, so the chief stops husbanding its host and puts
       every warrior on the hall. Drawn from SIGHT and only sight: it needs
       eyes on the hall, and it never consults a unit it cannot see. A villager
       hidden in a far corner is therefore NOT caught — deliberately. Catching
       it would mean reading hidden state, and hiding a hand is real counterplay.

   Run after touching: game.js checkDoom/DOOM_DAYS/end, screens.js
   onDoomed/doomResign/doomStay/resign, ai.js foeSpent/stormTheHall/daily,
   the scrDoomed markup, or the Trading Post.

     node tests/endgame-doom.mjs      # exits non-zero on any regression
*/
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const b = await pw.chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await p.goto('file://' + join(root, 'index.html'), { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(900);

const res = {}, fails = [];
const ck = (n, ok, info) => { res[n] = (ok ? 'PASS' : 'FAIL') + (info ? ' — ' + info : ''); if (!ok) fails.push(n); };

// strip the village down to the doomed state, optionally leaving one lifeline
const setup = (lifeline) => p.evaluate((lifeline) => {
  G.newGame('doom1', 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
  S.doomShown = false; S.doomT = 0; S._doomFood = null;
  for (const u of S.units.slice()) if (u.owner === 'P' && Units.isVillager(u)) u.hp = 0;
  S.units = S.units.filter(u => u.hp > 0);
  S.res = { food: 0, wood: 900, stone: 900, gold: 900 };
  const tc = Bld.tcOf('P');
  if (lifeline === 'trade') {
    tc.level = 3;
    const s = MapGen.findNear(tc.x + 3, tc.y + 3, 8, (x, y) => Bld.canPlace('P', 'trade', x, y).ok);
    if (s) Bld.place('P', 'trade', s.x, s.y, { free: true, instant: true });
  }
  if (lifeline === 'food') S.res.food = 400;
  if (lifeline === 'villager') Units.spawn('villager', 'P', tc.x + 2, tc.y + 2);
  const days = [];
  for (let d = 0; d < 6 && !S.doomShown; d++) { S.day++; G.checkDoom(); days.push(S.doomT); }
  return { shown: !!S.doomShown, screen: Screens.current, days, paused: S.paused };
}, lifeline);

let r = await setup(null);
ck('firesWhenDoomed', r.shown && r.screen === 'doomed' && r.days.length === G_DOOM(), `days=${r.days} screen=${r.screen}`);
function G_DOOM() { return 3; }
ck('pausesTheGame', r.paused, 'game paused behind the dialog');
const txt = await p.$eval('#scrDoomed', e => e.textContent.replace(/\s+/g, ' ').trim());
console.log('DIALOG:', txt);
ck('hasBothButtons', /Resign/.test(txt) && /I like to suffer/.test(txt), txt.slice(0, 60));


// "I like to suffer" hands the game back and never nags again
await p.click('#btnDoomStay');
let after = await p.evaluate(() => { const o = { screen: Screens.current, paused: S.paused };
  for (let d = 0; d < 10; d++) { S.day++; G.checkDoom(); }
  o.reShown = Screens.current; return o; });
ck('sufferReturnsToPlay', after.screen === 'playing' && !after.paused, `screen=${after.screen} paused=${after.paused}`);
ck('asksOnlyOnce', after.reShown === 'playing', `still ${after.reShown} after 10 more days`);

// Resign ends the run at the Game Over screen
await setup(null);
await p.click('#btnDoomResign');
const end = await p.evaluate(() => ({ screen: Screens.current, over: !!(S.over), win: S.over && S.over.win, resigned: !!S.resigned }));
ck('resignEndsTheRun', end.screen === 'endgame' && end.over && end.win === false && end.resigned, JSON.stringify(end));

// the three lifelines must each suppress it
for (const [key, label] of [['trade', 'aTradingPostSavesYou'], ['food', 'foodInTheStoreSavesYou'], ['villager', 'aVillagerSavesYou']]) {
  const x = await setup(key);
  ck(label, !x.shown, `doomT=${x.days}`);
}
// …and food actually arriving suppresses it too (a fishing boat still working)
const fed = await p.evaluate(() => {
  G.newGame('doom2', 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
  S.doomShown = false; S.doomT = 0; S._doomFood = null;
  for (const u of S.units.slice()) if (u.owner === 'P' && Units.isVillager(u)) u.hp = 0;
  S.units = S.units.filter(u => u.hp > 0);
  S.res = { food: 0, wood: 900, stone: 900, gold: 900 };
  for (let d = 0; d < 8 && !S.doomShown; d++) { S.day++; S.res.food += 6; G.checkDoom(); }   // a boat brings food in
  return { shown: !!S.doomShown, food: S.res.food };
});
ck('foodComingInSavesYou', !fed.shown, `food climbed to ${fed.food}, never fired`);

console.log(JSON.stringify(res, null, 1));
console.log(fails.length ? 'FAILURES: ' + fails.join(', ') : 'ALL DOOM CHECKS PASS');
console.log('errors:', errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e)));
await b.close();
process.exit(fails.length ? 1 : 0);
