/* VETERANS OF THE FIELD (build 209 — operator: "if any military unit gets
   into a fight or an engagement and gets hurt and then they are either
   brought back to a war camp or to the main town center and they get healed
   when they're done healing they level up to a veteran… they'll still keep
   whatever their rank is… If they get upgraded to the next level… they lose
   their veteran standing… Do the little Chevron… that you do now for
   veterans when you play the card… the veteran level should always exist
   between the two levels of units from a defense and offense strength
   standpoint… so it doesn't like massively tipped the balance of the game").

     EARNED      a player's soldier, hurt, healed by the panel's Heal at the
                 hall or beside a War Camp, comes back a veteran of his rank
                 (a heal out of reach does nothing, an unhurt man has no Heal)
     WHAT IT IS  CFG.VETERAN more health and attack, an engine's stone too;
                 "Veteran Defender" on the panel and in the chronicle; the
                 Veterans card's gold pip over his head, drawn in the world
     BETWEEN     on every ladder, under the next rank wherever the next rank
                 is stronger, and always above his own
     LOST        a rank-up (or the card's promotion) re-stamps him: no
                 standing, no pip — and he can earn it again at the new rank
     NEVER       twice, the rival's (its own mending included), a hull, an
                 unarmed engine, a ghost, a war-wolf, a villager, a sapper;
                 nor beside the card's own veteran, which replaces it exactly
     KEPT        in a save

   Run after touching Units.isVeteran / veteranOk / makeVeteran / unVeteran /
   clearVeteran / vetMult / nameOf, CFG.VETERAN, the Heal button and its
   handler (UI.healSub, veteranNews), Units.rankUp, Deck.promote /
   Deck.veteran / drawUnit, R.rankPip, or Combat.bldAtkOf.

     node tests/veterans.mjs      # exits non-zero on any regression */
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
  G.newGame('vet1', 'moderate', 'medium'); Screens._demo = false; Screens.show('playing'); S.paused = true;
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
  clearGround(tc.x - 13, tc.y - 13, 28);
  S.res = { food: 5000, wood: 5000, stone: 5000, gold: 5000 };
  const V = CFG.VETERAN;
  // the player's own tap: select him and press Heal (the real button, the real handler)
  const heal = u => {
    UI.select('unit', u.id);
    const btn = document.querySelector('#panel [data-act="heal"]');
    if (btn) btn.click();
    return !!btn;
  };
  const hall = { x: tc.x + 3.5, y: tc.y + 3.5 };   // inside the hall's healing ring
  const near = (a, x) => Math.abs(a - x) < 1e-9;

  // ---- 1. earned at the hall ----
  let vd;
  {
    const u = vd = Units.spawn('defender', 'P', hall.x, hall.y);
    const base = { maxhp: u.maxhp, atk: u.atk, def: u.def, speed: u.speed };
    u.hp = 30;
    const cost = UI.healCost(u), food0 = S.res.food;
    UI.select('unit', u.id);
    const sub = (document.getElementById('healCost') || {}).textContent || '';
    const pressed = heal(u);
    const ttl = (document.querySelector('#panel .ptitle') || {}).textContent || '';
    const notes = [...document.querySelectorAll('#toasts .toast')].map(t => t.textContent).join(' | ');
    const addHp = Math.round(base.maxhp * V.hp);
    ck('aSoldierHurtAndHealedAtTheHallComesBackAVeteran',
      pressed && Units.isVeteran(u) && u.vetOf === 'defender' && u.maxhp === base.maxhp + addHp && u.hp === u.maxhp &&
      near(u.atk, base.atk * (1 + V.atk)) && u.def === base.def && u.speed === base.speed && S.res.food === food0 - cost,
      `vetOf ${u.vetOf}, hp ${u.hp}/${u.maxhp} (was ${base.maxhp}), atk ${u.atk} (was ${base.atk}), def ${u.def}, paid ${food0 - S.res.food}/${cost}`);
    ck('andThePanelAndTheChronicleSayIt', /Veteran/.test(sub) && ttl.includes('Veteran Defender') && /Veteran Defender/.test(notes) &&
      S.log.some(l => /Veteran Defender/.test(l.msg)),
      `heal line before "${sub}", title "${ttl}", notes "${notes}"`);
    const hint = UI.veteranLine();
    ck('andHisStandingIsInTheRulesOwnNumbers', hint.includes(Math.round(V.hp * 100) + '%') && V.hp > 0 && V.atk > 0 && V.hp <= 0.2 && V.atk <= 0.2,
      `"${hint}" (CFG.VETERAN ${JSON.stringify(V)})`);
  }

  // ---- 2. earned beside a War Camp, out of the hall's reach ----
  {
    const camp = put('warcamp', tc.x + 11, tc.y);
    const u = Units.spawn('rider', 'P', camp.x + 2.5, camp.y + 0.5);
    const inHall = Math.hypot(u.x - Bld.cx(tc), u.y - Bld.cy(tc)) <= Bld.tcRadius(tc);
    u.hp = 20;
    const pressed = heal(u);
    ck('orBesideAWarCamp', pressed && !inHall && Units.isVeteran(u) && u.hp === u.maxhp && u.maxhp === 70 + Math.round(70 * V.hp),
      `in the hall's ring ${inHall}, veteran ${Units.isVeteran(u)}, hp ${u.hp}/${u.maxhp}`);
  }

  // ---- 3. no heal, no standing ----
  {
    const far = Units.spawn('archer', 'P', tc.x - 11.5, tc.y - 11.5);
    far.hp = 20;
    const pressed = heal(far);
    const whole = Units.spawn('archer', 'P', hall.x + 1, hall.y);
    UI.select('unit', whole.id);
    const btn = document.querySelector('#panel [data-act="heal"]');
    ck('aHealOutOfReachMakesNoVeteranAndAnUnhurtManHasNoHeal',
      pressed && far.hp === 20 && !Units.isVeteran(far) && !btn && !Units.isVeteran(whole),
      `out of reach: hp ${far.hp}, veteran ${Units.isVeteran(far)}; whole man's Heal button ${!!btn}`);
  }

  // ---- 4. between the ranks, on every ladder ----
  {
    const rows = [], bad = [];
    const stamp = kind => {
      const u = Units.spawn(kind, 'P', hall.x, hall.y);
      const base = { maxhp: u.maxhp, atk: u.atk, def: u.def };
      u.hp = Math.max(1, u.maxhp - 10); u.hp = u.maxhp;   // hurt, then mended (the handler's order)
      Units.makeVeteran(u);
      const v = { maxhp: u.maxhp, atk: u.atk, def: u.def, ok: Units.isVeteran(u) };
      Units.despawn(u);
      return { base, v };
    };
    for (const yard of Units.RANK_YARDS) {
      const line = Object.keys(CFG.BUILDINGS[yard].train);
      line.forEach((kind, i) => {
        const { base, v } = stamp(kind);
        if (!v.ok || !(v.maxhp > base.maxhp) || !(v.atk > base.atk) || v.def !== base.def) bad.push(kind + ' not stronger');
        const next = line[i + 1];
        if (next) {
          const n = CFG.UNITS[next];
          for (const [st, bv, vv, nv] of [['hp', base.maxhp, v.maxhp, n.hp], ['atk', base.atk, v.atk, n.atk], ['def', base.def, v.def, n.def]])
            if (nv > bv && !(vv < nv)) bad.push(`veteran ${kind} ${st} ${vv} reaches ${next}'s ${nv}`);
        }
        rows.push(`${kind} ${base.maxhp}/${base.atk}→${v.maxhp}/${+v.atk.toFixed(2)}${next ? ' (' + next + ' ' + CFG.UNITS[next].hp + '/' + CFG.UNITS[next].atk + ')' : ''}`);
      });
    }
    ck('onEveryLadderAVeteranSitsBetweenHisRankAndTheNext', !bad.length && rows.length === 9, bad.join('; ') || rows.join(', '));
    // the workshop's engines are no ladder: a veteran's stone is a measured step, under the next engine's
    const cat = Units.spawn('catapult', 'P', hall.x, hall.y), tre = Units.spawn('trebuchet', 'P', hall.x, hall.y);
    const s0 = Combat.bldAtkOf(cat); cat.hp = cat.maxhp; Units.makeVeteran(cat); const s1 = Combat.bldAtkOf(cat);
    const t0 = Combat.bldAtkOf(tre); tre.hp = tre.maxhp; Units.makeVeteran(tre); const t1 = Combat.bldAtkOf(tre);
    ck('andAnEnginesStoneWithHim', s1 === Math.round(s0 * (1 + V.atk)) && s1 < CFG.UNITS.trebuchet.bldAtk && t1 === Math.round(t0 * (1 + V.atk)),
      `catapult ${s0} → ${s1}, trebuchet ${t0} → ${t1}`);
    Units.despawn(cat); Units.despawn(tre);
    // the blow he strikes is the stamp's (Units.effAtk reads u.atk), at the same spot
    const a = Units.spawn('axeman', 'P', hall.x, hall.y), c = Units.spawn('axeman', 'P', hall.x, hall.y);
    c.hp = c.maxhp; Units.makeVeteran(c);
    ck('andHisBlowLandsHarder', near(Units.effAtk(c) / Units.effAtk(a), 1 + V.atk), `${Units.effAtk(a)} → ${Units.effAtk(c)}`);
    Units.despawn(a); Units.despawn(c);
  }

  // ---- 5. lost on a rank-up, earned again at the new rank ----
  {
    const u = vd;
    put('barracks', tc.x - 6, tc.y + 4, 2);
    UI.select('unit', u.id);
    const rb = document.querySelector('#panel [data-act="rankup"]');
    const title = rb ? rb.getAttribute('title') || '' : '';
    rb && rb.click();
    const ttl = (document.querySelector('#panel .ptitle') || {}).textContent || '';
    const a0 = CFG.UNITS.axeman;
    ck('aRankUpLeavesTheStandingBehind', u.kind === 'axeman' && !Units.isVeteran(u) && u.vetOf === undefined && u.vetHp === undefined &&
      u.maxhp === a0.hp && near(u.atk, a0.atk) && ttl.trim() === 'Axeman' && /veteran/i.test(title),
      `kind ${u.kind}, veteran ${Units.isVeteran(u)}, ${u.maxhp}/${u.atk}, title "${ttl}", button "${title}"`);
    u.hp = 30; heal(u);
    ck('andHeCanEarnItAgainAtTheNewRank', Units.isVeteran(u) && u.vetOf === 'axeman' && u.maxhp === a0.hp + Math.round(a0.hp * V.hp),
      `vetOf ${u.vetOf}, ${u.maxhp}`);
  }

  // ---- 6. the pip: drawn in the world over a veteran, gone once he ranks up ----
  {
    UI.deselect();
    const spot = { x: tc.x - 4.5, y: tc.y + 1.5 };
    const u = Units.spawn('defender', 'P', spot.x, spot.y);
    u.path = null; u.task = null;
    R.cam.z = 2.5; R.centerOn(u.x, u.y);
    if (window.GoldFX && GoldFX.forget) GoldFX.forget();
    R.floats && (R.floats.length = 0);
    const gold = () => {
      R.draw(0);
      const cv = R.cv, dpr = R.dpr || 1, z = R.cam.z, TL = CFG.TILE;
      const sx = ((u.x * TL - R.cam.x) * z) * dpr, sy = ((u.y * TL - R.cam.y) * z) * dpr;
      const w = Math.round(28 * z * dpr), x0 = Math.max(0, Math.round(sx - w)), y0 = Math.max(0, Math.round(sy - 3 * w));
      const d = cv.getContext('2d').getImageData(x0, y0, 2 * w, 3.5 * w | 0).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - 255) < 6 && Math.abs(d[i + 1] - 212) < 6 && Math.abs(d[i + 2] - 94) < 6) n++;
      return n;
    };
    const before = gold();
    u.hp = u.maxhp; Units.makeVeteran(u);
    const vet = gold();
    Units.rankUp(u);
    if (window.GoldFX && GoldFX.forget) GoldFX.forget();
    const after = gold();
    ck('theGoldPipIsDrawnOverAVeteranAndGoesWithHisRank', before === 0 && vet >= 9 && after === 0 && u.kind === 'axeman',
      `gold pixels by his head: plain ${before}, veteran ${vet}, ranked up ${after}`);
    // the card's painter is the game's (R.rankPip): the card's doors draw the same diamond
    const c1 = document.createElement('canvas'); c1.width = c1.height = 48;
    const c2 = document.createElement('canvas'); c2.width = c2.height = 48;
    R.rankPip(c1.getContext('2d'), 8, 12, 32, 2, null);
    Deck.drawRank(c2.getContext('2d'), 8, 12, 32, 2, null);
    ck('andTheCardsDoorDrawsTheSamePip', c1.toDataURL() === c2.toDataURL() && Deck.headTop === Deck.headTop && typeof R.headTop === 'function',
      'R.rankPip and Deck.drawRank pixel for pixel');
    Units.despawn(u);
  }

  // ---- 7. never twice, never the wrong people ----
  {
    const mk = (kind, owner, x, y) => { const u = Units.spawn(kind, owner || 'P', x == null ? hall.x : x, y == null ? hall.y : y); u.hp = Math.max(1, u.maxhp - 10); return u; };
    const twice = mk('archer'); heal(twice); const hp1 = twice.maxhp; twice.hp = 5; heal(twice);
    const ghost = mk('elite'); ghost.spectral = true;
    const wolf = mk('wolf'); wolf.warWolf = true;
    const ship = mk('fireship');
    const tower = mk('siegetower');
    const vill = mk('villager'); const sap = mk('sapper');
    const cardVet = mk('elite'); cardVet.vet = 1.25;
    const refused = [ghost, wolf, ship, tower, vill, sap, cardVet].filter(u => Units.veteranOk(u) || Units.makeVeteran(u) || Units.isVeteran(u)).map(u => u.kind);
    heal(vill); heal(sap);
    // the rival's soldier: his own mending at his own hall makes no veteran, nor would anything else
    const atc = Bld.tcOf('A');
    const riv = mk('defender', 'A', Bld.cx(atc) + 2, Bld.cy(atc) + 2);
    S.ai.res.food = 9999; riv.mendDay = -99; riv.hp = 10;
    // nobody at his throat (a grazing cow by the rival's hall counts as one): the chief mends only in peace
    for (const o of S.units.slice()) if (o.owner !== 'A' && o.owner !== 'P' && Math.hypot(o.x - riv.x, o.y - riv.y) < 6) Units.despawn(o);
    const mended = (AI.mendTheHurt({}), riv.hp === riv.maxhp);   // Moderate's chief mends its hurt (aiMend)
    ck('neverTwiceNorTheWrongPeople', twice.maxhp === hp1 && Units.isVeteran(twice) && !refused.length && !Units.isVeteran(vill) && !Units.isVeteran(sap) &&
      mended && !Units.veteranOk(riv) && !Units.makeVeteran(riv) && !Units.isVeteran(riv),
      `twice ${hp1} → ${twice.maxhp}; refused all of ghost/war-wolf/hull/siege tower/villager/sapper/card veteran ${!refused.length} (${refused}); rival mended ${mended}, veteran ${Units.isVeteran(riv)}`);
    for (const u of [twice, ghost, wolf, ship, tower, vill, sap, cardVet, riv]) Units.despawn(u);
  }

  // ---- 8. the card's veteran replaces the field's, exactly; its promotion ends it ----
  {
    const e = Units.spawn('elite', 'P', hall.x, hall.y), e0 = { maxhp: e.maxhp, atk: e.atk };
    e.hp = e.maxhp; Units.makeVeteran(e);
    Deck.veteran(e);
    const d = Units.spawn('defender', 'P', hall.x, hall.y);
    d.hp = d.maxhp; Units.makeVeteran(d);
    Deck.promote(d, 'elite');
    ck('theCardsVeteranReplacesTheFieldsAndItsPromotionEndsIt',
      e.vet === Deck.VET && !Units.isVeteran(e) && e.vetOf === undefined && e.maxhp === Math.round(e0.maxhp * Deck.VET) && near(e.atk, e0.atk * Deck.VET) &&
      Units.nameOf(e) === 'Veteran Bronze Champion' &&
      d.kind === 'elite' && !Units.isVeteran(d) && d.vetOf === undefined && d.maxhp === CFG.UNITS.elite.hp,
      `card veteran ${e.maxhp}/${e.atk} (vet ${e.vet}, vetOf ${e.vetOf}); promoted ${d.kind} ${d.maxhp}, vetOf ${d.vetOf}`);
    Units.despawn(e); Units.despawn(d);
  }

  // ---- 9. kept in a save, and named when he falls ----
  {
    const u = Units.spawn('longbow', 'P', hall.x, hall.y);
    u.hp = 10; heal(u);
    const id = u.id, s0 = [u.maxhp, u.atk, u.vetOf, u.vetHp, u.vetAtk];
    UI.deselect();
    const json = G.saveJSON();
    G.loadJSON(json);
    const v = Units.get(id);
    ck('aVeteranIsKeptInASave', !!v && Units.isVeteran(v) && JSON.stringify([v.maxhp, v.atk, v.vetOf, v.vetHp, v.vetAtk]) === JSON.stringify(s0),
      `before ${JSON.stringify(s0)}, after ${v && JSON.stringify([v.maxhp, v.atk, v.vetOf, v.vetHp, v.vetAtk])}`);
    if (v) Units.damage(v, 9999, null, 'R');
    ck('andTheChronicleNamesHimWhenHeFalls', S.log.some(l => l.msg === 'Veteran Longbowman was killed'), (S.log[0] || {}).msg);
  }
  return { res, fails };
});

for (const [k, v] of Object.entries(out.res)) console.log(k.padEnd(62), v);
if (errs.length) console.log('PAGE ERRORS:', errs.slice(0, 5).join(' | '));
await b.close();
const failed = out.fails.length || errs.length;
console.log(failed ? `\n${out.fails.length} FAILURE(S): ${out.fails.join(', ')}${errs.length ? ' + page errors' : ''}` : '\nALL VETERANS CHECKS PASS');
process.exit(failed ? 1 : 0);
