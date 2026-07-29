/* BOATS: MOATS ARE OPEN WATER + SCUTTLE CONTRACT.

   Two rules this file pins:

   · A MOAT IS OPEN WATER TO A HULL — boats sail flooded channels exactly
     like lake water (friend and foe alike; that's the tradeoff of digging
     one). It still blocks land movement, a bridge still carries land over
     it, and ranged fire still crosses it — only the boat rule changed.

   · SCUTTLE — every own hull carries a Scuttle button (two taps, demolish's
     confirm pattern): the ship sinks, NO resources come back, and its place
     in the population is freed (Units.popUsed drops). A transport with
     soldiers aboard refuses — unload first; an accidental tap must never
     send the crew down with the ship.

   Run this after touching any of:
     map.js — Path.passable (the water-domain branch), BLOCK_TERR
     ui.js — the unit panel's scuttle button/handler
     units.js — despawn, popUsed
     config.js — T.MOAT

     node tests/boats-moat-scuttle.mjs      # exits non-zero on any regression

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
    for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 16; dx++) {
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

  // ---- 1. a moat is open water to a hull; still a barrier to land; a
  //         bridge still carries land over it ----
  {
    setup('bm1');
    S.map.terrain[MapGen.idx(30, 25)] = T.MOAT;
    ck('moatIsOpenWaterToBoats', Path.passable(30, 25, 'P', 'water') === true, '');
    ck('moatStillBlocksLand', Path.passable(30, 25, 'P') === false, '');
    S.map.bridge[MapGen.idx(30, 25)] = 1;
    ck('bridgedMoatCarriesLand', Path.passable(30, 25, 'P') === true &&
      Path.passable(30, 25, 'P', 'water') === true, 'land over the deck, hulls under it');
  }

  // ---- 2. a boat SAILS a moat channel between two ponds ----
  {
    const tc = setup('bm2');
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      S.map.terrain[MapGen.idx(26 + dx, 25 + dy)] = T.WATER;   // west pond
      S.map.terrain[MapGen.idx(35 + dx, 25 + dy)] = T.WATER;   // east pond
    }
    for (let x = 28; x <= 33; x++) S.map.terrain[MapGen.idx(x, 25)] = T.MOAT;   // the flooded channel
    const boat = Units.spawn('fishboat', 'P', 26, 25);
    Units.moveTo(boat, 35, 25);
    const t = run(30, () => boat.x > 34);
    ck('boatSailsTheMoatChannel', boat.x > 34, `boat at ${boat.x.toFixed(1)},${boat.y.toFixed(1)} after ${t}s`);
  }

  // ---- 3. scuttle: two taps, hull gone, population freed, nothing refunded ----
  {
    const tc = setup('bm3');
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
      S.map.terrain[MapGen.idx(26 + dx, 25 + dy)] = T.WATER;
    const boat = Units.spawn('fishboat', 'P', 26, 25);
    S.res = { food: 500, wood: 500, stone: 500, gold: 500 };
    const pop0 = Units.popUsed('P');
    UI.select('unit', boat.id);
    const btn1 = document.querySelector('#panel [data-act="scuttle"]');
    ck('scuttleButtonOffered', !!btn1 && /Scuttle/.test(btn1.textContent), btn1 ? btn1.textContent.trim() : 'missing');
    btn1.click();   // first tap arms the confirm
    const btn2 = document.querySelector('#panel [data-act="scuttle"]');
    const armed = !!btn2 && btn2.classList.contains('danger') && !!Units.get(boat.id);
    ck('firstTapOnlyArms', armed, btn2 ? btn2.textContent.trim() : 'missing');
    btn2.click();   // second tap sinks her
    ck('secondTapSinks', !Units.get(boat.id), '');
    ck('populationFreed', Units.popUsed('P') === pop0 - 1, `${pop0} -> ${Units.popUsed('P')}`);
    ck('nothingRefunded', S.res.food === 500 && S.res.wood === 500 && S.res.stone === 500 && S.res.gold === 500,
      JSON.stringify(S.res));
  }

  // ---- 4. a loaded transport refuses — unload before scuttling ----
  {
    const tc = setup('bm4');
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
      S.map.terrain[MapGen.idx(26 + dx, 25 + dy)] = T.WATER;
    const tr = Units.spawn('transport', 'P', 26, 25);
    tr.cargo = [{ kind: 'defender', hp: 60 }];   // one soldier below deck
    UI.select('unit', tr.id);
    const btn = document.querySelector('#panel [data-act="scuttle"]');
    btn.click(); const btn2 = document.querySelector('#panel [data-act="scuttle"]');
    if (btn2) btn2.click();
    ck('loadedTransportRefuses', !!Units.get(tr.id), 'still afloat with soldiers aboard');
  }

  return { res, fails };
});
console.log(JSON.stringify(out.res, null, 1));
console.log(out.fails.length ? 'FAILURES: ' + out.fails.join(', ') : 'ALL BOATS-MOAT-SCUTTLE CHECKS PASS');
console.log('errors:', errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e)));
await b.close();
process.exit(out.fails.length ? 1 : 0);
