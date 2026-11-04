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

const out = await p.evaluate(async () => {
  const res = {}, fails = [];
  const nap = ms => new Promise(r => setTimeout(r, ms));
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
    // and it shares Build's row, half and half (operator, 2026-11-04: "we don't
    // need two large buttons for build and cancel")
    { const bb = document.querySelector('#panel [data-act="gobuild"]'), cb = document.querySelector('#panel [data-act="cancelbuild"]');
      const r1 = bb && bb.getBoundingClientRect(), r2 = cb && cb.getBoundingClientRect();
      ck('andSharesBuildsRowHalfAndHalf', !!(r1 && r2) && Math.abs(r1.top - r2.top) < 1 && Math.abs(r1.width - r2.width) < 2 && r2.left > r1.right - 1,
        r1 && r2 ? `build ${Math.round(r1.left)},${Math.round(r1.top)} ${Math.round(r1.width)}w · cancel ${Math.round(r2.left)},${Math.round(r2.top)} ${Math.round(r2.width)}w` : 'a button is missing'); }

    // ARMED, then FIRED — the same two taps as demolition. A quick double-tap
    // is ONE gesture: a tap within the confirm's guard of the arming is
    // ignored and the button stays armed (PX-26). The double-tap's second tap
    // lands in the same task (a wall-clock nap is unreliable on a loaded
    // host; the guard reads the taps' timestamps), and the deliberate second
    // tap waits past the guard (>= 450 ms after the arming)
    const tap = () => { const el = document.querySelector('#panel [data-act="cancelbuild"]'); if (el) el.click(); return !!el; };
    ck('theButtonIsTappable', tap(), '');
    ck('oneTapOnlyArmsIt', UI.confirmCancel === site.id && !!Bld.get(site.id), '');
    tap();
    ck('aQuickDoubleTapDoesNotCallItOff', UI.confirmCancel === site.id && !!Bld.get(site.id), 'the button stays armed');
    await nap(450);
    tap();
    ck('theSecondTapCallsItOff', !Bld.get(site.id) && UI.confirmCancel === 0, '');

    UI.renderPanel();
    ck('andTheButtonIsGoneWithTheWorks', !has(), 'nothing waiting, nothing offered');
    ck('theBuilderIsIdleAgain', !v.task, (v.task && v.task.type) || 'idle');

    // the building panel's other two-tap confirm, Demolish, holds the same
    // line: a double-tap on a finished house leaves it standing and armed;
    // a deliberate second tap takes it down
    const hs = spot('house');
    const house = Bld.place('P', 'house', hs.x, hs.y, { free: true, instant: true });
    if (house.construction > 0) Bld.finish(house);
    UI.select('bld', house.id);
    const demo = () => { const el = document.querySelector('#panel [data-act="demolish"]'); if (el) el.click(); return !!el; };
    const offered = demo();
    demo();
    ck('aDoubleTapOnDemolishLeavesItStanding', offered && !!Bld.get(house.id) && UI.confirmDemolish === house.id,
      offered ? 'standing: ' + !!Bld.get(house.id) : 'no Demolish button');
    await nap(450);
    demo();
    ck('andADeliberateSecondTapTakesItDown', !Bld.get(house.id), '');
  }

  /* ================= 7. THE ORDER'S BUTTON BECOMES ITS CALL-OFF =================
     operator, 2026-11-04 (on the hall's panel: a wide Cancel upgrade row over
     a greyed "Upgrade to Lv 2 — Busy"): "These don't need to be two separate
     buttons. After level upgrade that button becomes cancel. It keeps our
     build UI tight. Roll that out to all buildings for all upgrades, and
     builds." Every works in flight is ONE button in the slot the order came
     from — a building's upgrade, a site, the masons' wall works, a span's
     reinforcing — and that button calls them off. */
  {
    fresh('cx7');
    S.res.food = 9000; S.res.wood = 9000; S.res.stone = 9000; S.res.gold = 9000;
    const q = sel => document.querySelector('#panel ' + sel);
    const n = sel => document.querySelectorAll('#panel ' + sel).length;
    const rect = el => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width }; };
    const sameSlot = (a, z) => !!a && !!z && Math.abs(a.x - z.x) < 1 && Math.abs(a.y - z.y) < 1 && Math.abs(a.w - z.w) < 1;
    const two = async el => { if (!el) return false; el.click(); await nap(450); const again = q('[data-act="' + el.dataset.act + '"]'); if (again) again.click(); };

    // ---- a building's upgrade: the Upgrade button turns into Cancel, in place ----
    tc().level = 2;
    const fs = freeSpot('farm');
    const farm = Bld.place('P', 'farm', fs.x, fs.y, { free: true, instant: true, noAutoAssign: true });
    Bld.finish(farm);
    const v = S.units.find(u => u.owner === 'P' && Units.isVillager(u) && !u.task);
    if (v) v.task = { type: 'work', id: farm.id };
    UI.select('bld', farm.id); UI.renderPanel();
    const upBtn = q('[data-act="upgrade"]'), upAt = upBtn && rect(upBtn);
    ck('anIdleBuildingOffersUpgradeAndNoCancel', !!upBtn && !q('[data-act="cancelbuild"]'), '');
    Bld.upgrade(farm); UI.renderPanel();
    const cb = q('[data-act="cancelbuild"]');
    ck('upgradingTheUpgradeButtonIsGone', !q('[data-act="upgrade"]'), 'no greyed Upgrade beside a Cancel');
    ck('andCancelStandsInItsSlot', n('[data-act="cancelbuild"]') === 1 && sameSlot(upAt, cb && rect(cb)),
      cb ? JSON.stringify([upAt, rect(cb)]) : 'no Cancel');
    ck('itSaysWhatIsRising', !!cb && /Cancel Lv 2/.test(cb.textContent) && /\dd left/.test(cb.textContent), cb ? cb.textContent : '');
    farm.upgrading = farm.upgTotal * 0.25; UI.refreshPanel();
    const bar = cb && cb.querySelector('.cwBar');
    ck('andItsBarIsTheWorkDone', !!bar && bar.style.width === '75%', bar ? bar.style.width : 'no bar');
    ck('theStationOffersNoHandsWhileItsCrewBuilds', !q('[data-act="staff"]'), '');
    // the worker's own panel carries ONE call-off, never two
    const hand = S.units.find(u => u.task && u.task.type === 'build' && u.task.id === farm.id);
    if (hand) { UI.select('unit', hand.id); UI.renderPanel(); }
    ck('theBuildersPanelCarriesOneCancel', !!hand && n('[data-act="cancelbuild"]') === 1, hand ? n('[data-act="cancelbuild"]') + ' buttons' : 'nobody on the scaffold');
    UI.select('bld', farm.id); UI.renderPanel();
    const before = snapRes();
    await two(q('[data-act="cancelbuild"]'));
    UI.renderPanel();
    ck('twoTapsCallItOff', farm.upgrading === 0 && !same(before, snapRes()), '');
    ck('andTheUpgradeButtonComesBackInItsSlot', sameSlot(upAt, q('[data-act="upgrade"]') && rect(q('[data-act="upgrade"]'))), '');

    // ---- the hall: Cancel takes the half slot beside Train Villager ----
    const t = tc(); t.level = 1;
    for (let i = 0; i < 3; i++) { const h = spot('house'); const hb = Bld.place('P', 'house', h.x, h.y, { free: true, instant: true }); if (hb.construction) Bld.finish(hb); }
    UI.select('bld', t.id); UI.renderPanel();
    const tUp = q('[data-act="upgrade"]'), tAt = tUp && rect(tUp);
    Bld.upgrade(t);
    const tv = S.units.find(u => u.owner === 'P' && Units.isVillager(u) && !u.task); if (tv) Units.assignBuild(tv, t);
    UI.renderPanel();
    const tcb = q('[data-act="cancelbuild"]'), tr = q('[data-act="train"]');
    ck('theHallsCancelSharesTrainsRow', !!t.upgrading && sameSlot(tAt, tcb && rect(tcb)) && !!tr && Math.abs(rect(tr).y - rect(tcb).y) < 1,
      tcb && tr ? JSON.stringify([tAt, rect(tcb), rect(tr)]) : 'missing');
    UI.confirmCancel = 0; Bld.cancelBuild(t);

    // ---- a site nobody has reached: Send builder and Cancel share one row ----
    const ss = spot('house');
    const site = Bld.place('P', 'house', ss.x, ss.y, { noAutoAssign: true });
    UI.select('bld', site.id); UI.renderPanel();
    const sw = q('[data-act="sendworker"]'), sc = q('[data-act="cancelbuild"]');
    ck('aSitesSendBuilderAndCancelShareARow', !!sw && !!sc && Math.abs(rect(sw).y - rect(sc).y) < 1 && Math.abs(rect(sw).w - rect(sc).w) < 2,
      sw && sc ? JSON.stringify([rect(sw), rect(sc)]) : 'missing');
    Bld.cancelBuild(site);

    // ---- the masons' wall works: Upgrade walls becomes their call-off ----
    t.level = 2; t.upgrading = 0;
    const ws = spot('wall');
    const wall = Bld.place('P', 'wall', ws.x, ws.y, { free: true, instant: true }); if (wall.construction) Bld.finish(wall);
    UI.select('bld', t.id); UI.renderPanel();
    const uw = q('[data-act="upwalls"]'), uwAt = uw && rect(uw);
    const wBefore = snapRes();
    ck('theWallWorksStart', Bld.upgradeWalls() === true, JSON.stringify(Bld.canUpgradeWalls()));
    const wPaid = diff(snapRes(), wBefore);
    UI.renderPanel();
    const cw = q('[data-act="cancelwalls"]');
    ck('theirButtonBecomesTheCallOff', !q('[data-act="upwalls"]') && sameSlot(uwAt, cw && rect(cw)), cw ? cw.textContent : 'no button');
    ck('andTheirRefundIsWhatTheMasonsWerePaid', same(wPaid, Bld.wallUpRefund(t)), JSON.stringify(wPaid));
    const wl = S.wallLevel || 1;
    await two(q('[data-act="cancelwalls"]'));
    ck('twoTapsCallTheMasonsOff', !(t.wallUp > 0) && (S.wallLevel || 1) === wl && wall.level === wl && same(wBefore, snapRes()),
      'net ' + JSON.stringify(diff(wBefore, snapRes())));
    UI.renderPanel();
    ck('andTheHallIsFreeAgain', !!q('[data-act="upwalls"]') && !/Reinforcing walls/.test(Bld.canUpgrade(t).why || ''), '');

    // ---- a span's reinforcing: Reinforce becomes its call-off; the sapper lets go ----
    // a clear 7x7 patch away from the town, a channel down its middle
    let bx = 0, by = 0;
    for (const [ox, oy] of [[9, 0], [-9, 0], [0, 9], [0, -9], [9, 9], [-9, -9], [12, 0], [-12, 0]]) {
      const cx = t.x + ox, cy = t.y + oy; let ok = true;
      for (let y = cy - 3; y <= cy + 3 && ok; y++) for (let x = cx - 3; x <= cx + 3; x++)
        if (!MapGen.onBoard(x, y) || Bld.at(x, y)) { ok = false; break; }
      if (ok) { bx = cx; by = cy; break; }
    }
    for (let y = by - 3; y <= by + 3; y++) for (let x = bx - 3; x <= bx + 3; x++) {
      if (!MapGen.inB(x, y)) continue;
      const i = MapGen.idx(x, y); S.map.terrain[i] = T.GRASS; S.map.seenTerrain[i] = T.GRASS; S.map.explored[i] = 1;
    }
    for (let y = by - 3; y <= by + 3; y++) S.map.terrain[MapGen.idx(bx, y)] = T.WATER;
    Bld._block = null;
    const camp = Bld.place('P', 'sapper', t.x - 4, t.y + 3, { free: true, instant: true }); if (camp && camp.construction) Bld.finish(camp); if (camp) camp.level = 3;
    Bld.buildBridge('P', bx, by);
    const br = Bld.bridgeAt(bx, by);
    UI.selectBridge(bx, by);
    const bu = q('[data-act="brup"]'), buAt = bu && rect(bu);
    const bBefore = snapRes();
    ck('theSpanWorksStart', !!br && Bld.orderBridgeUpgrade(br) === true, br ? '' : 'no bridge at ' + bx + ',' + by);
    if (br) {
    const sap = Units.spawn('sapper', 'P', bx - 2, by); Units.assignTerraform(sap, bx, by, 'bridgeup');
    UI.renderPanel();
    const bc = q('[data-act="brcancel"]');
    ck('reinforceBecomesTheCallOff', !q('[data-act="brup"]') && sameSlot(buAt, bc && rect(bc)), bc ? bc.textContent : 'no button');
    await two(q('[data-act="brcancel"]'));
    for (let i = 0; i < 5; i++) Units.update(0.1);
    ck('twoTapsCallTheSpanOff', !(br.upgrading > 0) && (br.level || 1) === 1 && same(bBefore, snapRes()),
      'net ' + JSON.stringify(diff(bBefore, snapRes())));
    ck('andTheSapperLetsGo', !(sap.task && sap.task.job === 'bridgeup'), sap.task ? JSON.stringify(sap.task) : 'idle');
    }
  }

  /* ================= 8. TWO TO A ROW, NEVER A LONG BUTTON =================
     operator, 2026-11-04, on a Barracks Lv 2 panel (a full-width Upgrade,
     Defender | Axeman, a full-width Champion): "we never want full length
     buttons. Let's keep upgrade top left button, first defender to the right
     on the same row, and then the other two soldier buttons on the row below
     that… two buttons per row, ideally not one long button, unless there is
     only 1 button… as tight as possible." Measured on the phone (430px):
     every action is half a row, an odd one stays half, a panel with ONE
     action lets it fill the row, and the yard's tool row comes after every
     action. The armed red plank (UI.killPlank) is the one exception. */
  {
    fresh('cx8');
    S.res.food = 9000; S.res.wood = 9000; S.res.stone = 9000; S.res.gold = 9000;
    const t = tc(); t.level = 2;
    const look = () => {
      const pa = document.querySelector('#panel .pactions');
      if (!pa) return null;
      const cs = getComputedStyle(pa), W = pa.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const bt = [...pa.querySelectorAll(':scope > .abtn:not(.pkillok)')].map(e => {
        const r = e.getBoundingClientRect();
        return { act: e.dataset.act + (e.dataset.unit ? ':' + e.dataset.unit : ''), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width) };
      });
      const tools = pa.querySelector(':scope > .ptools');
      return { W, bt, rows: new Set(bt.map(o => o.y)).size, long: bt.filter(o => o.w > W * 0.6).map(o => o.act),
        toolsY: tools ? Math.round(tools.getBoundingClientRect().top) : null };
    };
    const tight = (name, g) => {
      const ok = !!g && g.bt.length > 0 && (g.bt.length === 1 ? g.bt[0].w >= g.W - 2 : g.long.length === 0) &&
        g.rows === Math.ceil(g.bt.length / 2) && (g.toolsY == null || g.bt.every(o => o.y < g.toolsY));
      ck(name, ok, g ? `${g.bt.length} buttons in ${g.rows} row(s) of ${Math.round(g.W)}px; long: ${g.long.join(',') || 'none'}; ` +
        g.bt.map(o => `${o.act}@${o.x},${o.y} ${o.w}w`).join(' · ') : 'no panel');
    };
    const show = (kind, id) => { UI.confirmCancel = 0; UI.confirmDemolish = 0; UI.select(kind, id); UI.renderPanel(); return look(); };

    // the operator's own case: Upgrade | Defender, then Axeman | Champion
    const bs = spot('barracks');
    const bk = Bld.place('P', 'barracks', bs.x, bs.y, { free: true, instant: true }); if (bk.construction) Bld.finish(bk);
    bk.level = 2;
    const g = show('bld', bk.id);
    tight('theBarracksIsTwoRowsOfTwo', g);
    const [a1, a2, a3, a4] = g ? g.bt : [];
    ck('upgradeTopLeftAndTheFirstSoldierBesideIt', !!a2 && a1.act === 'upgrade' && /^train:/.test(a2.act) && a1.y === a2.y && a1.x < a2.x &&
      !!a4 && /^train:/.test(a3.act) && /^train:/.test(a4.act) && a3.y === a4.y && a3.y > a1.y, g ? g.bt.map(o => o.act).join(' ') : '');

    // the hall: Upgrade, Train, Back to work, the wall works — and the tools last
    const ws = spot('wall');
    const wall = Bld.place('P', 'wall', ws.x, ws.y, { free: true, instant: true }); if (wall.construction) Bld.finish(wall);
    S.garrison.push({ hp: 40, maxhp: 40, post: null });   // one hand sheltered: Back to work shows
    tight('theHallPacksTwoToARowAndItsToolsComeLast', show('bld', t.id));
    S.garrison.length = 0;

    // a station: Station worker | Upgrade
    const fs = freeSpot('farm');
    const farm = Bld.place('P', 'farm', fs.x, fs.y, { free: true, instant: true, noAutoAssign: true }); Bld.finish(farm);
    tight('aStationsHandsAndUpgradeShareARow', show('bld', farm.id));
    // a hand on it: Build | Upgrade farm (and Group, if there is company)
    const hand = S.units.find(u => u.owner === 'P' && Units.isVillager(u) && !u.task);
    if (hand) hand.task = { type: 'work', id: farm.id };
    if (hand) tight('itsHandsPanelPacksTwoToARow', show('unit', hand.id));
    // the upgrade under way with nobody on it: Send builder | Cancel, and an
    // ARMED Cancel keeps its half slot (it used to take the whole row)
    Bld.upgrade(farm); if (hand) hand.task = null;
    for (const u of S.units) if (u.task && u.task.id === farm.id) u.task = null;
    const g0 = show('bld', farm.id), c0 = g0.bt.find(o => o.act === 'cancelbuild');
    document.querySelector('#panel [data-act="cancelbuild"]').click();
    const g1 = look(), c1 = g1.bt.find(o => o.act === 'cancelbuild');
    ck('anArmedCancelKeepsItsHalfSlot', !!c0 && !!c1 && c1.x === c0.x && c1.y === c0.y && c1.w === c0.w && c1.w < g1.W * 0.6 &&
      !!document.querySelector('#panel .abtn.danger[data-act="cancelbuild"]'), JSON.stringify([c0, c1]));
    UI.confirmCancel = 0; Bld.cancelBuild(farm);

    // a lone action fills its row: the wall's Build Gate
    tight('aLoneActionFillsItsRow', show('bld', wall.id));

    // the trading post: three ways to pay and the way back, two rows of two
    const ts = freeSpot('trade');
    const tp = ts && Bld.place('P', 'trade', ts.x, ts.y, { free: true, instant: true });
    if (tp) { if (tp.construction) Bld.finish(tp); UI.tradeNeed = null; tight('theTradingPostsFourGoodsAreTwoRows', show('bld', tp.id));
      UI.select('bld', tp.id); UI.tradeNeed = 'wood'; UI.renderPanel(); tight('andItsWaysToPayAreTwoRows', look()); UI.tradeNeed = null; }
    else ck('theTradingPostsFourGoodsAreTwoRows', false, 'no ground for a post');
  }

  return { res, fails };
});
await b.close();
console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL BUILD-CANCEL CHECKS PASS');
console.log('errors:', errs);
if (out.fails.length || errs.length) process.exit(1);
