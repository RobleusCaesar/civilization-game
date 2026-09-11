/* CALLING THE WORKS OFF — CONTRACT

   A player lays out the wrong building, or starts an upgrade and then needs
   the stone somewhere else. Until the works finish, they can be called off.

   This is NOT demolition and must never be mistaken for it:

     EVERYTHING BACK   Nothing was built, so nothing is lost. The full price
                       comes back, not the demolition rate — and what comes
                       back is what was PAID, so a discounted site cannot be
                       cancelled at the list price for a profit.

     CLEAN GROUND      A site that never rose leaves no ruin. Demolition
                       stamps rubble because something stood there; a cancel
                       must leave the tiles exactly as it found them.

     EVERY HAND FREED  The builder goes idle, and so does anyone who came to
                       help. A station's own crew, who downed tools to raise
                       its upgrade, go back to the seam instead — the same
                       return finishUpgrade makes.

     AN UPGRADE STOPS WHERE IT STARTED   b.level is only ever raised by
                       finishUpgrade, so a half-built upgrade has nothing to
                       undo: the building is still standing at its old level
                       and must stay there, at full health.

     THE BUTTON IS ONLY THERE WHEN IT CAN ACT   On the builder's panel and on
                       the building's own, and gone from both the moment
                       there is nothing being raised — including on a site
                       nobody has reached yet, which is the case it exists
                       for.

   Run this after touching any of:
     buildings.js — cancelWork / cancelRefund / cancelBuild / releaseBuilders,
                    removeToRuin's clean mode, place (b.paid), upgrade,
                    resumeCrew
     ui.js — cancelWorkButton / villagerBuildSite, the 'cancelbuild' handlers
             in the unit and building panels, both panel signatures

     node tests/build-cancel.mjs      # exits non-zero on any regression */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: 430, height: 880 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_FILE_NOT_FOUND')) errs.push('console: ' + m.text()); });
await p.goto('file://' + join(root, 'index.html'), { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(900);

const out = await p.evaluate(() => {
  const res = {}, fails = [];
  const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };
  const fresh = (seed) => {
    G.newGame(seed, 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    G.freeVis = true; G.updateVisibility();
    S.res.food = 4000; S.res.wood = 4000; S.res.stone = 4000; S.res.gold = 4000;
  };
  const tc = () => Bld.tcOf('P');
  const snapRes = () => ({ food: S.res.food, wood: S.res.wood, stone: S.res.stone, gold: S.res.gold });
  const diff = (a, z) => {
    const o = {};
    for (const k in z) if (z[k] - a[k]) o[k] = z[k] - a[k];
    return o;
  };
  const same = (a, z) => JSON.stringify(a) === JSON.stringify(z);
  // somewhere near the hall this key may legally be raised — the game's own
  // rule, not a guess at one
  const spot = (key) => {
    const t = tc();
    for (let r = 2; r < 18; r++)
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const x = t.x + dx, y = t.y + dy;
        if (MapGen.inB(x, y) && Bld.canPlace('P', key, x, y).ok) return { x, y };
      }
    return null;
  };
  /* …and for a station, GROUND ONLY. A farm answers to the placement rule
     that it goes on soil already picked bare, and there is none of that
     beside a fresh hall — but the model will raise one anywhere, which is all
     an upgrade needs to exist. */
  const freeSpot = (key) => {
    const t = tc(), sz = Bld.size(key);
    for (let r = 3; r < 18; r++)
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const x = t.x + dx, y = t.y + dy;
        let ok = true;
        for (let oy = 0; oy < sz && ok; oy++) for (let ox = 0; ox < sz; ox++)
          if (!MapGen.inB(x + ox, y + oy) || Path.blocksLand(x + ox, y + oy) || Bld.at(x + ox, y + oy)) { ok = false; break; }
        if (ok) return { x, y };
      }
    return null;
  };

  // ================= 1. A SITE CALLED OFF =================
  {
    fresh('cx1');
    S.res.food = 900; S.res.wood = 900; S.res.stone = 900; S.res.gold = 900;
    const at = spot('house');
    const before = snapRes();
    const site = Bld.place('P', 'house', at.x, at.y, {});
    ck('layingASiteCharges', site && !same(before, snapRes()), Bld.costStr(Bld.def('house').levels[0].cost));
    ck('andTheWorksAreCallableOff', Bld.cancelWork(site) === 'site', '');

    const builders = S.units.filter(u => u.task && u.task.type === 'build' && u.task.id === site.id);
    // a second pair of hands, exactly as a player would send one
    const helper = S.units.find(u => u.owner === 'P' && Units.isVillager(u) && !builders.includes(u));
    if (helper) Units.assignBuild(helper, site);
    const onSite = S.units.filter(u => u.task && u.task.type === 'build' && u.task.id === site.id);
    ck('twoHandsCanBeOnIt', onSite.length >= 2, onSite.length + ' builders');

    const id = site.id, tiles = [];
    for (let dy = 0; dy < Bld.size(site); dy++) for (let dx = 0; dx < Bld.size(site); dx++)
      tiles.push(MapGen.idx(site.x + dx, site.y + dy));

    ck('cancellingSucceeds', Bld.cancelBuild(site) === true, '');
    ck('nothingIsLeftOnTheSpot', !Bld.get(id) && !Bld.at(at.x, at.y), 'the building is gone');
    ck('andTheGroundIsCleanNotRuined',
      tiles.every(i => S.map.terrain[i] !== T.RUIN), 'a site that never rose leaves no rubble');
    ck('everyResourceComesBack', same(before, snapRes()),
      'net ' + JSON.stringify(diff(before, snapRes())));
    ck('andEveryHandGoesIdle',
      onSite.every(u => !u.task), onSite.length + ' builders released');
  }

  // ================= 2. …AT THE PRICE THAT WAS PAID =================
  {
    fresh('cx2');
    S.res.food = 900; S.res.wood = 900; S.res.stone = 900; S.res.gold = 900;
    const at = spot('house');
    const before = snapRes();
    const site = Bld.place('P', 'house', at.x, at.y, {});
    const charged = diff(snapRes(), before);          // what actually left the store
    ck('theRefundIsWhatWasCharged', same(charged, Bld.cancelRefund(site)),
      'paid ' + JSON.stringify(charged) + ' · refund ' + JSON.stringify(Bld.cancelRefund(site)));
    // …and a site raised before the price was ever recorded still refunds
    delete site.paid;
    ck('andAnOlderSaveStillRefunds', Object.keys(Bld.cancelRefund(site)).length > 0,
      'falls back to the level price');
    Bld.cancelBuild(site);
  }

  // ================= 3. A FREE SITE HANDS BACK NOTHING =================
  {
    fresh('cx3');
    const at = spot('house');
    const site = Bld.place('P', 'house', at.x, at.y, { free: true });
    const before = snapRes();
    Bld.cancelBuild(site);
    ck('aFreeSiteMintsNothing', same(before, snapRes()),
      'net ' + JSON.stringify(diff(before, snapRes())));
  }

  // ================= 4. AN UPGRADE CALLED OFF =================
  {
    fresh('cx4');
    S.res.food = 4000; S.res.wood = 4000; S.res.stone = 4000; S.res.gold = 4000;
    tc().level = 2;              // a station only upgrades under a taller hall
    const at = freeSpot('farm');
    const farm = Bld.place('P', 'farm', at.x, at.y, { free: true, instant: true, noAutoAssign: true });
    Bld.finish(farm);
    // station its own crew, the hands an upgrade pulls onto the scaffold
    const worker = S.units.find(u => u.owner === 'P' && Units.isVillager(u) && !u.task);
    if (worker) worker.task = { type: 'work', id: farm.id };

    const lvl = farm.level, hp = farm.hp;
    const before = snapRes();
    ck('theUpgradeStarts', Bld.upgrade(farm) === true, '');
    const charged = diff(snapRes(), before);
    ck('andIsCallableOff', Bld.cancelWork(farm) === 'upgrade', '');
    ck('itsRefundIsTheUpgradePrice', same(charged, Bld.cancelRefund(farm)),
      'paid ' + JSON.stringify(charged));

    const onScaffold = S.units.filter(u => u.task && u.task.type === 'build' && u.task.id === farm.id);
    ck('cancellingTheUpgradeSucceeds', Bld.cancelBuild(farm) === true, '');
    ck('theBuildingStaysStanding', !!Bld.get(farm.id) && Bld.at(at.x, at.y) === farm, '');
    ck('atTheLevelItStartedFrom', farm.level === lvl && farm.upgrading === 0,
      'Lv ' + farm.level + (farm.upgrading ? ' still upgrading' : ''));
    ck('undamaged', farm.hp === hp, farm.hp + '/' + farm.maxhp);
    ck('theUpgradesPriceComesBack', same(before, snapRes()),
      'net ' + JSON.stringify(diff(before, snapRes())));
    ck('andItsOwnCrewGoBackToTheSeam',
      !onScaffold.length || onScaffold.every(u => !u.task || u.task.type === 'work'),
      onScaffold.map(u => (u.task && u.task.type) || 'idle').join(','));
  }

  // ================= 5. NOTHING TO CALL OFF =================
  {
    fresh('cx5');
    const t = tc();
    ck('aFinishedBuildingOffersNothing', Bld.cancelWork(t) === null, '');
    ck('norDoesTheRivals', S.buildings.filter(x => x.owner === 'A').every(x => Bld.cancelWork(x) === null), '');
    ck('andCancellingItIsRefused', Bld.cancelBuild(t) === false, '');
  }

  // ================= 6. THE BUTTON, ON BOTH PANELS =================
  {
    fresh('cx6');
    S.res.food = 900; S.res.wood = 900; S.res.stone = 900; S.res.gold = 900;
    const has = () => !!document.querySelector('#panel [data-act="cancelbuild"]');
    const t = tc();
    UI.select('bld', t.id);
    ck('aFinishedBuildingShowsNoButton', !has(), 'the panel stays clean');

    const at = spot('house');
    // nobody is sent: this is the site that is WAITING FOR A BUILDER
    const site = Bld.place('P', 'house', at.x, at.y, { noAutoAssign: true });
    ck('aSiteWithNoBuilderIsStillCallableOff', Bld.cancelWork(site) === 'site' &&
      !S.units.some(u => u.task && u.task.type === 'build' && u.task.id === site.id), '');
    UI.select('bld', site.id);
    ck('andItsPanelShowsTheButton', has(), '');

    // the builder's own panel carries the same one
    const v = Units.nearestIdleVillager(site.x, site.y);
    Units.assignBuild(v, site);
    UI.select('unit', v.id);
    ck('soDoesTheBuildersPanel', has(), '');
    ck('andTheSignatureTracksIt', /\|c\d+:site:/.test(UI.panelSig()), UI.panelSig().split('|').pop());

    // ARMED, then FIRED — the same two taps as demolition
    const tap = () => { const el = document.querySelector('#panel [data-act="cancelbuild"]'); if (el) el.click(); return !!el; };
    ck('theButtonIsTappable', tap(), '');
    ck('oneTapOnlyArmsIt', UI.confirmCancel === site.id && !!Bld.get(site.id), '');
    tap();
    ck('theSecondTapCallsItOff', !Bld.get(site.id) && UI.confirmCancel === 0, '');

    UI.renderPanel();
    ck('andTheButtonIsGoneWithTheWorks', !has(), 'nothing waiting, nothing offered');
    ck('theBuilderIsIdleAgain', !v.task, (v.task && v.task.type) || 'idle');
  }

  return { res, fails };
});
await b.close();
console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL BUILD-CANCEL CHECKS PASS');
console.log('errors:', errs);
if (out.fails.length || errs.length) process.exit(1);
