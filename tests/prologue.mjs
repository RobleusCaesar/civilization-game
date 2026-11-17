/* THE PROLOGUE (js/scenarios.js, js/scenario-maps.js built from
   tools/scenarios/*.json, js/prologue.js, CFG.PROLOGUE, CFG.MODES.prologue_N
   — operator, the Prologue brief: "a new device plays three games in order
   … short, beautiful, obvious, and ends in a win. SIMPLE. SIMPLE. SIMPLE.").

     THE WORLDS   js/scenario-maps.js is the build of the JSON as it stands;
                  every mark the Elder points at stands on the ground it
                  names (the berry bush IS a berry bush — R.fertileKindAt),
                  on ground the village walks to; game 1 shows its whole
                  valley and no rival; game 2 hides a relic within reach;
                  game 3 deals three of the six friendly origins.
     THE TITLE    a fresh device sees one BEGIN (the game's name, N of 3) and
                  a small Skip; New Game, the board, the cards and Load are
                  put away; the next world waits behind the title, and BEGIN
                  opens THAT world.
     THE SCRIPT   each game is won by following the guide alone — real taps
                  at the points the Elder's hand shows, and nothing else —
                  and no line the Elder says runs past fifteen words.
     THE ENDINGS  the Elder has the last word on a hall win, game 1 asks the
                  chief's name (kept as the chief's), each win pays ONE card
                  of its tier, once ever (Bronze, Iron, Imperial), the end
                  screen's doors are the journey's, the win stays off the
                  world board, and a lost game 3 offers to try again.
     THE SKIP     two taps, and the ordinary title is back for good.
     OFF          a veteran device never meets it; an ordinary world carries
                  no scenario and no Elder.

   Run after touching js/prologue.js, js/scenarios.js, js/scenario-maps.js
   (or tools/scenarios/*.json), CFG.PROLOGUE / MODES.prologue_N, the build
   menu's allow list (ui.js), Screens' title / draft / end hooks or
   Deck.prologue.

     node tests/prologue.mjs      # exits non-zero on any regression */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const res = {}, fails = [], errs = [];
// a name asked twice keeps both answers (a second game's check once overwrote the first's failing detail)
const ck = (n, ok, i) => { if (n in res) { let k = 2; while ((n + ' #' + k) in res) k++; n += ' #' + k; } res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };
const W = 390, H = 844;

/* ---- 1. THE MAPS ARE THEIR SOURCES, BUILT ---- */
{
  let ok = true, out = '';
  try { out = execFileSync('node', [join(root, 'tools', 'scenario-maps.mjs'), '--check'], { encoding: 'utf8' }); }
  catch (e) { ok = false; out = String(e.stderr || e.message); }
  ck('theMapsAreTheirSourcesBuilt', ok, out.trim().slice(0, 120));
}

const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });
// a page on a device: `done` = the games this device has already won
const page = async (q, done) => {
  const ctx = await b.newContext({ viewport: { width: W, height: H } });
  if (done) await ctx.addInitScript((d) => {
    try { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('neo-prologue', JSON.stringify({ v: 1, at: Date.now() - 600000, veteran: false, done: d })); sessionStorage.setItem('seeded', '1'); } } catch (e) {}
  }, done);
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto('file://' + join(root, 'index.html') + (q || ''), { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.Screens && Screens.current === 'title' && !document.getElementById('splash'), null, { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(500);
  return { p, ctx };
};

/* ---- 2. THE WORLDS: every mark on its own ground, within reach ---- */
{
  const { p, ctx } = await page('?prologue=0');
  const r = await p.evaluate(() => {
    const out = {};
    const tn = t => Object.keys(T).find(k => T[k] === t);
    for (const g of [1, 2, 3]) {
      const id = 'prologue_' + g;
      Scenarios.found(id);
      const sc = Scenarios.def(id), m = sc.marks || {}, W = CFG.W;
      // the hall's doorstep (tile indices) → the ground the village walks
      const home = Units.homeSteps('P').map(i => ({ x: i % W, y: (i / W) | 0 }));
      const reach = Path.reachFrom(home) || new Uint8Array(W * CFG.H);
      const has = i => !!reach[i];
      const near = (x, y) => { for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (MapGen.onBoard(xx, yy) && has(yy * W + xx)) return true; } return false; };
      const at = k => m[k] ? { k, t: tn(S.map.terrain[m[k][1] * W + m[k][0]]), x: m[k][0], y: m[k][1], reach: near(m[k][0], m[k][1]) } : null;
      // the ground alone: the lesson unlocks the card when its beat comes (Scenarios.unlock)
      const place = (key, k) => { if (!m[k]) return 'no mark'; Scenarios.unlock(key); const v = Bld.canPlace('P', key, m[k][0], m[k][1], { noCost: true, noSeal: true }); return v && v.ok ? 'ok' : (v && (v.code || v.why)); };
      const o = { scenario: S.scenario, mode: S.mode, marks: {}, rows: SCENARIO_MAPS['prologue_' + g].rows.length, home: home.length };
      for (const k of Object.keys(m)) o.marks[k] = at(k);
      if (g === 1) {
        o.berryKind = m.berries ? R.fertileKindAt(m.berries[0], m.berries[1]) : null;
        o.build0 = Array.isArray(S.allow) ? S.allow.length : -1;
        o.house = place('house', 'houseSite');
        // the whole valley is known; the dormant rival is nowhere the village can see or walk
        let reachable = 0, seen = 0;
        for (let i = 0; i < S.map.terrain.length; i++) if (has(i)) { reachable++; if (S.map.explored[i]) seen++; }
        o.seen = seen / Math.max(1, reachable);
        const rb = S.buildings.filter(x => x.owner === 'A');
        let close = 99;
        for (const x of rb) for (let i = 0; i < S.map.terrain.length; i++) if (has(i)) close = Math.min(close, Math.hypot((i % W) - x.x, ((i / W) | 0) - x.y));
        // the valley is charted, but the dormant rival is never SEEN: not in sight, not remembered
        G.updateVisibility();
        o.rival = { n: rb.length, seen: rb.some(x => { for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) { const i = (x.y + dy) * W + x.x + dx; if (G.visibleAt(x.x + dx, x.y + dy) || (S.map.seenB && S.map.seenB[i])) return true; } return false; }), close: +close.toFixed(1) };
        o.build = Array.isArray(S.allow) ? S.allow.length : -1;
      }
      if (g === 2) {
        o.berryKind = m.berries ? R.fertileKindAt(m.berries[0], m.berries[1]) : null;
        o.lumber = place('lumber', 'stumps'); o.quarry = place('quarry', 'pebbles'); o.farm = place('farm', 'barren');
        o.relic = S.relic ? { key: S.relic.key, x: S.relic.x, y: S.relic.y, reach: near(S.relic.x, S.relic.y), found: S.relic.found } : null;
        o.hall = Bld.tcOf('P') && Bld.tcOf('P').level;
      }
      if (g === 3) {
        o.berryKind = m.berries ? R.fertileKindAt(m.berries[0], m.berries[1]) : null;
        o.barracks = place('barracks', 'barracksSite');
        o.wonder = place('wonder', 'wonderSite');
        o.hand = (S.draft && S.draft.hand || []).map(c => c.key);
        o.pool = CFG.PROLOGUE.ORIGINS.slice();
        o.rivalSeen = S.buildings.some(x => x.owner === 'A' && x.key === 'tc' && S.map.explored[x.y * W + x.x]);
      }
      out[g] = o;
    }
    return out;
  });
  const g1 = r[1], g2 = r[2], g3 = r[3];
  const markOn = (o, k, terr) => !!(o.marks[k] && o.marks[k].t === terr && o.marks[k].reach);
  ck('eachWorldIsItsOwnScenarioAndMode', [1, 2, 3].every(g => r[g].scenario === 'prologue_' + g && r[g].mode === 'prologue_' + g && r[g].rows === 38 && r[g].home > 0),
    [1, 2, 3].map(g => r[g].scenario + '/' + r[g].mode + ' ' + r[g].rows + ' rows, ' + r[g].home + ' doorstep tiles').join(', '));
  ck('gameOnesBerryBushIsABerryBushWithinReach', markOn(g1, 'berries', 'FERTILE') && g1.berryKind === 'berry', JSON.stringify(g1.marks.berries) + ' ' + g1.berryKind);
  ck('gameOnesWoodAndHouseSiteAreWhereTheGuideSays', markOn(g1, 'forest', 'FOREST') && g1.house === 'ok', JSON.stringify(g1.marks.forest) + ' house ' + g1.house);
  ck('gameOneShowsItsWholeValleyAndNoRival', g1.seen >= 0.999 && !g1.rival.seen && g1.rival.close >= 5 && g1.build0 === 0,
    `charted ${(g1.seen * 100).toFixed(1)}%, rival halls ${g1.rival.n} seen ${g1.rival.seen} nearest walkable ${g1.rival.close}, menu ${g1.build0}`);
  ck('gameTwosStationsStandOnTheirOwnWorkedGround', markOn(g2, 'stone', 'HILLS') && g2.lumber === 'ok' && g2.quarry === 'ok' && g2.farm === 'ok' && g2.berryKind === 'berry',
    `stone ${JSON.stringify(g2.marks.stone)}, lumber ${g2.lumber}, quarry ${g2.quarry}, farm ${g2.farm}, berry ${g2.berryKind}`);
  ck('gameTwoHidesARelicWithinReachAndOpensGrown', !!g2.relic && g2.relic.reach && !g2.relic.found && g2.hall === 2, JSON.stringify(g2.relic) + ' hall ' + g2.hall);
  ck('gameThreesSitesStandWhereTheGuideSays', g3.barracks === 'ok' && g3.wonder === 'ok' && markOn(g3, 'stone', 'HILLS') && g3.berryKind === 'berry' && markOn(g3, 'gold', 'GOLDORE'),
    `barracks ${g3.barracks}, wonder ${g3.wonder}, stone ${JSON.stringify(g3.marks.stone)}, gold ${JSON.stringify(g3.marks.gold)}, berry ${g3.berryKind}`);
  ck('gameThreeDealsThreeOfTheSixFriendlyOrigins', g3.hand.length === 3 && g3.hand.every(k => g3.pool.includes(k)) && g3.rivalSeen,
    `${g3.hand.join(', ')} of ${g3.pool.join(', ')}; rival hall shown ${g3.rivalSeen}`);
  /* EVERY LINE IS SHORT: each beat's ask, its waiting-on-goods lines (a hand
     to send, every hand on it), its builders' and its waiting lines, every
     aside, the line that asks a gathering beat again, and the draft's. (The
     praise for a deed rides on the next line only while the two fit —
     Prologue._show — so it is held by the game itself.) */
  const lines = await p.evaluate(() => {
    const out = [], P = Prologue, txt = (t, a) => typeof t === 'function' ? t.call(P, a) : t;
    for (const g of [1, 2, 3]) {
      Scenarios.found('prologue_' + g);
      P.onWorldChange();
      for (const bt of P._beats) {
        for (const [k, t] of [['', txt(bt.text)], [':hold', bt.hold && txt(bt.hold, false)], [':holdWait', bt.hold && txt(bt.hold, true)],
          [':hands', txt(bt.handsText)], [':wait', txt(bt.wait)], [':gwait', txt(bt.gwait)]]) if (t || k === '') out.push({ g, id: bt.id + k, t });
      }
      for (const a of P.ASIDES) out.push({ g, id: 'aside:' + a.id, t: txt(a.text) });
      out.push({ g, id: 'gatherLine', t: P.gatherLine() });
    }
    out.push({ id: 'draft', t: P.DRAFT_LINE });
    return out;
  });
  const long = lines.filter(l => !l.t || String(l.t).split(/\s+/).filter(Boolean).length > 15);
  ck('noLineTheGuideSaysRunsPastFifteenWords', lines.length > 40 && !long.length, long.length ? long.map(l => l.g + ':' + l.id + ' "' + l.t + '"').join('; ') : lines.length + ' lines');
  /* HER FACES (operator, build 181: "a younger woman … double or triple the
     number of images … more diversity in the character"): nine faces of one
     woman, each a 256px picture on disk (her 128px master doubled), hard
     pixels only, and every face a line asks for is one of them */
  const fc = await p.evaluate(() => {
    const P = Prologue, want = new Set(['neutral', 'pleased', 'proud', 'excited', 'thinking', 'point']);
    for (const g of [1, 2, 3]) {
      Scenarios.found('prologue_' + g); P.onWorldChange();
      for (const bt of P._beats) for (const f of [bt.face, bt.holdFace, bt.waitFace]) if (f) want.add(f);
    }
    for (const a of P.ASIDES) if (a.face) want.add(a.face);
    const dom = P._dom();
    return { name: P.NAME, faces: P.FACES, want: [...want], label: dom.elder.getAttribute('aria-label'), shown: dom.root.querySelector('.peName').textContent };
  });
  const png = f => {
    const b = readFileSync(join(root, f));
    if (b.readUInt32BE(12) !== 0x49484452) return { err: 'not a PNG' };
    const w = b.readUInt32BE(16), h = b.readUInt32BE(20), ct = b[25];
    let soft = 0, trns = null;
    for (let o = 8; o < b.length - 8;) {
      const n = b.readUInt32BE(o), t = b.toString('ascii', o + 4, o + 8);
      if (t === 'tRNS') { trns = b.subarray(o + 8, o + 8 + n); for (const v of trns) if (v !== 0 && v !== 255) soft++; }
      o += 12 + n;
    }
    return { w, h, ct, soft, trns: !!trns };
  };
  const bad = [];
  for (const [k, url] of Object.entries(fc.faces)) {
    const f = url.split('?')[0];
    if (!existsSync(join(root, f))) { bad.push(k + ': missing'); continue; }
    const m = png(f);
    if (m.err || m.w !== 256 || m.h !== 256) bad.push(`${k}: ${m.err || m.w + 'x' + m.h}`);
    else if (m.ct !== 3 && m.ct !== 0 && m.ct !== 2) bad.push(`${k}: colour type ${m.ct} (ship a palette PNG)`);
    else if (m.soft) bad.push(`${k}: ${m.soft} half-transparent palette entries`);
  }
  const missing = fc.want.filter(f => !fc.faces[f]);
  ck('herNineFacesAreDrawnAndEveryLineWearsOne', Object.keys(fc.faces).length >= 9 && !bad.length && !missing.length,
    bad.concat(missing.map(f => 'no face "' + f + '"')).join('; ') || Object.keys(fc.faces).join(', '));
  ck('andTheCardNamesHer', fc.name === 'Mira' && fc.shown === 'Mira' && /Mira/.test(fc.label || ''), JSON.stringify({ name: fc.name, shown: fc.shown, label: fc.label }));
  await ctx.close();
}

/* THE GUIDE, FOLLOWED — and timed (operator, build 181: "the next thing
   that you're supposed to do … can take between two and three seconds to
   pop up … shoot for a second at Max"). The real loop's sim is held; only
   the follower moves the world, on the script's own clock. A person taps
   the PULSE as it is DRAWN (#proRing shown — a covered target is not ringed
   until the look brings it out), a reaction time after it appears, once
   the camera has settled; the first of the hand's taps when nothing is
   rung. After every tap the guide must answer within a second: a new line,
   a ring on something else, a card's act — or, on a line that only waits,
   the ring let go. And the ring is never drawn where a tap cannot land. */
const READ = () => {
  const P = Prologue, line = P._aside || P._shown, E = P._el;
  try { P.frame(0.016); } catch (e) {}
  let rb = line && line.ring ? line : (P._aside && P._aside.keepRing ? P._shown : null);
  try { if (rb && P._stale(rb)) rb = null; } catch (e) {}
  let raw = null;
  try { raw = rb && rb.ring ? rb.ring.call(P) : null; } catch (e) {}
  const drawn = !!(E && E.ring.style.display !== 'none');
  const r = raw && drawn ? P._resolve(raw) : null;
  const kOf = t => t.sel ? 'sel:' + t.sel : t.u !== undefined ? 'u:' + t.u : 'tile:' + Math.floor(t.x) + ',' + Math.floor(t.y);
  const key = r ? kOf(raw) : null;
  // where the drawn ring stands, a tap must land on the world (or on the element it rings)
  let blocked = null;
  /* a ring drawn past the screen's edge (a card scrolled out of the menu) is one no
     tap can reach — but for the moment its target is sliding in: the guide brings a
     ringed build card into view with a smooth scroll (UI.cardIntoView), and the
     deck's sheet rises from below the screen (an animation on it or on the card);
     the ring rides either in. Past that beat a ring still off the screen is a fault */
  const offScreen = r && (r.x < 0 || r.y < 0 || r.x > innerWidth || r.y > innerHeight);
  const tEl = offScreen && raw.sel ? document.querySelector(raw.sel) : null;
  const moving = t => { try { return !!t && document.getAnimations().some(a => a.playState === 'running' && a.effect && a.effect.target && a.effect.target.contains && a.effect.target.contains(t)); } catch (e) { return false; } };
  const cs = P._cardSt, sliding = offScreen && raw.sel && ((cs && cs.sel === raw.sel && !cs.seen && performance.now() - cs.at < 1500) || moving(tEl));
  if (offScreen && !sliding) blocked = 'off the screen';
  else if (r && !offScreen) {
    const el = document.elementFromPoint(r.x, r.y);
    if (raw.sel) { const t = document.querySelector(raw.sel); if (el && t && !t.contains(el)) blocked = el.id || String(el.className); }
    else if (el && el.id !== 'c') blocked = el.id || String(el.className);
  }
  let taps = [];
  try { taps = rb && rb.taps ? (rb.taps.call(P) || []).map(t => { const q = P._resolve(t); return q && (q.rect || P._open(q.x, q.y)) ? { x: Math.round(q.x), y: Math.round(q.y), u: t.u !== undefined, k: kOf(t) } : null; }).filter(Boolean) : []; } catch (e) {}
  return { over: !!S.over, id: line ? (P._aside ? 'aside:' : '') + line.id : '', phase: (line && line.phase) || '', auto: !!(line && line.auto),
    goal: E && E.goal.style.display !== 'none' ? E.goal.textContent : '', gliding: !!P._gliding,
    txt: E ? E.txt.textContent : '', open: !!(E && E.elder.style.display !== 'none' && E.root.style.display !== 'none'),
    key, ring: r ? { x: Math.round(r.x), y: Math.round(r.y) } : null, blocked, taps, vil: !!P.selVil(), clk: P.now() / 1000,
    acting: !!((window.Deck && Deck.acting && Deck.acting()) || (window.DeckUI && DeckUI.playing)),
    played: S.deck && S.deck.played ? S.deck.played.length : 0 };
};
const follow = async (p, maxT) => {
  const RT = 0.6, RETRY = 4, ANSWER = 1.0;
  await p.evaluate(() => {
    if (G.__realStep) return;
    G.__realStep = G.simStep;
    G.simStep = function (a, c) { if (!window.__mine) return; return G.__realStep.call(this, a, c); };
  });
  /* A PAUSED WORLD STANDS STILL, AS THE REAL LOOP LEAVES IT (G.frame steps
     nothing while S.paused): the deck's sheet holds it, and so does a raised
     Wonder's marvel, whose 7 s are REAL time before the run is called. Stepped
     through that hold, the world ran on and the rival's own Wonder could land
     inside the player's victory beat — on a fast runner the 7 s were ~800 sim-s
     of it (CI, build 181: "rival_wonder" at 1044 s with the player's Wonder
     standing since ~250 s). So a paused world is waited out in real time, and
     the follower's clock (`off`) runs on through the wait — a person's
     reaction and the second the guide has to answer are counted there too. */
  let off = 0;
  const step = async sec => {
    const ran = await p.evaluate(sec => {
      if (S && S.paused && !S.over) return false;
      window.__mine = true; try { for (let i = 0; i < Math.round(sec / 0.05); i++) G.simStep(0.05, 0.05); } finally { window.__mine = false; }
      return true;
    }, sec);
    if (!ran) { const w = Math.min(sec, 0.25); await p.waitForTimeout(w * 1000); off += w; }
  };
  const read = async () => { const r = await p.evaluate(READ); r.clk += off; return r; };
  const seen = [], slow = [], blocked = [], said = new Set();
  let clicks = 0, last = '', lastKey = null, keySince = 0, lastTap = null, pend = null;
  let st = await read();
  const t0 = st.clk;
  for (let k = 0; k < 20000 && !st.over && st.clk - t0 < maxT; k++) {
    if (st.id && st.id !== last) { seen.push({ id: st.id }); last = st.id; }
    if (st.open && st.txt && !said.has(st.txt)) said.add(st.txt);
    if (st.blocked && blocked.length < 6) blocked.push(`${st.clk.toFixed(1)}s ${st.id} ${st.key} under ${st.blocked}`);
    if (st.key !== lastKey) { lastKey = st.key; keySince = st.clk; }
    // the look's glide is real time a person spends waiting: counted against the second, the sim held
    if (pend && st.gliding) {
      const w0 = Date.now();
      await p.waitForFunction(() => !Prologue._gliding, null, { timeout: 3000, polling: 20 }).catch(() => {});
      pend.extra = (pend.extra || 0) + (Date.now() - w0) / 1000;
      st = await read();
      continue;
    }
    if (pend) {
      const dt = st.clk - pend.t0 + (pend.extra || 0);
      const waits = !st.key && (st.phase === 'wait' || st.phase === 'gwait' || st.auto || !st.id);
      // a tap that counts toward the goal (one of three soldiers) is answered by the tally moving
      const answered = (st.open && st.txt !== pend.txt) || (st.key && st.key !== pend.key) || (waits && st.key !== pend.key) || st.acting || st.goal !== pend.goal;
      if (answered) pend = null;
      else if (dt > ANSWER + 0.05) { slow.push(`${pend.t0.toFixed(1)}s [${pend.line}] ${pend.key}: nothing for ${dt.toFixed(1)} s`); pend = null; }
    }
    // the drawn ring; with none, the hand's taps — seen only once the idle hand comes (Prologue.IDLE_MS)
    let q = st.ring ? [{ x: st.ring.x, y: st.ring.y, k: st.key }] : (st.clk - keySince >= 6 ? st.taps : []);
    if (!st.ring && q.length > 1 && q[0].u && st.vil) q = q.slice(1);
    const tg = q[0];
    const again = lastTap && tg && lastTap.k === tg.k && st.clk - lastTap.t >= RETRY;
    if (tg && st.clk - keySince >= RT && (!lastTap || lastTap.k !== tg.k || again)) {
      // a person waits for the view to settle, then taps the target where it now is
      await p.waitForFunction(() => !Prologue._gliding, null, { timeout: 2000, polling: 30 }).catch(() => {});
      await p.waitForTimeout(60);
      const fr = await read();
      const q2 = fr.ring && fr.key === tg.k ? fr.ring : fr.taps.find(t => t.k === tg.k);
      if (!q2 || q2.x < 4 || q2.y < 4 || q2.x > W - 4 || q2.y > H - 4) { st = fr; if (!q2) continue; }
      else {
        await p.mouse.click(q2.x, q2.y); clicks++;
        lastTap = { t: fr.clk, k: tg.k };
        pend = { t0: fr.clk, key: tg.k, txt: fr.txt, goal: fr.goal, line: fr.id };
        await p.waitForTimeout(40);
        st = await read();
        continue;
      }
    }
    await step(pend || st.clk - keySince < RT + 0.15 ? 0.1 : 1.0);
    st = await read();
  }
  await p.evaluate(() => { if (G.__realStep) { G.simStep = G.__realStep; delete G.__realStep; } });
  return { over: st.over, clk: st.clk - t0, clicks, seen, said: [...said], slow, blocked, played: st.played };
};
// the end screen's card, claimed, and the doors it leaves
const endScreen = async (p) => {
  await p.waitForFunction(() => Screens.current === 'endgame', null, { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(1200);
  const claim = await p.$('[data-act="claim"]');
  if (claim && await claim.isVisible().catch(() => false)) { await claim.click().catch(() => {}); await p.waitForTimeout(2600); }
  return p.evaluate(() => ({
    cur: Screens.current,
    doors: [...document.querySelectorAll('.ceBtns [data-act]')].filter(x => x.offsetParent).map(x => x.dataset.act + ':' + x.textContent.trim()),
    line: (document.querySelector('.ceNext') || {}).textContent || '',
    prog: JSON.parse(localStorage.getItem('neo-prologue') || '{}'),
    runs: Object.fromEntries(Object.entries(Deck.col().runs || {}).filter(([k]) => /^pro:/.test(k)).map(([k, v]) => [k, v.map(c => c.tier)])),
    total: Deck.total(),
    hold: Screens.boardHold(true).hold,
  }));
};

/* ---- 2b. THE GUIDE NEVER POINTS WHERE A TAP CANNOT GO (found at a person's
   pace: a scout's mark under the minimap, where a tap moves the camera and
   nobody is sent; a ghost a slip moved onto ground it cannot take, with the
   guide still ringing the greyed ✓; a toast written over the Elder's line) ---- */
{
  const { p, ctx } = await page('?prologue=1', { 1: Date.now() - 60000 });
  await p.click('#btnBegin').catch(() => {});
  await p.waitForFunction(() => Screens.current === 'playing' && S.scenario === 'prologue_2', null, { timeout: 40000 }).catch(() => {});
  await p.waitForTimeout(3500);   // the establishing glide
  /* A LESSON OPENS CLEAN (operator, build 182): the map folded, the unit tips put
     away (Mira teaches), the map button and the panel's ℹ️ there to bring them back */
  const clean = await p.evaluate(() => {
    const v = Prologue.vils()[0]; UI.select('unit', v.id); UI.renderPanel();
    const mini = document.getElementById('miniWrap'), help = document.querySelector('#panel #helpToggle');
    const out = { folded: UI.miniCollapsed === true && getComputedStyle(mini).display === 'none',
      mapBtn: !!document.getElementById('mapBtn') && document.getElementById('mapBtn').offsetWidth > 0,
      tips: !!document.querySelector('#panel .pactions .psub'), info: help ? help.textContent.trim() : null };
    UI.deselect && UI.deselect();
    return out;
  });
  ck('aLessonOpensWithTheMapFoldedAndTheTipsPutAway', clean.folded && clean.mapBtn && !clean.tips && clean.info === 'ℹ️', JSON.stringify(clean));
  // the scout's line, a villager in hand, and its mark parked under the minimap (a player who opened it)
  const pre = await p.evaluate(() => {
    const P = Prologue;
    UI.setMiniCollapsed(false);
    S.pro.i = P._beats.findIndex(b => b.id === 'scout'); P._shown = null; P._aside = null;
    for (let i = 0; i < 4; i++) G.simStep(0.05, 0.05);
    const v = P.vils()[0]; UI.select('unit', v.id);
    const m = P.mark('scoutTo', 1), mini = document.getElementById('miniWrap').getBoundingClientRect();
    const z = R.cam.z, TL = CFG.TILE, sx = mini.left + mini.width / 2, sy = mini.top + mini.height / 2;
    R.cam.x = m.x * TL - sx / z; R.cam.y = m.y * TL - sy / z;
    P._looked = null;
    const t = P._resolve(P._shown.ring.call(P));
    return { line: P._shown && P._shown.id, under: !!t && Math.abs(t.x - sx) < 3 && Math.abs(t.y - sy) < 3, open: !!t && P._open(t.x, t.y) };
  });
  await p.waitForTimeout(900);    // the look's glide
  const post = await p.evaluate(() => {
    const P = Prologue, t = P._resolve(P._shown.ring.call(P));
    const el = t && document.elementFromPoint(t.x, t.y);
    return { at: t && [Math.round(t.x), Math.round(t.y)], hit: el && (el.id || el.className) };
  });
  ck('theGuideNeverRingsAMarkUnderTheMinimap', pre.line === 'scout' && pre.under && !pre.open && post.hit === 'c',
    `before: ${JSON.stringify(pre)}; after: ${JSON.stringify(post)}`);
  // the farm's line: the ghost on its site, then a slip onto the berries beside it
  const g = await p.evaluate(() => {
    const P = Prologue;
    UI.deselect && UI.deselect();
    S.pro.i = P._beats.findIndex(b => b.id === 'farm'); P._shown = null; P._aside = null;
    Scenarios.unlock('farm'); S.res.wood = Math.max(S.res.wood, 500);
    for (let i = 0; i < 4; i++) G.simStep(0.05, 0.05);
    UI.enterPlacement('farm');
    return { line: P._shown && P._shown.id, placing: UI.placing };
  });
  await p.waitForTimeout(400);
  const seated = await p.evaluate(() => {
    const P = Prologue, m = P.mark('barren', 0.5), ring = P._shown.ring.call(P), v = UI.placeVerdict, gh = UI.placeGhost;
    return { ring: ring && (ring.sel || 'tile'), ghost: gh && [gh.x, gh.y], site: [Math.floor(m.x), Math.floor(m.y)], ok: !!(v && v.ok) };
  });
  const slip = await p.evaluate(() => {
    const P = Prologue, b = P.mark('berries', 0.5);
    UI.placeGhost = { x: Math.floor(b.x), y: Math.floor(b.y), set: true }; UI._placeCheck();
    const ring = P._shown.ring.call(P);
    return { ok: UI.placeVerdict && UI.placeVerdict.ok, ring: ring && (ring.sel || [Math.floor(ring.x), Math.floor(ring.y)]) };
  });
  ck('aGhostASlipMovedIsPointedBackToItsSite', g.line === 'farm' && seated.ring === '#placeOk' && seated.ok && slip.ok === false && Array.isArray(slip.ring) && slip.ring[0] === seated.site[0] && slip.ring[1] === seated.site[1],
    `${JSON.stringify(g)} seated ${JSON.stringify(seated)} slip ${JSON.stringify(slip)}`);
  // and a tap there carries it back (the ✓ answers again) — the look brings the site into view first
  await p.waitForTimeout(800);
  const back = await p.evaluate(() => { const P = Prologue, t = P._resolve(P._shown.ring.call(P)); return t && { x: Math.round(t.x), y: Math.round(t.y) }; });
  if (back) await p.mouse.click(back.x, back.y);
  await p.waitForTimeout(300);
  const after = await p.evaluate(() => { const P = Prologue, ring = P._shown.ring.call(P), v = UI.placeVerdict; return { ok: !!(v && v.ok), ring: ring && (ring.sel || 'tile') }; });
  ck('andATapOnTheSiteCarriesItBack', after.ok && after.ring === '#placeOk', JSON.stringify({ back, after }));
  // a toast while the Elder's card sits at the top lands below it, never over the line
  const tst = await p.evaluate(() => {
    UI.cancelPlacement && UI.cancelPlacement();
    const P = Prologue, E = P._dom();
    // the ring low on the screen: the card takes the top seat
    S.pro.i = P._beats.findIndex(b => b.id === 'scout'); P._shown = null; P._aside = null;
    for (let i = 0; i < 4; i++) G.simStep(0.05, 0.05);
    const v = P.vils()[0]; UI.select('unit', v.id);
    const m = P.mark('scoutTo', 1), z = R.cam.z, TL = CFG.TILE;
    R.cam.x = m.x * TL - (innerWidth / 2) / z; R.cam.y = m.y * TL - (innerHeight * 0.8) / z;
    P._gliding = true;   // no glide: the camera stays where it was put (a look waits on a glide in flight)
    UI.toast('A word from the world, long enough to need a whole line here', 'note', 6000);
    return true;
  });
  await p.waitForTimeout(500);
  const ov = await p.evaluate(() => {
    const E = Prologue._dom(), er = E.elder.getBoundingClientRect(), ts = [...document.querySelectorAll('#toasts .toast')].map(t => t.getBoundingClientRect());
    const top = er.top < innerHeight / 2;
    const over = ts.some(r => !(r.right < er.left || r.left > er.right || r.bottom < er.top || r.top > er.bottom));
    return { top, over, elder: [Math.round(er.top), Math.round(er.bottom)], toasts: ts.map(r => [Math.round(r.top), Math.round(r.bottom)]) };
  });
  ck('aToastLandsBelowTheGuidesLineNeverOverIt', ov.top && ov.toasts.length > 0 && !ov.over, JSON.stringify(ov));
  await p.evaluate(() => { Prologue._gliding = false; });
  /* A RINGED CARD IS BROUGHT INTO VIEW UNTIL IT IS SEEN (UI.cardIntoView, build 182 —
     found under a slowed CPU: game 3's barracks card ringed at x 399 on this 390px
     phone, and the bot never tapped). The guide's one scroll to the card could land
     before the beat's unlock rebuilt the menu, and the rebuild put the menu back at
     its start: one shot, spent, and the ring past the screen's edge for good. Here
     the guide rings the row's last card through its own frames, the first scroll is
     undone the same way, and its next seconds must bring the card back; once the
     card has been seen, a scroll of the player's is left alone. */
  const cv = await p.evaluate(() => {
    UI.cancelPlacement && UI.cancelPlacement(); UI.deselect && UI.deselect();
    for (const k of Object.keys(CFG.BUILDINGS)) { try { Scenarios.unlock(k); } catch (e) {} }
    if (UI.setMenuCollapsed) UI.setMenuCollapsed(false);
    const wrap = document.getElementById('buildmenu');
    const cards = [...wrap.querySelectorAll('.bbtn')].filter(x => x.offsetParent !== null && x.dataset.key);
    const sel = '.bbtn[data-key="' + cards[cards.length - 1].dataset.key + '"]';
    wrap.scrollTo({ left: 0, behavior: 'instant' });
    S.paused = true;                    // the line holds still while it is measured (the guide's frames run on)
    Prologue._aside = null; Prologue._cardSt = null;
    Prologue._shown = { id: 'card', text: 'Build this here.', face: 'point', ring: () => ({ sel }) };
    window.__cardSel = sel;
    return { sel, overflow: wrap.scrollWidth > wrap.clientWidth + 1, n: cards.length };
  });
  const cWhole = () => p.evaluate(() => {
    const wrap = document.getElementById('buildmenu'), wr = wrap.getBoundingClientRect(), br = document.querySelector(window.__cardSel).getBoundingClientRect();
    const r = Prologue._el && Prologue._el.ring.style.display !== 'none' ? Prologue._el.ring.getBoundingClientRect() : null;
    return { whole: br.left >= Math.max(0, wr.left) - 1 && br.right <= Math.min(innerWidth, wr.right) + 1, at: Math.round(br.left + br.width / 2),
      left: Math.round(wrap.scrollLeft), ring: r && Math.round(r.left + r.width / 2), st: Prologue._cardSt };
  });
  await p.waitForTimeout(150);          // the first ringing frames: the one scroll sets off…
  await p.evaluate(() => { UI.buildMenu(); document.getElementById('buildmenu').scrollTo({ left: 0, behavior: 'instant' }); });   // …and the unlock's rebuild undoes it
  const cUndone = await cWhole();
  await p.waitForTimeout(2600);         // the guide's next seconds
  const cBack = await cWhole();
  await p.evaluate(() => document.getElementById('buildmenu').scrollTo({ left: 0, behavior: 'instant' }));   // the player looks along the row
  await p.waitForTimeout(1600);
  const cLeft = await cWhole();
  await p.evaluate(() => { Prologue._shown = null; S.paused = false; });
  ck('aRingedCardIsBroughtIntoViewEvenWhenItsFirstScrollIsUndone', cv.overflow && !cUndone.whole && cBack.whole && cBack.ring > 0 && cBack.ring < 390 && !!(cBack.st && cBack.st.seen),
    JSON.stringify({ cv, undone: { whole: cUndone.whole, at: cUndone.at }, back: { whole: cBack.whole, at: cBack.at, ring: cBack.ring, st: cBack.st } }));
  ck('andOnceSeenThePlayersScrollIsLeftAlone', cLeft.left === 0 && !cLeft.whole, JSON.stringify({ left: cLeft.left, whole: cLeft.whole }));
  await ctx.close();
}

/* ---- 2d. ONE VOICE (operator, build 181: "cut the amount of notifications
   down by like 70% … they clash with the instructions"): in a journey world
   the world's news goes to the chronicle and is not toasted — but a refusal
   to the player's own order, a famine and an attack always are; an ordinary
   world toasts all of it, as ever ---- */
{
  const { p, ctx } = await page('?prologue=0');
  const r = await p.evaluate(() => {
    const shown = [], real = UI._showToast;
    UI._showToast = function (msg) { shown.push(String(msg)); return real.apply(this, arguments); };
    const say = () => {
      shown.length = 0; UI._toastAt = {};
      const n0 = S.log.length;
      G.log('House needs a builder — tap a villager, then the site', true);
      G.log('The soil here is spent — a farm may stand on it — villager idle', 'note');
      G.log('Farm complete — the builder stays on to work it', 'note');
      G.foeNote('A war band musters in the west.');
      G.log('No clear ground beside that seam.', true, null, true);
      G.log('⚠️ Famine! Food has run out — raise farms, lodges or fishing boats before your soldiers desert.', true);
      G.log('Lumber Camp under attack!', true);
      return { shown: shown.slice(), logged: S.log.length - n0 };
    };
    Screens._demo = false;
    Scenarios.found('prologue_1'); Prologue.onWorldChange();
    const journey = say();
    G.newGame('plain-seed', 'calm', 'medium');
    const plain = say();
    UI._showToast = real;
    return { journey, plain };
  });
  const keep = ['No clear ground beside that seam.', '⚠️ Famine!', 'Lumber Camp under attack!'];
  const kept = r.journey.shown.length === 3 && keep.every(k => r.journey.shown.some(m => m.startsWith(k)));
  ck('aJourneyWorldToastsOnlyWhatTheGuideDoesNotSay', kept && r.journey.logged === 7, JSON.stringify(r.journey));
  ck('andAnOrdinaryWorldToastsItAll', r.plain.shown.length === 7, JSON.stringify(r.plain));
  await ctx.close();
}

/* ---- 2c. THE BEGIN PLATE IS READ (operator, on a phone: "The first fire
   text isn't visible and it looks crowded. It also appears to be imposed
   over the bevel of the button. Make it visible and make everything
   centered"). The game's name was cream at 63% on the GOLD plate — no
   contrast — and the 58px plate (52 on a short window) could not hold the
   word, the flame and the line, so the name lay across the carved groove
   8.6px in from the rim; the flame beside the word pushed BEGIN 19px off
   the name's centre. Measured on the plate as drawn, at six sizes: the
   name's ink stands out from the gold under it (4.5:1), the word and the
   name share the plate's centre line, both stand inside the groove with
   room and balanced above and below, the name on one line. ---- */
{
  const { p, ctx } = await page('?prologue=reset');
  // TitleScreen.plaque: the rim R = 1 + 3.2 in, the carved groove R + 4.4 in
  const GROOVE = 8.6, CAPS = 24;
  const sizes = [[430, 727], [390, 664], [375, 560], [320, 480], [844, 390], [1440, 900]];
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const bad = [], read = [];
  for (const [w, h] of sizes) {
    await p.setViewportSize({ width: w, height: h });
    await p.waitForTimeout(300);
    const m = await p.evaluate(() => {
      const btn = document.getElementById('btnBegin'), sm = btn && btn.querySelector('small'), lab = btn && btn.querySelector('.blab');
      if (!btn || !sm || !lab) return null;
      const box = e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
      const txt = [...lab.childNodes].find(n => n.nodeType === 3 && n.textContent.trim());
      let word = null;
      if (txt) { const rg = document.createRange(); rg.selectNodeContents(txt); word = box(rg); }
      let op = 1;
      for (let e = sm; e && e !== document.documentElement; e = e.parentElement) op *= +getComputedStyle(e).opacity;
      const s = getComputedStyle(sm);
      return { kind: btn.dataset.t2 || '', b: box(btn), s: box(sm), l: box(lab), word, color: s.color, op, lh: parseFloat(s.lineHeight) || 16 };
    });
    if (!m) { bad.push(`${w}x${h}: no BEGIN plate`); continue; }
    // the gold under the name: the plate drawn with the name hidden, its median
    await p.evaluate(() => { document.querySelector('#btnBegin small').style.visibility = 'hidden'; });
    const shot = await p.screenshot({ clip: { x: m.s.x, y: m.s.y, width: Math.max(1, m.s.w), height: Math.max(1, m.s.h) } });
    await p.evaluate(() => { document.querySelector('#btnBegin small').style.visibility = ''; });
    const plate = await p.evaluate(async (b64) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height).data, ch = [[], [], []];
      for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) ch[k].push(d[i + k]);
      return ch.map(a => a.sort((p, q) => p - q)[a.length >> 1]);
    }, shot.toString('base64'));
    const cm = /rgba?\(([^)]+)\)/.exec(m.color), cv = cm ? cm[1].split(',').map(Number) : [255, 255, 255, 1];
    const a = (cv.length > 3 ? cv[3] : 1) * m.op, ink = [0, 1, 2].map(k => cv[k] * a + plate[k] * (1 - a));
    const L1 = lum(plate), L2 = lum(ink), contrast = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const cx = m.b.x + m.b.w / 2, top = m.l.y - m.b.y, bottom = m.b.y + m.b.h - (m.s.y + m.s.h);
    const wordOff = m.word ? Math.abs(m.word.x + m.word.w / 2 - cx) : 99, nameOff = Math.abs(m.s.x + m.s.w / 2 - cx);
    const why = [];
    if (contrast < 4.5) why.push(`name ${contrast.toFixed(2)}:1 on the plate`);
    if (wordOff > 2.5) why.push(`BEGIN ${wordOff.toFixed(1)}px off the centre`);
    if (nameOff > 2) why.push(`name ${nameOff.toFixed(1)}px off the centre`);
    if (Math.min(top, bottom) < GROOVE + 1.5) why.push(`inside the groove by ${(Math.min(top, bottom) - GROOVE).toFixed(1)}px`);
    if (Math.abs(top - bottom) > 2.5) why.push(`${top.toFixed(1)}px above, ${bottom.toFixed(1)}px below`);
    if (m.s.h > m.lh * 1.5) why.push('name on two lines');
    if (m.s.w > m.b.w - 2 * CAPS) why.push('name under the corner caps');
    read.push(`${w}x${h} ${contrast.toFixed(1)}:1 ${top.toFixed(0)}/${bottom.toFixed(0)} plate ${m.b.h.toFixed(0)}`);
    if (why.length) bad.push(`${w}x${h} (${m.kind}): ${why.join(', ')}`);
  }
  ck('theBeginPlatesNameIsReadCentredInsideItsGroove', bad.length === 0, bad.join(' | ') || read.join('; '));
  await ctx.close();
}

/* ---- 3. THE TITLE, and game 1 played by following the guide alone ---- */
{
  const { p, ctx } = await page('?prologue=reset');
  const t = await p.evaluate(() => {
    const vis = id => { const e = document.getElementById(id); return !!(e && e.offsetParent !== null && getComputedStyle(e).display !== 'none'); };
    return { active: Prologue.active(), begin: vis('btnBegin'), label: (document.querySelector('#btnBegin small') || {}).textContent || '', skip: vis('btnSkipJourney'),
      hidden: ['btnTitleNew', 'btnTitleBoard', 'btnTitleCards', 'btnTitleLoad'].filter(id => document.getElementById(id) && !vis(id)).length,
      held: Prologue.holding(), scen: window.S && S.scenario };
  });
  ck('aFreshDeviceIsOnTheJourney', t.active && t.begin && /The First Fire · 1 of 3/.test(t.label) && t.skip, JSON.stringify(t));
  ck('andTheTitlePutsTheOtherDoorsAway', t.hidden === 4, t.hidden + ' of New Game, board, cards, Load put away');
  ck('theFirstWorldWaitsBehindTheTitle', t.held && t.scen === 'prologue_1', `holding ${t.held}, ${t.scen}`);
  await p.evaluate(() => { window.__held = S; });
  await p.click('#btnBegin');
  await p.waitForFunction(() => Screens.current === 'playing', null, { timeout: 30000 }).catch(() => {});
  const o = await p.evaluate(() => ({ cur: Screens.current, same: S === window.__held }));
  ck('beginOpensTheWorldThatWaited', o.cur === 'playing' && o.same, JSON.stringify(o));
  await p.waitForTimeout(3000);   // the establishing glide
  // (the Elder's panel is position: fixed, so it has no offsetParent: shown is its box)
  const e1 = await p.evaluate(() => {
    const el = document.querySelector('#proElder'), r = el && el.getBoundingClientRect();
    const tg = document.getElementById('bmToggle');
    return { up: !!(el && getComputedStyle(el).display !== 'none' && r.width > 0), txt: (document.querySelector('#proElder .peTxt') || {}).textContent || '',
      nob: document.body.classList.contains('pro-nobuild'), tab: !!(tg && getComputedStyle(tg).display !== 'none') };
  });
  ck('andGameOneOpensWithNoBuildMenu', e1.nob && !e1.tab, 'pro-nobuild ' + e1.nob + ', Build tab shown ' + e1.tab);
  ck('theGuideSpeaksFirst', e1.up && /berries/i.test(e1.txt), JSON.stringify(e1));
  const run = await follow(p, 700);
  ck('gameOneIsWonByFollowingTheGuideAlone', run.over && run.clicks > 4, `over ${run.over} at ${run.clk.toFixed(0)} s of play, ${run.clicks} taps, lines ${run.seen.map(s => s.id).join(' › ')}`);
  ck('andEveryLineItSaidWasShort', run.said.length > 5 && run.said.every(t => t.split(/\s+/).filter(Boolean).length <= 15), run.said.filter(t => t.split(/\s+/).filter(Boolean).length > 15).join(' | ') || run.said.length + ' lines');
  ck('andEveryTapWasAnsweredWithinASecond', run.clicks > 4 && !run.slow.length, run.slow.join('; ') || run.clicks + ' taps');
  ck('andTheRingWasNeverDrawnWhereATapCannotLand', !run.blocked.length, run.blocked.join('; ') || 'clear');
  const win = await p.evaluate(() => ({ win: !!(S.over && S.over.win), cause: S.over && S.over.cause, cur: Screens.current, txt: (document.querySelector('#proElder .peTxt') || {}).textContent || '' }));
  ck('theHallWinsAndTheGuideHasTheLastWord', win.win && win.cause === 'hall' && win.cur === 'playing' && /first fire/i.test(win.txt), JSON.stringify(win));
  await p.waitForFunction(() => Prologue._asking, null, { timeout: 12000 }).catch(() => {});
  const ask = await p.evaluate(() => ({ asking: !!Prologue._asking, txt: (document.querySelector('#proElder .peTxt') || {}).textContent || '', name: (document.querySelector('#proElder .peIn') || {}).value || '' }));
  ck('andAsksWhatThePeopleShouldCallTheChief', ask.asking && /call you/i.test(ask.txt) && ask.name.length > 1, JSON.stringify(ask));
  await p.fill('#proElder .peIn', 'Tester');
  await p.click('#proElder [data-act="me"]');
  const end = await endScreen(p);
  const chief = await p.evaluate(() => localStorage.getItem('neo-chief'));
  ck('theNameIsTheChiefs', chief === 'Tester', 'neo-chief ' + chief);
  ck('theFirstWinPaysOneBronzeCard', JSON.stringify(end.runs) === JSON.stringify({ 'pro:1': ['bronze'] }), JSON.stringify(end.runs));
  ck('andTheEndScreenOpensTheJourneysTwoDoors', end.doors.includes('pro-next:Continue the journey') && end.doors.includes('pro-random:Play a random world'), end.doors.join(', '));
  ck('andSaysWhatComesNext', /Growing Clan/.test(end.line), end.line);
  ck('theWinIsKeptOnTheDevice', !!(end.prog.done && end.prog.done[1]), JSON.stringify(end.prog));
  ck('andStaysOffTheWorldBoard', !!end.hold && /journey/i.test(end.hold), end.hold);
  /* THE NEXT GAME WAITS BEHIND THE REWARD (Prologue._armNext): founded once the
     card has settled, held still and unplayed, in the clan's own colour, its
     ground asked for while the player reads — and the reward screen still asks
     its own run (the collection and back, the game a door is tracked for) */
  await p.waitForFunction(() => Prologue.holding() && S.scenario === 'prologue_2', null, { timeout: 20000 }).catch(() => {});
  const pre = await p.evaluate(() => {
    const E = Prologue._endS;
    return { held: Prologue.holding() && S.scenario, cur: Screens.current, endWin: !!(E && E.over && E.over.win), endG: Prologue.endGame(),
      played: S.played, paused: !!S.paused, tunic: S.tunic && S.tunic.P, was: E && E.tunic && E.tunic.P, kept: Prologue.prog().tunic };
  });
  ck('theNextGameWaitsBehindTheReward', pre.held === 'prologue_2' && pre.cur === 'endgame' && pre.endWin && pre.endG === 1 && pre.played === false && pre.paused, JSON.stringify(pre));
  ck('andTheClanKeepsItsColour', !!pre.tunic && pre.tunic === pre.was && pre.tunic === pre.kept, JSON.stringify(pre));
  const col = await p.evaluate(async () => {
    DeckScreens.openCollection('endgame');
    const inCards = Screens.current;
    await new Promise(r => setTimeout(r, 300));
    DeckScreens.closeCollection();
    const doors = [...document.querySelectorAll('[data-act^="pro-"]')].filter(b => b.offsetParent).map(b => b.dataset.act);
    return { inCards, back: Screens.current, doors, held: Prologue.holding() && S.scenario };
  });
  ck('andTheCollectionLeadsBackToTheReward', col.inCards === 'cards' && col.back === 'endgame' && col.doors.includes('pro-next') && col.held === 'prologue_2', JSON.stringify(col));
  // …and CONTINUE THE JOURNEY opens it at once: no plaque, the very world that waited
  await p.waitForFunction(() => { R.cam.z = R.defaultZoom(); return TerrainX.viewFrac() >= 1 && Assets.artReady() && !R._bakeDue && !R._bake; },
    null, { timeout: 30000, polling: 250 }).catch(() => {});
  const go = await p.evaluate(() => {
    window.__held2 = S;
    const b = [...document.querySelectorAll('[data-act="pro-next"]')].find(x => x.offsetParent);
    const t0 = performance.now(); if (b) b.click();
    return { cur: Screens.current, same: S === window.__held2, ms: Math.round(performance.now() - t0), plaque: !!Screens._prepRun };
  });
  ck('continueTheJourneyOpensTheWaitingWorldAtOnce', go.cur === 'playing' && go.same && !go.plaque, JSON.stringify(go));
  await p.waitForTimeout(400);
  const g2 = await p.evaluate(() => ({ begun: Prologue._began === S, scen: S.scenario, endS: !!Prologue._endS }));
  ck('andItIsBegunLikeAnyJourneyGame', g2.begun && g2.scen === 'prologue_2' && !g2.endS, JSON.stringify(g2));
  // GAME 1 AGAIN pays nothing: one card a game, ever
  const again = await p.evaluate(() => {
    const before = Deck.total();
    Scenarios.found('prologue_1');
    const r = Prologue.endCard({});
    return { again: !!(r && r.again), before, after: Deck.total() };
  });
  ck('andAGameWonAgainPaysNothingMore', again.again && again.after === again.before, JSON.stringify(again));
  // CONTINUE THE JOURNEY founds game 2 at once
  await p.evaluate(() => Screens.show('title'));
  await p.waitForTimeout(600);
  const next = await p.evaluate(() => ({ label: (document.querySelector('#btnBegin small') || {}).textContent || '', held: Prologue.holding() && S.scenario }));
  ck('theTitleThenOffersTheSecondGame', /The Growing Clan · 2 of 3/.test(next.label) && next.held === 'prologue_2', JSON.stringify(next));
  await ctx.close();
}

/* ---- 4. game 2, by following the guide: the deck is taught, the hall rises to 3 ---- */
{
  const { p, ctx } = await page('?prologue=1', { 1: Date.now() - 60000 });
  await p.click('#btnBegin');
  await p.waitForFunction(() => Screens.current === 'playing', null, { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(3000);
  const run = await follow(p, 1400);
  ck('gameTwoIsWonByFollowingTheGuideAlone', run.over && run.played >= 1, `over ${run.over} at ${run.clk.toFixed(0)} s, ${run.clicks} taps, cards played ${run.played}, lines ${run.seen.map(s => s.id).join(' › ')}`);
  ck('andEveryLineItSaidWasShortToo', run.said.length > 5 && run.said.every(t => t.split(/\s+/).filter(Boolean).length <= 15), run.said.filter(t => t.split(/\s+/).filter(Boolean).length > 15).join(' | ') || run.said.length + ' lines');
  ck('andEveryTapOfGameTwoWasAnsweredWithinASecond', run.clicks > 4 && !run.slow.length, run.slow.join('; ') || run.clicks + ' taps');
  ck('andItsRingWasNeverDrawnWhereATapCannotLand', !run.blocked.length, run.blocked.join('; ') || 'clear');
  const end = await endScreen(p);
  ck('theSecondWinPaysOneIronCard', JSON.stringify(end.runs) === JSON.stringify({ 'pro:2': ['iron'] }), JSON.stringify(end.runs));
  ck('andOffersTheThirdGame', end.doors.includes('pro-next:Continue the journey') && /Two Roads/.test(end.line), end.doors.join(', ') + ' / ' + end.line);
  // the third game waits behind this reward too, and its origin cards are its first screen
  await p.waitForFunction(() => Prologue.holding() && S.scenario === 'prologue_3', null, { timeout: 20000 }).catch(() => {});
  const g3 = await p.evaluate(() => {
    const held = Prologue.holding() && S.scenario, w = S, endG = Prologue.endGame();
    const b = [...document.querySelectorAll('[data-act="pro-next"]')].find(x => x.offsetParent);
    if (b) b.click();
    return { held, endG, cur: Screens.current, same: S === w };
  });
  ck('andTheThirdGameWaitsBehindItsReward', g3.held === 'prologue_3' && g3.endG === 2 && g3.cur === 'draft' && g3.same, JSON.stringify(g3));
  await ctx.close();
}

/* ---- 5. game 3: the origin cards, the raid, the two roads ---- */
{
  const { p, ctx } = await page('?prologue=1', { 1: Date.now() - 120000, 2: Date.now() - 60000 });
  await p.click('#btnBegin');
  await p.waitForFunction(() => Screens.current === 'draft' || Screens.current === 'playing', null, { timeout: 30000 }).catch(() => {});
  const d = await p.evaluate(() => {
    const ov = document.getElementById('draftOverlay'), el = document.getElementById('proDraft');
    return { cur: Screens.current, overlay: ov ? getComputedStyle(ov).display : 'none', elder: !!(el && el.offsetParent !== null), txt: el ? el.textContent : '' };
  });
  ck('gameThreeOpensOnItsOriginCards', d.cur === 'draft', d.cur);
  ck('andTheGuideExplainsThemInOneLine', d.overlay === 'none' && d.elder && /gift/i.test(d.txt), JSON.stringify(d));
  await p.waitForFunction(() => document.querySelectorAll('#draftCards > .flip').length >= 3, null, { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(600);
  await p.click('#draftCards > .flip >> nth=0'); await p.waitForTimeout(400);
  await p.click('#draftCards > .flip >> nth=0');
  await p.waitForFunction(() => Screens.current === 'playing', null, { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(3000);
  const run = await follow(p, 2400);
  const fin = await p.evaluate(() => ({ win: !!(S.over && S.over.win), cause: S.over && S.over.cause, march: !!(S.pro && S.pro.march), wonder: S.buildings.some(x => x.owner === 'P' && x.key === 'wonder'), done: Object.keys((S.pro && S.pro.done) || {}) }));
  const ids = run.seen.map(s => s.id);
  ck('gameThreeIsWonByFollowingTheGuideAlone', run.over && fin.win, `over ${run.over} at ${run.clk.toFixed(0)} s, ${JSON.stringify(fin)}, ${run.clicks} taps, lines ${ids.join(' › ')}`);
  ck('andTheRaidIsMetAndBeaten', ids.includes('raid') && fin.done.includes('raid'), ids.join(' › ') + ' / done ' + fin.done.join(','));
  ck('andTheWonderIsTheRoadTheGuideWalks', ['save', 'wonder'].every(x => ids.includes(x) && fin.done.includes(x)) && fin.wonder, ids.join(' › ') + ' / done ' + fin.done.join(','));
  ck('andEveryTapOfGameThreeWasAnsweredWithinASecond', run.clicks > 4 && !run.slow.length, run.slow.join('; ') || run.clicks + ' taps');
  ck('andGameThreesRingWasNeverDrawnWhereATapCannotLand', !run.blocked.length, run.blocked.join('; ') || 'clear');
  ck('andEveryLineOfGameThreeWasShort', run.said.every(t => t.split(/\s+/).filter(Boolean).length <= 15), run.said.filter(t => t.split(/\s+/).filter(Boolean).length > 15).join(' | ') || run.said.length + ' lines');
  const end = await endScreen(p);
  ck('theThirdWinPaysOneImperialCard', JSON.stringify(end.runs) === JSON.stringify({ 'pro:3': ['imperial'] }), JSON.stringify(end.runs));
  ck('andTheJourneyEndsOpeningTheWholeGame', end.doors.includes('pro-open:Your own world') && /journey is complete/i.test(end.line) && Object.keys(end.prog.done || {}).length === 3,
    end.doors.join(', ') + ' / ' + end.line);
  const after = await p.evaluate(() => { Screens.show('title'); return { active: Prologue.active(), begin: !!document.getElementById('btnBegin') }; });
  ck('andTheTitleIsTheOrdinaryOneAfter', !after.active && !after.begin, JSON.stringify(after));
  await ctx.close();
}

/* ---- 6. a lost game 3 offers to try it again, in its own world ---- */
{
  const { p, ctx } = await page('?prologue=1', { 1: Date.now() - 120000, 2: Date.now() - 60000 });
  await p.click('#btnBegin');
  await p.waitForFunction(() => Screens.current === 'draft', null, { timeout: 30000 }).catch(() => {});
  await p.evaluate(() => { Cards.pick(0); Screens.enterGame(); });
  await p.waitForFunction(() => Screens.current === 'playing', null, { timeout: 30000 }).catch(() => {});
  await p.evaluate(() => G.end(false, 'The other clan raised their Wonder.', 'rival_wonder'));
  const end = await endScreen(p);
  ck('aLostThirdGameOffersToTryAgain', end.doors.includes('pro-retry:Try again') && /Wonder first/.test(end.line), end.doors.join(', ') + ' / ' + end.line);
  await p.click('.ceBtns [data-act="pro-retry"]');
  await p.waitForFunction(() => Screens.current === 'draft' || Screens.current === 'playing', null, { timeout: 30000 }).catch(() => {});
  const r = await p.evaluate(() => ({ cur: Screens.current, scen: S.scenario, over: !!S.over }));
  ck('andTryAgainFoundsItsOwnWorldAfresh', r.scen === 'prologue_3' && !r.over && (r.cur === 'draft' || r.cur === 'playing'), JSON.stringify(r));
  await ctx.close();
}

/* ---- 7. THE SKIP: two taps, and the ordinary title for good ---- */
{
  const { p, ctx } = await page('?prologue=reset');
  await p.click('#btnSkipJourney');
  const one = await p.evaluate(() => ({ txt: document.getElementById('btnSkipJourney').textContent, skipped: !!Prologue.prog().skipped }));
  await p.click('#btnSkipJourney');
  await p.waitForTimeout(500);
  const two = await p.evaluate(() => {
    const vis = id => { const e = document.getElementById(id); return !!(e && e.offsetParent !== null); };
    return { skipped: !!Prologue.prog().skipped, active: Prologue.active(), begin: !!document.getElementById('btnBegin'), newGame: vis('btnTitleNew'), scen: window.S && S.scenario };
  });
  ck('theSkipAsksBeforeItSkips', /again/i.test(one.txt) && !one.skipped, JSON.stringify(one));
  ck('andTheSecondTapGivesTheOrdinaryTitle', two.skipped && !two.active && !two.begin && two.newGame && !two.scen, JSON.stringify(two));
  await ctx.close();
}

/* ---- 8. OFF: a veteran device, an ordinary world ---- */
{
  const { p, ctx } = await page('?prologue=0');
  const r = await p.evaluate(async () => {
    // a device with a game founded before the journey existed is a veteran
    const q = Prologue._q;
    try { localStorage.removeItem('neo-prologue'); localStorage.setItem('neo-games', '3'); } catch (e) {}
    Prologue._q = null;
    const vet = Prologue.prog().veteran;
    Prologue._q = q;
    // an ordinary world: no scenario, no Elder, the whole build menu
    Screens._demo = false;
    G.newGame('plain-seed', 'calm', 'medium');
    for (let i = 0; i < 4; i++) G.simStep(0.05, 0.05);
    return { vet, scen: S.scenario || null, allow: S.allow || null, elder: !!document.getElementById('proUI') && getComputedStyle(document.getElementById('proUI')).display !== 'none',
      nob: document.body.classList.contains('pro-nobuild'), allows: ['barracks', 'wonder', 'house'].every(k => Scenarios.allows(k)) };
  });
  ck('aVeteranDeviceIsNeverSentOnTheJourney', r.vet === true, 'veteran ' + r.vet);
  ck('anOrdinaryWorldCarriesNoScenarioAndNoElder', !r.scen && !r.elder && !r.nob && r.allows, JSON.stringify(r));
  await ctx.close();
}

for (const [k, v] of Object.entries(res)) console.log((v.startsWith('PASS') ? ' ' : '✗') + ' ' + k + ': ' + v);
if (errs.length) console.log('PAGE ERRORS:', errs.slice(0, 6));
await b.close();
if (fails.length || errs.length) { console.log('FAILURES:', fails.join(', ') || 'pageerrors'); process.exit(1); }
console.log('ALL PROLOGUE CHECKS PASS');
