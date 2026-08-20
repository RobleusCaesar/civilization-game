/* ARMY-GROUPS CONTRACT — dense war-party formations, and up to three saved
   armies recalled from the right-rail banner buttons.

   The two features this file pins:

   · DENSE RANKS — a formation move packs TWO units of the same kind onto a
     tile (melee front, ranged behind, kinds never mixed on a tile), so a war
     party lands as a tight block instead of sprawling over half the field.

   · SAVED ARMIES — from the group panel, Save banks the selection to the
     lowest free banner of three (1 taken → the next save IS Army 2); Remove
     frees a banner without renumbering the others (remove 2 of {1,2,3} and
     Army 3 stays Army 3 — the NEXT save takes 2); a banner whose last
     soldier falls vanishes on its own; tapping a banner jumps the view to
     the army and selects it, ready for orders; armies ride along in the
     save file. One banner per soldier — saving units into a new army pulls
     them out of any old one.

   · THE PANEL SHOWS ONLY WHAT CAN ACT (section 8) — Halt/Stop render only
     while UI.unitBusy says there is anything to stop, Unload only with
     someone aboard, Group only with somebody in reach; the bottom-bar toggle
     has one label authority and its closed states name what they restore.

   Run this after touching any of:
     units.js — formationMove / groupMove
     ui.js — armyAlive/pruneArmies/armyOf/nextArmySlot/saveArmy/removeArmy/
             selectArmy/armyIsNaval/drawShip/drawHelmet/drawArmyIcon/
             renderArmyBar/tickArmies, the group panel buttons, unitBusy/
             groupmatesNear/panelSig, syncBottomToggle/setMenuCollapsed
     render.js — onScreen
     game.js — S.armies init in newGame, the loadJSON armies migration
     index.html — #armyBar

     node tests/army-groups.mjs      # exits non-zero on any regression

   If a feature genuinely needs different behaviour, update this file in the
   same commit and say so in the commit message. */
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
  const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };

  const setup = (seed) => {
    G.newGame(seed, 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    const tc = Bld.tcOf('P');
    tc.x = 20; tc.y = 25; Bld._block = null;
    for (let dy = -10; dy <= 10; dy++) for (let dx = -8; dx <= 16; dx++) {
      const x = tc.x + dx, y = tc.y + dy;
      if (MapGen.inB(x, y)) S.map.terrain[MapGen.idx(x, y)] = T.GRASS;
    }
    S.units = [];
    UI.deselect();
    return tc;
  };
  const run = (secs, pred) => {
    let t = 0; const dt = 0.1;
    while (t < secs && !(pred && pred())) { Units.update(dt); Combat.update(dt); t += dt; }
    return +t.toFixed(1);
  };
  const mk = (kind, x, y) => Units.spawn(kind, 'P', x, y);
  const settled = (units) => units.every(u => !Units.moving(u));

  // ---- 1. DENSE RANKS: eight blades land on at most four tiles ----
  {
    const tc = setup('ag1');
    const party = [];
    for (let i = 0; i < 8; i++) party.push(mk('defender', tc.x + (i % 3), tc.y + (i / 3 | 0)));
    Units.groupMove(party.map(u => u.id), tc.x + 10, tc.y);
    const t = run(30, () => settled(party));
    const tiles = new Set(party.map(u => (u.x | 0) + ',' + (u.y | 0)));
    const spread = Math.max(...party.map(u => Math.hypot(u.x - (tc.x + 10.5), u.y - (tc.y + 0.5))));
    ck('eightBladesFourTiles', tiles.size <= 4, `after ${t}s: ${tiles.size} tiles for 8 units`);
    ck('formationStaysTight', spread <= 2.6, `furthest ${spread.toFixed(1)} tiles from the target`);
  }

  // ---- 2. mixed party: pairs are same-KIND only, never two kinds on a tile ----
  {
    const tc = setup('ag2');
    const party = [];
    for (let i = 0; i < 4; i++) party.push(mk('defender', tc.x + i, tc.y));
    for (let i = 0; i < 4; i++) party.push(mk('archer', tc.x + i, tc.y + 1));
    Units.groupMove(party.map(u => u.id), tc.x + 10, tc.y);
    const t = run(30, () => settled(party));
    const kindsAt = {};
    for (const u of party) {
      const k = (u.x | 0) + ',' + (u.y | 0);
      (kindsAt[k] = kindsAt[k] || new Set()).add(u.kind);
    }
    const mixed = Object.values(kindsAt).filter(s2 => s2.size > 1).length;
    ck('tilesNeverMixKinds', mixed === 0 && Object.keys(kindsAt).length <= 4,
      `after ${t}s: ${Object.keys(kindsAt).length} tiles, ${mixed} mixed`);
  }

  // ---- 3. save order: lowest free banner, 1 then 2; numbers survive a removal ----
  {
    const tc = setup('ag3');
    const g1 = [mk('defender', tc.x + 2, tc.y), mk('defender', tc.x + 3, tc.y)];
    const g2 = [mk('archer', tc.x + 5, tc.y), mk('archer', tc.x + 6, tc.y)];
    const g3 = [mk('rider', tc.x + 8, tc.y), mk('rider', tc.x + 9, tc.y)];
    const n1 = UI.saveArmy(g1.map(u => u.id));
    const n2 = UI.saveArmy(g2.map(u => u.id));
    const n3 = UI.saveArmy(g3.map(u => u.id));
    ck('saveTakesLowestFreeSlot', n1 === 1 && n2 === 2 && n3 === 3, `${n1},${n2},${n3}`);
    const g4 = [mk('defender', tc.x + 2, tc.y + 3)];
    ck('fourthArmyRefused', UI.saveArmy(g4.map(u => u.id)) === 0, 'all banners taken');
    UI.removeArmy(2);
    ck('removeKeepsOtherNumbers', !S.armies[2] && !!S.armies[1] && !!S.armies[3],
      'armies present: ' + Object.keys(S.armies).join(','));
    const n4 = UI.saveArmy(g4.map(u => u.id));
    ck('nextSaveFillsTheGap', n4 === 2, `saved as ${n4}`);
    // the banner bar mirrors the roster
    const btns = [...document.querySelectorAll('#armyBar button')].map(b2 => b2.dataset.army);
    ck('bannerBarMirrorsRoster', btns.join(',') === '1,2,3', `buttons: ${btns.join(',')}`);
  }

  // ---- 4. a banner whose last soldier falls vanishes on its own ----
  {
    const tc = setup('ag4');
    const g1 = [mk('defender', tc.x + 2, tc.y), mk('defender', tc.x + 3, tc.y)];
    const g2 = [mk('archer', tc.x + 5, tc.y)];
    UI.saveArmy(g1.map(u => u.id));
    UI.saveArmy(g2.map(u => u.id));
    for (const u of g1) { u.hp = 0; }
    S.units = S.units.filter(u => u.hp > 0);
    UI.tickArmies();
    const btns = [...document.querySelectorAll('#armyBar button')].map(b2 => b2.dataset.army);
    ck('deadArmyLosesItsBanner', !S.armies[1] && !!S.armies[2] && btns.join(',') === '2',
      `armies: ${Object.keys(S.armies).join(',')} buttons: ${btns.join(',')}`);
  }

  /* ---- 4b. THE LAST OF AN ARMY still lets you strike the banner ----
     A war party ground down to one soldier keeps its number — but a
     one-member group renders as the UNIT panel, which had no army button on
     it at all, so tapping the banner gave you a panel with no way to free
     the number. The unit panel now carries Remove when that soldier IS the
     whole of a saved army — and pointedly NOT when it is merely one member
     of a larger one, where disbanding the lot from one man's panel would be
     a surprise. */
  {
    const tc = setup('ag4b');
    const party = [mk('defender', tc.x + 2, tc.y), mk('defender', tc.x + 3, tc.y)];
    UI.saveArmy(party.map(u => u.id));
    const btn = () => document.querySelector('#panel [data-act="armyremove"]');
    // one member of a two-strong army: no button
    UI.select('unit', party[0].id); UI.renderPanel();
    ck('noBannerButtonForOneOfMany', !btn() && UI.armyOfUnit(party[0]) === 0, '');
    // …now the other one falls
    party[1].hp = 0;
    S.units = S.units.filter(u => u.hp > 0);
    UI.pruneArmies();
    ck('theBannerSurvivesItsLastMan', !!S.armies[1] && UI.armyAlive(1).length === 1, '');
    UI.selectArmy(1);
    ck('aLoneSurvivorSelectsAsAUnit', UI.sel && UI.sel.type === 'unit', UI.sel && UI.sel.type);
    ck('andTheUnitPanelOffersRemove', !!btn() && /Remove Army 1/.test(btn().textContent),
      btn() ? btn().textContent : 'no button');
    // the signature has to carry it, or the button never appears in place
    const sigBefore = UI.panelSig();
    btn().click();
    ck('theBannerIsFreed', !S.armies[1] &&
      [...document.querySelectorAll('#armyBar button')].length === 0, '');
    ck('andTheButtonGoesWithIt', !btn() && sigBefore !== UI.panelSig(), '');
    // the freed number is available again
    ck('theNumberComesBack', UI.nextArmySlot() === 1, String(UI.nextArmySlot()));
  }

  // ---- 5. tapping a banner jumps the view to the army and selects it ----
  {
    const tc = setup('ag5');
    const far = [mk('defender', tc.x + 14, tc.y + 8), mk('defender', tc.x + 15, tc.y + 8)];
    UI.saveArmy(far.map(u => u.id));
    R.centerOn(3, 3);   // look away first
    UI.selectArmy(1);
    const cx = (far[0].x + far[1].x) / 2, cy = (far[0].y + far[1].y) / 2;
    const viewL = R.cam.x / CFG.TILE, viewR2 = (R.cam.x + R.viewW() / R.cam.z) / CFG.TILE;
    const viewT = R.cam.y / CFG.TILE, viewB = (R.cam.y + R.viewH() / R.cam.z) / CFG.TILE;
    const inView = cx > viewL && cx < viewR2 && cy > viewT && cy < viewB;
    ck('bannerJumpsTheView', inView, `army at ${cx.toFixed(0)},${cy.toFixed(0)} view x ${viewL.toFixed(0)}..${viewR2.toFixed(0)} y ${viewT.toFixed(0)}..${viewB.toFixed(0)}`);
    ck('bannerSelectsTheArmy', UI.sel && UI.sel.type === 'group' &&
      UI.sel.ids.length === 2 && UI.sel.ids.every(id => far.some(u => u.id === id)), '');
    /* …but it only HAULS the camera when the army is nowhere to be seen. The
       view is on them now: tapping the banner again must not move it, or the
       player loses their place for nothing. */
    const held = { x: R.cam.x, y: R.cam.y };
    UI.selectArmy(1);
    ck('bannerLeavesAViewThatAlreadySeesTheArmy',
      R.cam.x === held.x && R.cam.y === held.y, 'camera held still');
    // even one soldier half off the edge counts as seen
    R.centerOn(cx - R.viewW() / R.cam.z / CFG.TILE / 2 + 0.4, cy);
    const edge = { x: R.cam.x, y: R.cam.y };
    ck('theArmyIsOnScreenAtTheEdge', R.onScreen(far[0].x, far[0].y), 'sprite box overlaps the view');
    UI.selectArmy(1);
    ck('bannerLeavesAnArmyHalfOffTheEdge',
      R.cam.x === edge.x && R.cam.y === edge.y, 'still no jump');
    // and a soldier hidden behind the build menu is NOT on screen
    const savedBottom = R.bottomReserve;
    R.bottomReserve = R.viewH() * 0.9;
    ck('theHudDoesNotCountAsVisible', !R.onScreen(far[0].x, far[0].y + 6), 'behind the menu is out of sight');
    R.bottomReserve = savedBottom;
  }

  // ---- 5b. a fleet flies a SHIP on its banner, an army flies the helmet ----
  {
    const tc = setup('ag5b');
    const boats = [mk('fireship', tc.x + 2, tc.y + 2), mk('fireship', tc.x + 3, tc.y + 2)];   // the warship retired; fireship is the fighting hull
    const foot = [mk('defender', tc.x + 5, tc.y), mk('archer', tc.x + 6, tc.y)];
    const nf = UI.saveArmy(boats.map(u => u.id));
    const na = UI.saveArmy(foot.map(u => u.id));
    ck('aFleetKnowsItFloats', UI.armyIsNaval(nf) === true && UI.armyIsNaval(na) === false,
      `fleet ${nf} naval, army ${na} not`);
    // a lone scout tagging along does not turn a fleet back into an army
    const mixed = [boats[0].id, boats[1].id, foot[0].id];
    UI.removeArmy(nf);
    const nm = UI.saveArmy(mixed);
    ck('mostOfItAfloatIsStillAFleet', UI.armyIsNaval(nm) === true, '2 hulls to 1 pair of boots');
    // the art itself: the ship is drawn, and it is not the helmet
    const draw = (art) => {
      const c = document.createElement('canvas'); c.width = c.height = 34;
      const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
      (art === 'ship' ? UI.drawShip : UI.drawHelmet).call(UI, g, 6, 3);
      return c.toDataURL();
    };
    ck('theShipIsItsOwnDrawing', draw('ship') !== draw('helm'), '');
    ck('theShipFitsTheHelmetsFootprint',
      UI.ARMY_SHIP.length === UI.ARMY_HELM.length &&
      UI.ARMY_SHIP.every(r => r.length === UI.ARMY_HELM[0].length),
      UI.ARMY_SHIP[0].length + 'x' + UI.ARMY_SHIP.length);
    ck('everyShipPixelHasAColour',
      UI.ARMY_SHIP.every(r => [...r].every(c => c === '.' || UI.ARMY_SHIP_COL[c])), '');
    // and the banner the fleet actually renders differs from an army's
    const icon = (n) => {
      const c = document.createElement('canvas'); c.width = c.height = 34;
      UI.drawArmyIcon(c.getContext('2d'), n);
      return c.toDataURL();
    };
    ck('theRailTellsThemApart', icon(nm) !== icon(na), 'fleet banner vs army banner');
  }

  // ---- 6. the group panel offers Save (next slot named), then Remove ----
  {
    const tc = setup('ag6');
    const party = [mk('defender', tc.x + 2, tc.y), mk('archer', tc.x + 3, tc.y)];
    UI.sel = { type: 'group', ids: party.map(u => u.id) };
    UI.renderPanel();
    const saveBtn = document.querySelector('#panel [data-act="garmysave"]');
    ck('panelOffersSave', !!saveBtn && /Army 1/.test(saveBtn.textContent), saveBtn ? saveBtn.textContent.trim() : 'missing');
    UI.saveArmy(UI.sel.ids);
    const removeBtn = document.querySelector('#panel [data-act="garmyremove"]');
    ck('panelOffersRemoveOnceSaved', !!removeBtn && /Army 1/.test(removeBtn.textContent), removeBtn ? removeBtn.textContent.trim() : 'missing');
  }

  // ---- 7. armies ride along in the save file ----
  {
    const tc = setup('ag7');
    const party = [mk('defender', tc.x + 2, tc.y), mk('defender', tc.x + 3, tc.y)];
    UI.saveArmy(party.map(u => u.id));
    const ids = S.armies[1].slice();
    const json = G.saveJSON();
    G.loadJSON(json);
    ck('armiesSurviveSaveLoad', !!S.armies && !!S.armies[1] && JSON.stringify(S.armies[1]) === JSON.stringify(ids),
      'army 1: ' + JSON.stringify(S.armies && S.armies[1]));
  }

  /* ---- 8. THE PANEL SHOWS ONLY WHAT CAN ACT ----
     A button whose only possible answer is "nothing to do" is clutter, not
     control (a playtest had a war party's six buttons plus the open map
     covering two thirds of the board). One predicate, UI.unitBusy, decides
     Halt/Stop for groups and single units alike; Unload renders only with
     someone aboard; Group only with somebody in reach to band with. Hiding is
     NOT a silent failure (the tap contract's rule 4): absence of an
     impossible order is the panel telling the truth. All of these move
     without a tap, so all of them live in panelSig — the buttons must
     appear/vanish through the ordinary refresh. The doctrines' Tactics
     expander is pinned in tests/army-strategies.mjs. */
  {
    const tc = setup('ag8');
    const far = { x: tc.x + 14, y: tc.y + 8 };   // out past every defend bound
    const q = s => document.querySelector('#panel ' + s);
    const a1 = mk('defender', far.x, far.y), a2 = mk('archer', far.x + 1, far.y);
    UI.sel = { type: 'group', ids: [a1.id, a2.id] };
    UI.renderPanel();
    const sig0 = UI.panelSig();
    ck('anIdlePartyOffersNoHalt', !q('[data-act="stop"]'), '');
    for (const u of [a1, a2]) Units.moveTo(u, far.x + 5, far.y + 5);
    ck('theMarchIsInTheSignature', UI.panelSig() !== sig0, 'sig must move or the button never appears');
    UI.renderPanel();
    ck('haltAppearsOnTheMarch', !!q('[data-act="stop"]'), '');
    q('[data-act="stop"]').click();
    ck('haltStopsEverythingAndGoes', !q('[data-act="stop"]') &&
      [a1, a2].every(u => !u.task && !u.path && !u.strat && !u.assault), '');
    // a doctrine alone is something to stop — and Halt clears it (the
    // army-strategies rule "Halt and Defend clear it")
    a1.strat = 'chaos'; a2.strat = 'chaos';
    UI.renderPanel();
    ck('aDoctrineAloneIsBusy', !!q('[data-act="stop"]'), '');
    q('[data-act="stop"]').click();
    ck('haltClearsTheDoctrine', !a1.strat && !q('[data-act="stop"]'), '');

    // single unit: same predicate, same behaviour
    S.units = S.units.filter(u => u.id !== a2.id);
    UI.select('unit', a1.id);
    ck('anIdleSoldierOffersNoStop', !q('[data-act="stop"]'), '');
    ck('aLoneSoldierOffersNoGroup', !q('[data-act="group"]'), '');
    Units.moveTo(a1, far.x + 6, far.y);
    UI.renderPanel();
    ck('stopAppearsOnTheOrder', !!q('[data-act="stop"]'), '');
    q('[data-act="stop"]').click();
    ck('stopClearsAndGoes', !a1.task && !a1.path && !q('[data-act="stop"]'), '');
    a1.strat = 'strike';
    UI.renderPanel();
    q('[data-act="stop"]').click();
    ck('singleStopClearsTheDoctrineToo', !a1.strat && !a1.siegePost, '');
    const mate = mk('defender', far.x + 1, far.y);
    UI.renderPanel();
    ck('groupAppearsWithAMateInReach', !!q('[data-act="group"]'), '');

    // transports: Unload renders only with someone aboard; the hull's
    // capacity rides in the hint line instead of a dead button
    const tr = Units.spawn('transport', 'P', far.x + 3, far.y + 3);
    UI.select('unit', tr.id);
    ck('anEmptyHullOffersNoUnload', !q('[data-act="unload"]'), '');
    ck('theHintCarriesTheCapacity',
      new RegExp('carries ' + CFG.UNITS.transport.cap).test(document.getElementById('panel').textContent), '');
    tr.cargo = [{ kind: 'defender' }, { kind: 'archer' }];
    UI.renderPanel();
    ck('aLadenHullUnloads', !!q('[data-act="unload"]') && /2\//.test(q('[data-act="unload"]').textContent), '');

    /* the bottom-bar toggle tells the truth: ONE label authority
       (syncBottomToggle — setMenuCollapsed defers to it), closed states NAME
       what tapping brings back, and a selection's tab is a panel minimize for
       EVERY selection — the old villager exemption relabeled the tab
       "🔨 Build" over a panel it would actually restore. */
    const tog = () => document.getElementById('bmToggle').textContent;
    UI.deselect(); UI.setMenuCollapsed(false);
    ck('openMenuSaysHide', tog() === '▾ Hide', tog());
    UI.setMenuCollapsed(true);
    ck('closedMenuSaysBuild', /Build/.test(tog()), tog());
    UI.select('unit', a1.id);
    document.getElementById('bmToggle').click();
    ck('aTuckedPanelSaysPanel', tog() === '▴ Panel' &&
      !document.getElementById('panel').classList.contains('show'), tog());
    document.getElementById('bmToggle').click();
    ck('theTapRestoresThePanelItNamed', tog() === '▾ Hide' &&
      document.getElementById('panel').classList.contains('show'), tog());
    UI.deselect();
  }

  return { res, fails };
});
console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL ARMY-GROUPS CHECKS PASS');
console.log('errors:', errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e)));
await b.close();
process.exit(out.fails.length ? 1 : 0);
