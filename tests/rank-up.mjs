/* A SOLDIER RISES A RANK (build 174 — operator: "allow the player to upgrade
   those units… pay a fee and upgrade to an axe man… 50% of the build cost for
   the upgraded unit… a small button next to the 'i' button… immediate…
   archers in the manned towers… greyed out until the military building is at
   the correct level… if clicked, show a message about the military building
   level required").

     THE LADDERS   the three yards' own training lines, in order: defender →
                   axeman → Bronze Champion, archer → longbow → marksman,
                   rider → horse archer → lancer. The top of a line, a
                   villager, an engine, a hull, a ghost or anyone else's
                   soldier is offered nothing.
     THE GATE      a FINISHED yard of the player's at the rank's own reqLevel
     THE PRICE     half the rank's own training bill, rounded up, paid at once
     THE MAN       same id, same place, same post on a tower, health kept in
                   proportion, the rank's stats, his stamps kept
     THE BUTTON    in the header beside the ℹ️, greyed while it cannot act,
                   and a greyed tap says why

   Run after touching Units.rankLine / rankNext / rankCheck / rankUp,
   UI.rankBtn and its handler, or the yards' train tables.

     node tests/rank-up.mjs      # exits non-zero on any regression */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: 430, height: 880 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto('file://' + join(root, 'index.html'), { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.Screens && Screens.current === 'title', null, { timeout: 60000 });

const out = await p.evaluate(async () => {
  const res = {}, fails = [];
  const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };
  const nap = ms => new Promise(r => setTimeout(r, ms));
  G.newGame('rank1', 'moderate', 'medium'); Screens._demo = false; Screens.show('playing'); S.paused = true;
  G.freeVis = true; G.updateVisibility();
  const tc = Bld.tcOf('P');
  const put = (k, x, y, lv, owner) => {
    const bb = Bld.place(owner || 'P', k, x, y, { free: true, instant: true });
    if (bb && bb.construction > 0) Bld.finish(bb);
    if (bb) bb.level = lv || 1;
    Bld._block = null;
    return bb;
  };
  const clearGround = (x0, y0, n) => { for (let y = y0; y < y0 + n; y++) for (let x = x0; x < x0 + n; x++) if (MapGen.onBoard(x, y)) S.map.terrain[MapGen.idx(x, y)] = T.GRASS; Bld._block = null; };
  clearGround(tc.x - 9, tc.y - 9, 20);
  S.res = { food: 5000, wood: 5000, stone: 5000, gold: 5000 };

  // ---- 1. the ladders and the price ----
  {
    const want = { defender: 'axeman', axeman: 'elite', archer: 'longbow', longbow: 'marksman', rider: 'horsearcher', horsearcher: 'lancer' };
    let ok = true; const bad = [];
    for (const k in want) {
      const u = Units.spawn(k, 'P', tc.x + 4, tc.y + 4);
      const n = Units.rankNext(u);
      if (!n || n.to !== want[k]) { ok = false; bad.push(k + '→' + (n && n.to)); }
      else {
        const t = CFG.BUILDINGS[n.yard].train[n.to];
        for (const r in t.cost) if (n.cost[r] !== Math.ceil(t.cost[r] / 2)) { ok = false; bad.push(k + ' ' + r); }
        if (Object.keys(n.cost).length !== Object.keys(t.cost).length) { ok = false; bad.push(k + ' keys'); }
        if (n.lv !== t.reqLevel) { ok = false; bad.push(k + ' lv'); }
      }
      Units.despawn(u);
    }
    ck('eachLineClimbsItsOwnYardAtHalfThePrice', ok, bad.join(', '));
    const none = ['elite', 'marksman', 'lancer', 'villager', 'catapult', 'sapper'].filter(k => {
      const u = Units.spawn(k, 'P', tc.x + 4, tc.y + 4); const n = Units.rankNext(u); Units.despawn(u); return !!n;
    });
    const foe = Units.spawn('defender', 'A', tc.x + 4, tc.y + 4);
    const ghost = Units.spawn('defender', 'P', tc.x + 4, tc.y + 4); ghost.spectral = true;
    ck('theTopOfALineAndEveryoneElseIsOfferedNothing',
      !none.length && !Units.rankNext(foe) && !Units.rankNext(ghost), none.join(','));
    Units.despawn(foe); Units.despawn(ghost);
  }

  // ---- 2. the gate: a finished yard at the rank's level ----
  const d = Units.spawn('defender', 'P', tc.x + 3, tc.y + 3);
  {
    S.buildings.filter(bb => bb.owner === 'P' && bb.key === 'barracks').forEach(bb => Bld.removeToRuin(bb, true));
    const none = Units.rankCheck(d);
    const bk = put('barracks', tc.x - 6, tc.y - 6, 1);
    const lv1 = Units.rankCheck(d);
    bk.construction = 5;
    bk.level = 2;
    const site = Units.rankCheck(d);
    bk.construction = 0;
    const lv2 = Units.rankCheck(d);
    ck('noYardNoRank', none && !none.ok && none.code === 'yard' && /Barracks at level 2/.test(none.why), none && none.why);
    ck('aLevelOneYardIsNotEnough', lv1 && !lv1.ok && lv1.code === 'yard', lv1 && lv1.code);
    ck('aYardStillRisingIsNotEnough', site && !site.ok && site.code === 'yard', site && site.code);
    ck('aLevelTwoYardOpensTheAxeman', lv2 && lv2.ok && lv2.to === 'axeman', lv2 && lv2.why);
    const res = Object.assign({}, S.res);
    S.res = { food: 0, wood: 0, stone: 0, gold: 0 };
    const poor = Units.rankCheck(d);
    ck('anEmptyPurseSaysThePrice', poor && !poor.ok && poor.code === 'cost' && /costs/.test(poor.why), poor && poor.why);
    S.res = res;
  }

  // ---- 3. the man rises, at once, paying half ----
  {
    d.hp = d.maxhp / 2;
    d.task = { type: 'move' }; d.defend = true;
    const id = d.id, x = d.x, y = d.y, before = Object.assign({}, S.res);
    const c = Units.rankUp(d);
    const t = CFG.UNITS.axeman;
    const paid = Object.keys(c.cost).every(r => before[r] - S.res[r] === c.cost[r]);
    ck('heRisesAtOnceAndPaysHalf', d.kind === 'axeman' && paid, `${d.kind}, paid ${Bld.costStr(c.cost)}`);
    ck('andKeepsHisPlaceHisOrdersAndHisWounds', d.id === id && d.x === x && d.y === y && d.defend === true &&
      d.maxhp === t.hp && Math.abs(d.hp - t.hp / 2) <= 1 && d.atk === t.atk && d.def === t.def,
      `hp ${d.hp}/${d.maxhp}, atk ${d.atk}`);
    // a veteran keeps his 1.25, the sky-iron its +1
    const v = Units.spawn('defender', 'P', tc.x + 3, tc.y + 2);
    v.vet = 1.25; v.maxhp = Math.round(v.maxhp * 1.25); v.hp = v.maxhp; v.atk = v.atk * 1.25;
    v.skyIron = true; v.atk += 1;
    Units.rankUp(v);
    ck('aVeteranAndHisSkyIronKeepTheirMarks', v.maxhp === Math.round(t.hp * 1.25) && Math.abs(v.atk - (t.atk + 1) * 1.25) < 1e-9,
      `hp ${v.maxhp}, atk ${v.atk}`);
    Units.despawn(v);
  }

  // ---- 4. the bow on a tower rises where he stands ----
  {
    put('range', tc.x + 5, tc.y - 6, 2);
    const tw = put('tower', tc.x - 3, tc.y + 6, 1);
    const a = Units.spawn('archer', 'P', tc.x - 3, tc.y + 8);
    Lookout.order(a, tw);
    for (let k = 0; k < 600 && !a.perch; k++) Units.update(0.05);
    UI.select('unit', a.id);
    const btn = document.querySelector('#panel [data-act="rankup"]');
    const lit = btn && !btn.classList.contains('cant');
    btn && btn.click();
    ck('aBowUpATowerHasTheButtonAndRisesThere', a.perch === tw.id && lit && a.kind === 'longbow' && a.perch === tw.id,
      `perch ${a.perch}, button ${!!btn} lit ${lit}, kind ${a.kind}`);
    // the next rank needs a level-3 range: greyed, and a tap says so
    await nap(50);
    const btn2 = document.querySelector('#panel [data-act="rankup"]');
    const grey = btn2 && btn2.classList.contains('cant');
    const k0 = a.kind;
    btn2 && btn2.click();
    await nap(30);
    const toasts = [...document.querySelectorAll('#toasts .toast')].map(t => t.textContent).join(' | ');
    ck('greyedUntilTheYardRisesAndATapSaysWhy', grey && a.kind === k0 && /Archery Range at level 3/.test(toasts), toasts);
  }

  // ---- 5. the button: beside the ℹ️, none at the top of a line ----
  {
    const e = Units.spawn('elite', 'P', tc.x + 2, tc.y + 3);
    UI.select('unit', e.id);
    const none = !document.querySelector('#panel [data-act="rankup"]');
    UI.select('unit', d.id);
    const btn = document.querySelector('#panel [data-act="rankup"]');
    const help = document.querySelector('#panel #helpToggle');
    const r1 = btn && btn.getBoundingClientRect(), r2 = help && help.getBoundingClientRect();
    const beside = r1 && r2 && Math.abs(r1.top - r2.top) < 4 && r1.right <= r2.left + 1 && r2.left - r1.right < 16;
    const title = document.querySelector('#panel .ptitle').getBoundingClientRect();
    ck('theButtonSitsBesideTheInfo', beside && r1.width <= 60 && r1.left >= title.right - 2,
      r1 ? `rank ${Math.round(r1.left)}-${Math.round(r1.right)}, info ${Math.round(r2.left)}` : 'no button');
    ck('andNoneAtTheTopOfALine', none, '');
    ck('itIsDrawnNotTyped', !!(btn && btn.querySelector('svg')), '');
  }
  return { res, fails };
});
console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL RANK-UP CHECKS PASS');
const bad = errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e));
console.log('errors:', bad);
await b.close();
process.exit(out.fails.length || bad.length ? 1 : 0);
