/* THE PARTY HEALS AT ONE TAP (UI.healPlan / groupHeal / healBtn / sendHome /
   tickHealTrips — operator, build 222: "if you have a group of soldiers and
   anyone in that group has damage, when they're within the TC limit, add a
   Heart button next to the 'i' button, when you click it, you heal the group.
   If you don't have enough to heal the group … the game decides what units to
   heal (prioritize most expensive / higher level units first) … Whatever we
   decide we need to implement for the navy too … Maybe we should pilot that").

   1. a hurt party wears a heart beside the ℹ; a whole party does not
   2. a tap mends everyone in the healing ground, paid, made veterans, said once
   3. short of food: the dearest heals first, each the larder still covers
   4. no food: the heart is grey, a tap changes nothing and says why
   5. every one resting (the heal limit): grey, "let them rest"
   6. the PILOT: a hurt one beyond the ground walks home, the healthy hold, and
      he is mended the moment he stands where the land mends — and stays there
   7. another order calls the walk off: nothing is paid
   8. a fleet: hulls mend at a dock, the same heart
   9. the heart comes and goes without a tap (the panel's signature)
  10. it sits in the header beside the ℹ, clear of the title, at a phone's width

     node tests/group-heal.mjs      # exits non-zero on any regression */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_FILE_NOT_FOUND')) errs.push('console: ' + m.text()); });
await p.goto('file://' + root + '/index.html', { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => typeof G !== 'undefined' && typeof UI !== 'undefined' && typeof Units !== 'undefined', null, { timeout: 30000 });
await p.waitForTimeout(600);

const out = await p.evaluate(() => {
  const res = {}, fails = [];
  const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };
  const toasts = [];
  const origToast = UI.toast.bind(UI);
  UI.toast = (msg, warn) => { toasts.push({ msg: String(msg), warn }); };

  const setup = seed => {
    G.newGame(seed, 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    S.res = { food: 99999, wood: 99999, stone: 99999, gold: 99999 };
    UI._healLog = {};
    return Bld.tcOf('P');
  };
  // soldiers on open ground inside the hall's ring (r 5 at level 1)
  const ringSpots = tc => {
    const z = { x: Bld.cx(tc), y: Bld.cy(tc), r: Bld.tcRadius(tc) }, out = [];
    for (let y = tc.y - 5; y <= tc.y + 6; y++) for (let x = tc.x - 5; x <= tc.x + 6; x++)
      if (Path.passable(x, y, 'P', 'land') && !Bld.at(x, y) && Math.hypot(x + 0.5 - z.x, y + 0.5 - z.y) <= z.r - 1) out.push({ x, y });
    return out;
  };
  const party = (tc, kinds) => {
    const spots = ringSpots(tc);
    return kinds.map((k, i) => { const s = spots[i * 2 % spots.length]; return Units.spawn(k, 'P', s.x + 0.5, s.y + 0.5); });
  };
  const selectParty = list => { UI.sel = { type: 'group', ids: list.map(u => u.id) }; UI.renderPanel(); };
  const heart = () => document.querySelector('#panel [data-act="gheal"]');

  // ---- 1. a hurt party wears the heart beside the ℹ; a whole one does not ----
  {
    const tc = setup('gh1');
    const ps = party(tc, ['defender', 'defender', 'archer']);
    selectParty(ps);
    ck('aWholePartyWearsNoHeart', !heart(), heart() ? heart().outerHTML.slice(0, 80) : 'none');
    ps[1].hp = 10;
    selectParty(ps);
    const h = heart(), info = document.querySelector('#panel #helpToggle');
    ck('aHurtPartyWearsTheHeart', !!h && !h.classList.contains('cant'), h ? h.className + ' · ' + h.title : 'none');
    ck('beforeTheInfo', !!h && !!info && h.nextElementSibling === info && h.getBoundingClientRect().right <= info.getBoundingClientRect().left + 1,
      h && info ? `${h.getBoundingClientRect().right} vs ${info.getBoundingClientRect().left}` : 'missing');
  }

  // ---- 2. one tap mends everyone in the ground, pays, makes veterans ----
  {
    const tc = setup('gh2');
    const ps = party(tc, ['defender', 'axeman', 'archer', 'defender']);
    for (const u of ps) u.hp = Math.round(u.maxhp * 0.3);
    const want = ps.reduce((s, u) => s + UI.healCost(u), 0), f0 = S.res.food;
    selectParty(ps);
    toasts.length = 0;
    heart().click();
    ck('everyOneIsMended', ps.every(u => u.hp === u.maxhp), ps.map(u => u.hp + '/' + u.maxhp).join(' '));
    ck('paidOnceEach', f0 - S.res.food === want, `paid ${f0 - S.res.food}, want ${want}`);
    ck('andTheyComeBackVeterans', ps.every(u => Units.isVeteran(u)), ps.map(u => Units.isVeteran(u)).join(','));
    ck('eachCountsAgainstTheLimit', ps.every(u => UI.healLog(u).length === 1), '');
    // the heal is said once, the veterans once (a note), never a line a soldier
    ck('saidOnce', toasts.filter(t => !t.warn).length === 1 && /^Heal 4 for/.test(toasts.find(t => !t.warn).msg) && toasts.length === 2, JSON.stringify(toasts));
    ck('theHeartGoesWithTheHurt', !heart(), heart() ? 'still there' : 'gone');
  }

  // ---- 3. short of food: the dearest first, each the larder covers ----
  {
    const tc = setup('gh3');
    const [el, d1, d2] = party(tc, ['elite', 'defender', 'defender']);
    for (const u of [el, d1, d2]) u.hp = 1;
    const ce = UI.healCost(el), cd = UI.healCost(d1);
    S.res.food = ce + cd + 5;   // the elite and one defender, not both defenders
    selectParty([d1, d2, el]);
    heart().click();
    const healed = [el, d1, d2].filter(u => u.hp === u.maxhp).length;
    ck('theDearestHealsFirst', el.hp === el.maxhp, `elite ${el.hp}/${el.maxhp}`);
    ck('thenWhatTheLarderCovers', healed === 2 && S.res.food === 5, `healed ${healed}, food left ${S.res.food}`);
    ck('andTheButtonStaysWhileOneIsHurt', !!heart(), '');
    ck('greyWithNoFoodLeftForHim', heart() && heart().classList.contains('cant') && /Not enough food/.test(heart().title), heart() ? heart().title : '');
  }

  // ---- 4. no food: grey, nothing changes, it says why ----
  {
    const tc = setup('gh4');
    const ps = party(tc, ['defender', 'archer']);
    for (const u of ps) u.hp = 5;
    S.res.food = 0;
    selectParty(ps);
    const h = heart();
    toasts.length = 0;
    h.click();
    ck('greyWithAnEmptyLarder', h.classList.contains('cant'), h.className);
    ck('aGreyTapChangesNothing', ps.every(u => u.hp === 5) && S.res.food === 0, '');
    ck('andSaysWhy', toasts.length === 1 && toasts[0].warn && /food/.test(toasts[0].msg), JSON.stringify(toasts));
  }

  // ---- 5. every one resting: grey, "let them rest" ----
  {
    const tc = setup('gh5');
    const ps = party(tc, ['defender', 'defender']);
    for (const u of ps) for (let i = 0; i < CFG.HEAL_LIMIT_N; i++) UI.noteHeal(u);
    for (const u of ps) u.hp = 5;
    selectParty(ps);
    toasts.length = 0;
    heart().click();
    ck('theLimitHoldsForAParty', ps.every(u => u.hp === 5) && heart().classList.contains('cant') && /rest/.test(toasts[0] && toasts[0].msg), JSON.stringify(toasts));
  }

  // ---- 6. the pilot: the far hurt walk home and are mended there; the whole hold ----
  {
    const tc = setup('gh6');
    S.paused = false;
    const z = Bld.healZoneFor({ x: tc.x, y: tc.y, kind: 'defender', owner: 'P' });
    // ground a good way out from the hall that a soldier can walk home from
    let far = null;
    for (let r = 12; r < 20 && !far; r++) for (let a = 0; a < 24 && !far; a++) {
      const x = Math.round(z.x + Math.cos(a / 24 * 6.283) * r), y = Math.round(z.y + Math.sin(a / 24 * 6.283) * r);
      if (MapGen.onBoard(x, y) && Path.passable(x, y, 'P', 'land') && !Bld.at(x, y) && Path.find(x, y, tc.x - 1, tc.y, 'P', 'land')) far = { x, y };
    }
    const hurt = Units.spawn('defender', 'P', far.x + 0.5, far.y + 0.5);
    const well = Units.spawn('defender', 'P', far.x + 0.5, far.y + 0.5);
    const inRing = party(tc, ['archer'])[0];
    hurt.hp = 8; inRing.hp = 8;
    const f0 = S.res.food;
    selectParty([hurt, well, inRing]);
    toasts.length = 0;
    heart().click();
    const t = hurt.task;
    ck('theOneInTheRingIsMendedNow', inRing.hp === inRing.maxhp, `${inRing.hp}`);
    ck('theFarHurtWalksHome', !!hurt.healTrip && t && t.type === 'move' && Math.hypot(t.x + 0.5 - z.x, t.y + 0.5 - z.y) <= z.r,
      JSON.stringify({ trip: hurt.healTrip, t }));
    ck('andIsNotPaidForYet', f0 - S.res.food === UI.healCost(inRing) || inRing.hp === inRing.maxhp && S.res.food < f0 && hurt.hp === 8, `${f0 - S.res.food}`);
    ck('theWholeHoldWhereTheyAre', !well.task && !well.healTrip, JSON.stringify(well.task));
    ck('theToastSaysBoth', toasts.some(t => !t.warn && /^Heal 1 for .*send 1 home to heal/.test(t.msg)), JSON.stringify(toasts));
    // walk him home in sim steps; tickHealTrips is the frame's (UI.refresh)
    let steps = 0;
    while (hurt.hp < hurt.maxhp && steps++ < 1500) { G.simStep(0.05); UI.tickHealTrips(); }
    ck('heIsMendedWhereTheLandMends', hurt.hp === hurt.maxhp && Bld.inHealZone(hurt), `hp ${hurt.hp} after ${steps} steps, in zone ${Bld.inHealZone(hurt)}`);
    ck('paidOnArrival', UI.healLog(hurt).length === 1 && Units.isVeteran(hurt), `log ${UI.healLog(hurt).length}`);
    ck('andTheTripIsOver', !hurt.healTrip, JSON.stringify(hurt.healTrip));
    for (let i = 0; i < 200; i++) G.simStep(0.05);
    ck('heStaysWhereHeWasMended', Bld.inHealZone(hurt), `${hurt.x.toFixed(1)},${hurt.y.toFixed(1)}`);
    // a heal already on its way is not sent twice
    const again = Units.spawn('defender', 'P', far.x + 0.5, far.y + 0.5); again.hp = 4;
    selectParty([again, well]); heart().click();
    const t1 = again.healTrip; selectParty([again, well]);
    ck('aWalkerHomeIsNotSentTwice', !!t1 && heart().classList.contains('cant') && /on (his|their) way/.test(heart().title), heart() ? heart().title : 'no heart');
    S.paused = true;
  }

  // ---- 7. another order calls the walk off ----
  {
    const tc = setup('gh7');
    S.paused = false;
    const z = Bld.healZoneFor({ x: tc.x, y: tc.y, kind: 'defender', owner: 'P' });
    let far = null;
    for (let r = 12; r < 20 && !far; r++) for (let a = 0; a < 24 && !far; a++) {
      const x = Math.round(z.x + Math.cos(a / 24 * 6.283) * r), y = Math.round(z.y + Math.sin(a / 24 * 6.283) * r);
      if (MapGen.onBoard(x, y) && Path.passable(x, y, 'P', 'land') && !Bld.at(x, y)) far = { x, y };
    }
    const u = Units.spawn('defender', 'P', far.x + 0.5, far.y + 0.5), w = Units.spawn('archer', 'P', far.x + 0.5, far.y + 0.5);
    u.hp = 6;
    selectParty([u, w]); heart().click();
    const f0 = S.res.food;
    Units.moveTo(u, far.x, far.y);   // the player sends him back out
    UI.tickHealTrips();
    ck('anotherOrderCallsTheWalkOff', !u.healTrip, JSON.stringify(u.healTrip));
    for (let i = 0; i < 100; i++) { G.simStep(0.05); UI.tickHealTrips(); }
    ck('andNothingIsPaid', u.hp === 6 && S.res.food === f0, `hp ${u.hp} food ${f0}->${S.res.food}`);
    S.paused = true;
  }

  // ---- 8. a fleet mends at a dock, by the same heart ----
  {
    const tc = setup('gh8');
    // a lake carved east of the hall, a dock on its west shore
    const lx = tc.x + 6, ly = tc.y - 4;
    for (let y = ly; y < ly + 10; y++) for (let x = lx; x < lx + 10; x++) if (MapGen.onBoard(x, y)) { S.map.terrain[MapGen.idx(x, y)] = T.WATER; S.map.resAmount[MapGen.idx(x, y)] = 0; }
    Bld._block = null;
    let dock = null;
    for (let y = ly; y < ly + 8 && !dock; y++) for (let x = lx - 2; x < lx + 2 && !dock; x++)
      if (Bld.dockSiteOk(x, y, 'P').ok) dock = Bld.place('P', 'dock', x, y, { free: true, instant: true });
    if (!dock) ck('aFleetMendsAtADock', false, 'no dock site on the carved lake');
    else {
      const z = Bld.healZoneFor({ x: Bld.cx(dock), y: Bld.cy(dock), kind: 'fireship', owner: 'P' });
      const water = [];
      for (let y = Math.floor(z.y - z.r); y <= z.y + z.r; y++) for (let x = Math.floor(z.x - z.r); x <= z.x + z.r; x++)
        if (MapGen.onBoard(x, y) && Path.passable(x, y, 'P', 'water') && Math.hypot(x + 0.5 - z.x, y + 0.5 - z.y) <= z.r - 0.5) water.push({ x, y });
      const ships = water.slice(0, 2).map(s => Units.spawn('fireship', 'P', s.x + 0.5, s.y + 0.5));
      // and one out on the far side of the lake: it sails in to be mended
      const farW = { x: lx + 7, y: ly + 7 };
      const out = Units.spawn('fireship', 'P', farW.x + 0.5, farW.y + 0.5);
      if (ships.length < 2) ck('aFleetMendsAtADock', false, 'no water by the dock');
      else {
        for (const s of ships.concat(out)) s.hp = 20;
        selectParty(ships.concat(out));
        const h = heart();
        ck('aFleetWearsTheHeart', !!h && !h.classList.contains('cant'), h ? h.title : 'none');
        if (h) h.click();
        ck('aFleetMendsAtADock', ships.every(s => s.hp === s.maxhp), ships.map(s => s.hp + '/' + s.maxhp).join(' '));
        ck('itsHullsAreNoVeterans', ships.every(s => !Units.isVeteran(s)), '');
        const inZ = Bld.inHealZone(out);
        if (!inZ) {
          S.paused = false;
          let n = 0; while (out.hp < out.maxhp && n++ < 1500) { G.simStep(0.05); UI.tickHealTrips(); }
          S.paused = true;
        }
        ck('aFarHullSailsInToBeMended', !inZ && Path.passable(farW.x, farW.y, 'P', 'water') && (out.hp === out.maxhp && Bld.inHealZone(out)), `in zone at first ${inZ}, hp ${out.hp}/${out.maxhp}`);
      }
    }
  }

  // ---- 9. the heart comes without a tap (the signature) ----
  {
    const tc = setup('gh9');
    const ps = party(tc, ['defender', 'defender']);
    selectParty(ps);
    const before = !!heart();
    ps[0].hp = 3;
    UI.refreshPanel();
    ck('theHeartComesWithoutATap', !before && !!heart(), `before ${before} after ${!!heart()}`);
  }

  // ---- 10. in the header, clear of the title, at a phone's width ----
  {
    const tc = setup('gh10');
    const ps = party(tc, ['defender', 'defender', 'defender', 'axeman', 'archer', 'longbow']);
    ps[2].hp = 4;
    selectParty(ps);
    const h = heart(), title = document.querySelector('#panel .ptitle'), sub = document.querySelector('#panel .phead .psub');
    const hr = h.getBoundingClientRect();
    const textRight = el => { const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect().right; };
    const clear = textRight(title) <= hr.left + 0.5 && textRight(sub) <= hr.left + 0.5;
    ck('theHeartIsClearOfTheTitle', clear, `title ${textRight(title).toFixed(1)} sub ${textRight(sub).toFixed(1)} heart ${hr.left.toFixed(1)}`);
    ck('aFingersSize', hr.width >= 42 && hr.height >= 42, `${hr.width}x${hr.height}`);
    const at = document.elementFromPoint(hr.left + hr.width / 2, hr.top + hr.height / 2);
    ck('andATapLandsOnIt', at && at.closest('[data-act="gheal"]') === h, at ? at.tagName + '.' + at.className : 'none');
  }

  UI.toast = origToast;
  return { res, fails };
});
console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL GROUP-HEAL CHECKS PASS');
const bad = errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e));
console.log('errors:', bad);
await b.close();
process.exit(out.fails.length || bad.length ? 1 : 0);
