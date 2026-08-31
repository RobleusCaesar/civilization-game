/* HEAL-LIMIT CONTRACT.

   Closes the "stand in the Town Center ring and spam Heal through a live
   fight" exploit: a unit that can be topped off between every blow never
   effectively dies, so a single defender could outlast an attacker for free.

   At most CFG.HEAL_LIMIT_N (3) heals per unit inside any rolling
   CFG.HEAL_LIMIT_MS (60s) REAL-TIME window — tracked in performance.now(),
   not S.day/S.dayT, because the exploit is real-time click-spamming during a
   fight, not anything tied to the in-game calendar. The log lives on
   UI._healLog (UI-local, same precedent as UI._toastAt), never on the unit
   or in S, so it's never serialized into a save — a stray wall-clock
   timestamp from a past browser session would be meaningless after a
   reload. G.newGame and G.loadJSON both clear it so a fresh/loaded game's
   reused low unit ids can never inherit a stale cooldown.

   Past the limit the Heal button goes visually disabled (.cant is opacity
   only — it does NOT block clicks), so the click handler must independently
   re-check UI.healThrottled(u) BEFORE the zone/afford checks and refuse with
   a toast ("Healed enough — let them rest"); it's the branch that actually
   matters mid-fight, where zone/afford are usually already fine.

   Run this after touching any of:
     ui.js — healCost, healLog/healThrottled/noteHeal, panelSig, renderPanel's
             heal button, refreshPanel's #healCost patch, the heal click handler
     game.js — newGame, loadJSON (UI._healLog reset)
     config.js — HEAL_LIMIT_N, HEAL_LIMIT_MS, HEAL_FOOD

     node tests/heal-limit.mjs      # exits non-zero on any regression

   If a feature genuinely needs different behaviour, update this file in the
   same commit and say so in the commit message. */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const b = await pw.chromium.launch();
const p = await b.newPage({ viewport: { width: 430, height: 880 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_FILE_NOT_FOUND')) errs.push('console: ' + m.text()); });
await p.goto('file://' + root + '/index.html', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(900);

const out = await p.evaluate(() => {
  const res = {}, fails = [];
  const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };

  const setup = (seed, kind) => {
    G.newGame(seed, 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
    S.res = { food: 99999, wood: 99999, stone: 99999, gold: 99999 };
    const tc = Bld.tcOf('P');
    const u = Units.spawn(kind, 'P', tc.x + 1, tc.y);
    return { tc, u };
  };
  const clickHeal = (u) => {
    UI.select('unit', u.id);
    UI.renderPanel();
    const btn = document.querySelector('#panel [data-act="heal"]');
    if (!btn) return { clicked: false };
    btn.click();
    return { clicked: true, cant: btn.classList.contains('cant') };
  };

  // ---- 1. three heals in a row all succeed ----
  {
    const { u } = setup('cap1', 'defender');
    let ok = true;
    for (let i = 0; i < 3; i++) {
      u.hp = 10;
      const foodBefore = S.res.food;
      const r = clickHeal(u);
      if (!r.clicked || u.hp !== u.maxhp || S.res.food >= foodBefore) ok = false;
    }
    ck('threeHealsAllSucceed', ok, `after 3 rounds, unit hp=${u.hp}/${u.maxhp}`);
    ck('logHasThreeEntries', UI.healLog(u).length === 3, `log length=${UI.healLog(u).length}`);
  }

  // ---- 2. the 4th heal within the window is refused, no hp/food change ----
  {
    const { u } = setup('cap2', 'defender');
    for (let i = 0; i < 3; i++) { u.hp = 10; clickHeal(u); }
    u.hp = 10;
    const foodBefore = S.res.food;
    UI.select('unit', u.id);
    UI.renderPanel();
    const btn = document.querySelector('#panel [data-act="heal"]');
    ck('buttonGreyedAtLimit', btn && btn.classList.contains('cant'), btn ? btn.className : 'no button');
    ck('buttonShowsCooldownLabel', btn && btn.querySelector('small').textContent === 'Cooldown…',
      btn ? btn.querySelector('small').textContent : 'no button');
    let toastMsg = null;
    const origToast = UI.toast.bind(UI);
    UI.toast = (msg, warn) => { if (warn) toastMsg = msg; };
    btn.click();   // the button is only VISUALLY disabled (opacity) — must be blocked in-handler
    UI.toast = origToast;
    ck('fourthHealBlocked', u.hp === 10 && S.res.food === foodBefore, `hp=${u.hp} food ${foodBefore}->${S.res.food}`);
    ck('toastMessageShown', !!toastMsg, JSON.stringify(toastMsg));
    res._toastText = toastMsg;
  }

  // ---- 3. after the window elapses, healing resumes ----
  {
    const { u } = setup('cap3', 'defender');
    for (let i = 0; i < 3; i++) { u.hp = 10; clickHeal(u); }
    u.hp = 10;
    ck('throttledBeforeExpiry', UI.healThrottled(u), 'still limited immediately after 3');
    // age the log past the window without waiting 60 real seconds
    UI._healLog[u.id] = UI._healLog[u.id].map(t => t - (CFG.HEAL_LIMIT_MS + 1000));
    ck('notThrottledAfterExpiry', !UI.healThrottled(u), `log=${JSON.stringify(UI._healLog[u.id])}`);
    const r = clickHeal(u);
    ck('healSucceedsAfterExpiry', r.clicked && u.hp === u.maxhp, `clicked=${r.clicked} hp=${u.hp}`);
  }

  // ---- 4. a partially-aged log only counts the RECENT heals (rolling window,
  //         not "3 total ever" — a heal from 61s ago must not count against you) ----
  {
    const { u } = setup('cap4', 'defender');
    u.hp = 10; clickHeal(u);                          // 1 recent heal
    UI._healLog[u.id][0] -= (CFG.HEAL_LIMIT_MS + 1000);   // age it out
    u.hp = 10; clickHeal(u);
    u.hp = 10; clickHeal(u);
    u.hp = 10;
    const third = clickHeal(u);   // only 2 heals are within the window — this should succeed
    ck('rollingWindowNotCumulative', third.clicked && u.hp === u.maxhp,
      `log=${JSON.stringify(UI.healLog(u))} hp=${u.hp}`);
  }

  // ---- 5. the limit is per-UNIT — a second unit is unaffected by the first
  //         hitting its cap ----
  {
    const { tc, u: u1 } = setup('cap5', 'defender');
    const u2 = Units.spawn('defender', 'P', tc.x + 2, tc.y + 1);
    for (let i = 0; i < 3; i++) { u1.hp = 10; clickHeal(u1); }
    ck('firstUnitThrottled', UI.healThrottled(u1), 'u1 hit the cap');
    u2.hp = 10;
    const r = clickHeal(u2);
    ck('secondUnitUnaffected', r.clicked && u2.hp === u2.maxhp, `u2 hp=${u2.hp}`);
  }

  // ---- 6. sappers (heal-eligible since the previous feature) are covered too ----
  {
    const { u } = setup('cap6', 'sapper');
    for (let i = 0; i < 3; i++) { u.hp = 10; clickHeal(u); }
    ck('sapperReachesLimit', UI.healThrottled(u), 'sapper hit the cap after 3');
    u.hp = 10;
    const foodBefore = S.res.food;
    clickHeal(u);
    ck('sapperFourthBlocked', u.hp === 10 && S.res.food === foodBefore, `hp=${u.hp}`);
  }

  // ---- 7. G.newGame clears the log — a fresh game's low ids can't inherit
  //         a stale cooldown from the previous one ----
  {
    const { u } = setup('cap7', 'defender');
    for (let i = 0; i < 3; i++) { u.hp = 10; clickHeal(u); }
    const idBefore = u.id;
    ck('throttledBeforeNewGame', UI.healThrottled({ id: idBefore }), 'set up: id is throttled pre-reset');
    G.newGame('cap7b', 'moderate', 'large');   // same call newGame() always makes
    ck('logClearedOnNewGame', Object.keys(UI._healLog).length === 0, JSON.stringify(UI._healLog));
  }

  // ---- 8. G.loadJSON also clears it ----
  {
    const { u } = setup('cap8', 'defender');
    for (let i = 0; i < 3; i++) { u.hp = 10; clickHeal(u); }
    const json = G.saveJSON();
    ck('logNonEmptyBeforeLoad', Object.keys(UI._healLog).length > 0, JSON.stringify(UI._healLog));
    G.loadJSON(json);
    ck('logClearedOnLoad', Object.keys(UI._healLog).length === 0, JSON.stringify(UI._healLog));
  }

  return { res, fails };
});
console.log(JSON.stringify(out.res, null, 1));
console.log('toast text was:', JSON.stringify(out.res._toastText));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL HEAL-LIMIT CHECKS PASS');
console.log('errors:', errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e)));
await b.close();
process.exit(out.fails.length ? 1 : 0);
