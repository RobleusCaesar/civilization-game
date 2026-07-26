/* TRADING-POST CONTRACT — any resource for any other, and stingy in every
   direction. The three trade directions are NOT the same trade, and the
   relationship between their rates is load-bearing:

     goods → gold   deliberately awful; gold stays the hardest thing to get
     goods → goods  a relief valve, 2–4 paid per 1 received, never free
     gold  → goods  generous per coin, but bounded — see below

   THE BOUND: the round trip goods→gold→goods is worth `gold * buy` per unit.
   If that ever reaches `1 / swap`, laundering through gold beats swapping
   directly and the direct trade becomes pointless. Raising `buy` therefore
   REQUIRES lowering `swap`. `noGoldLaundering` is the check that enforces it.

   Run this after touching any of:
     config.js — CFG.TRADE (goods, input, delay, gold, swap, buy), the
                 Trading Post building levels
     buildings.js — tradeSpec / tradeDeal / canTrade / startTrade /
                    caravanHaul, and the caravan payout in Bld.update
     ui.js — the Trading Post panel (two-step need → pay), tradeNeed

     node tests/trade-post.mjs      # exits non-zero on any regression

   Legacy saves carry a caravan of the OLD shape ({res, gold}); caravanHaul
   must keep paying those out as gold. */
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const b = await pw.chromium.launch();
const p = await b.newPage({ viewport: { width: 430, height: 880 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await p.goto('file:///home/user/civilization-game/index.html', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(900);
const out = await p.evaluate(() => {
  const res = {}, fails = [];
  const ck = (n, ok, info) => { res[n] = (ok ? 'PASS' : 'FAIL') + (info ? ' — ' + info : ''); if (!ok) fails.push(n); };
  const R = ['food', 'wood', 'stone', 'gold'];
  G.newGame('tr1', 'moderate', 'large'); Screens.show('playing'); S.paused = true;
  const tc = Bld.tcOf('P');
  tc.level = 3; tc.maxhp = CFG.BUILDINGS.tc.levels[2].hp; tc.hp = tc.maxhp;   // Trading Post needs TC 3
  S.res = { food: 5000, wood: 5000, stone: 5000, gold: 5000 };
  const spot = MapGen.findNear(tc.x + 3, tc.y + 3, 8, (x, y) => Bld.canPlace('P', 'trade', x, y).ok);
  const post = spot ? Bld.place('P', 'trade', spot.x, spot.y, { free: true, instant: true }) : null;
  if (!post) return { res: { postBuilt: 'FAIL — no site' }, fails: ['postBuilt'], table: {} };
  ck('postBuilt', !!post, spot ? 'ok' : 'no site');

  // ---- rate table across all pairs and levels ----
  const table = {};
  for (let lv = 1; lv <= 3; lv++) {
    post.level = lv; post.maxhp = CFG.BUILDINGS.trade.levels[lv - 1].hp; post.hp = post.maxhp;
    const row = {};
    for (const need of R) for (const pay of R) {
      const d = Bld.tradeDeal(post, need, pay);
      if (d) row[`${pay}->${need}`] = `${d.pay}→${d.get}`;
    }
    table[lv] = row;
  }
  // every ordered pair of distinct resources must be a real trade
  post.level = 1;
  let pairs = 0, bad = [];
  for (const need of R) for (const pay of R) {
    if (need === pay) { if (Bld.tradeDeal(post, need, pay)) bad.push(`${pay}->${need} self`); continue; }
    const d = Bld.tradeDeal(post, need, pay);
    if (d && d.pay > 0 && d.get > 0) pairs++; else bad.push(`${pay}->${need}`);
  }
  ck('allPairs', pairs === 12 && !bad.length, `${pairs}/12 valid; bad=[${bad}]`);

  // ---- level scaling: bigger load, better rate, in every direction ----
  const eff = (lv, need, pay) => { post.level = lv; const d = Bld.tradeDeal(post, need, pay); return d.get / d.pay; };
  const load = (lv, need, pay) => { post.level = lv; return Bld.tradeDeal(post, need, pay).pay; };
  const better = (need, pay) => eff(1, need, pay) < eff(2, need, pay) && eff(2, need, pay) < eff(3, need, pay);
  const bigger = (need, pay) => load(1, need, pay) < load(2, need, pay) && load(2, need, pay) < load(3, need, pay);
  ck('scaleGoodsToGold', better('gold', 'wood') && bigger('gold', 'wood'),
    `rate ${eff(1,'gold','wood').toFixed(3)}/${eff(2,'gold','wood').toFixed(3)}/${eff(3,'gold','wood').toFixed(3)} load ${load(1,'gold','wood')}/${load(2,'gold','wood')}/${load(3,'gold','wood')}`);
  ck('scaleGoodsToGoods', better('food', 'wood') && bigger('food', 'wood'),
    `rate ${eff(1,'food','wood').toFixed(3)}/${eff(2,'food','wood').toFixed(3)}/${eff(3,'food','wood').toFixed(3)} load ${load(1,'food','wood')}/${load(2,'food','wood')}/${load(3,'food','wood')}`);
  ck('scaleGoldToGoods', better('wood', 'gold') && bigger('wood', 'gold'),
    `rate ${eff(1,'wood','gold').toFixed(2)}/${eff(2,'wood','gold').toFixed(2)}/${eff(3,'wood','gold').toFixed(2)} load ${load(1,'wood','gold')}/${load(2,'wood','gold')}/${load(3,'wood','gold')}`);

  // ---- STINGY: goods→goods must lose meaningfully (2–4 paid per 1 got) ----
  const ratios = [1, 2, 3].map(lv => 1 / eff(lv, 'food', 'wood'));
  ck('goodsSwapLossy', ratios.every(r => r >= 2 && r <= 4.05),
    `pay ${ratios.map(r => r.toFixed(2)).join(' / ')} per 1 received`);
  // ---- gold stays the dearest thing to buy ----
  ck('goldIsDearest', [1, 2, 3].every(lv => eff(lv, 'gold', 'wood') < eff(lv, 'food', 'wood')),
    `into gold ${[1,2,3].map(l => eff(l,'gold','wood').toFixed(3)).join('/')} vs into goods ${[1,2,3].map(l => eff(l,'food','wood').toFixed(3)).join('/')}`);
  // ---- NO LAUNDERING: goods→gold→goods must be worse than a direct swap ----
  const launder = [1, 2, 3].map(lv => ({ via: eff(lv, 'gold', 'wood') * eff(lv, 'food', 'gold'), direct: eff(lv, 'food', 'wood') }));
  ck('noGoldLaundering', launder.every(x => x.via < x.direct),
    launder.map((x, i) => `L${i+1} via ${x.via.toFixed(3)} < direct ${x.direct.toFixed(3)}`).join(', '));

  // ---- execution: every pair actually moves the treasury, and the delay holds ----
  post.level = 2;
  let ran = 0, instant = 0;
  for (const need of R) for (const pay of R) {
    if (need === pay) continue;
    post.caravan = null;
    S.res = { food: 5000, wood: 5000, stone: 5000, gold: 5000 };
    const d = Bld.tradeDeal(post, need, pay), before = { ...S.res };
    if (!Bld.startTrade(post, need, pay)) continue;
    ran++;
    if (S.res[pay] !== before[pay] - d.pay) instant++;              // load must leave now
    if (S.res[need] !== before[need]) instant++;                    // …and nothing arrives yet
    Bld.update(CFG.TRADE.levels[1].delay - 0.01);
    if (S.res[need] !== before[need]) instant++;                    // still nothing before the delay
    Bld.update(0.02);
    if (S.res[need] !== before[need] + d.get) instant++;            // then exactly the deal
    if (post.caravan) instant++;                                    // and the post frees up
  }
  ck('allPairsExecute', ran === 12 && instant === 0, `${ran}/12 ran, ${instant} timing/amount errors`);

  // ---- one caravan at a time, and the load is a real minimum ----
  post.caravan = null; S.res = { food: 5000, wood: 5000, stone: 5000, gold: 5000 };
  Bld.startTrade(post, 'food', 'wood');
  const second = Bld.startTrade(post, 'stone', 'wood');
  post.caravan = null;
  S.res = { food: 0, wood: Bld.tradeDeal(post, 'food', 'wood').pay - 1, stone: 0, gold: 0 };
  const poor = Bld.canTrade(post, 'food', 'wood');
  ck('oneCaravanAtATime', !second, second ? 'a second caravan launched' : 'blocked');
  ck('minimumLoadEnforced', !poor.ok && /Needs/.test(poor.why || ''), poor.why);

  // ---- legacy save: a caravan in flight from the old resource→gold shape ----
  post.caravan = { res: 'wood', gold: 25, t: 0.5, total: 2 };
  S.res = { food: 0, wood: 0, stone: 0, gold: 100 };
  Bld.update(0.6);
  ck('legacyCaravanPaysOut', S.res.gold === 125 && !post.caravan, `gold=${S.res.gold} caravan=${!!post.caravan}`);
  return { res, fails, table };
});
console.log('rate table (pay→get) by Trading Post level:');
for (const lv of [1, 2, 3]) console.log(' Lv' + lv, JSON.stringify(out.table[lv]));
console.log();
console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL TRADE CHECKS PASS');
console.log('errors:', errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e)));
await b.close();
process.exit(out.fails.length ? 1 : 0);
