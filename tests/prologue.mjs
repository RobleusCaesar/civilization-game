/* THE PROLOGUE (js/scenarios.js, js/scenario-maps.js built from
   tools/scenarios/*.json, js/prologue.js, CFG.PROLOGUE, CFG.MODES.prologue_N
   — operator, the Prologue brief: "a new device plays three games in order
   … short, beautiful, obvious, and ends in a win. SIMPLE. SIMPLE. SIMPLE.").

     THE WORLDS   js/scenario-maps.js is the build of the JSON as it stands;
                  every mark the Elder points at stands on the ground it
                  names (the berry bush IS a berry bush — R.fertileKindAt),
                  on ground the village walks to; game 1 shows its whole
                  valley and no rival (berries, wood, stone, a house); game 2
                  is islands and lakes — a deer to hunt, and ground for a
                  road, a barracks, a range, a tower and the three wall
                  sections that close the land bridge (a scout comes out of
                  the wood beyond it, is shot down from the tower, and a
                  section is cut into a gate and opened); game 3 has the
                  worked ground for its lumber camp,
                  quarry and farm, a gold seam, and deals three of the six
                  friendly origins.
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
      // no burned village anywhere in the journey (its old home burned off the map)
      o.ruins = (S.ruins || []).length; o.rubble = 0;
      for (let i = 0; i < S.map.terrain.length; i++) if (S.map.terrain[i] === T.RUIN) o.rubble++;
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
        o.hall = Bld.tcOf('P') && Bld.tcOf('P').level;
        o.relic = !!S.relic;
        /* ISLANDS AND LAKES (operator, build 184): the board's land in pieces
           the sea parts (4-connected, a few tiles or more), lakes the sea
           never reaches (water off the board's edge), and water a large
           share of the playable board */
        const wet = i => S.map.terrain[i] === T.WATER || S.map.terrain[i] === T.MOAT;
        const lab = new Int32Array(W * CFG.H).fill(-1), comps = [];
        for (let y = 1; y < CFG.H - 1; y++) for (let x = 1; x < W - 1; x++) {
          const i0 = y * W + x;
          if (lab[i0] >= 0) continue;
          const w0 = wet(i0), q = [i0], c = { wet: w0, n: 0, edge: false, home: false };
          lab[i0] = comps.length;
          while (q.length) {
            const i = q.pop(), xx = i % W, yy = (i / W) | 0;
            c.n++;
            if (xx <= 1 || yy <= 1 || xx >= W - 2 || yy >= CFG.H - 2) c.edge = true;
            if (has(i)) c.home = true;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const nx = xx + dx, ny = yy + dy, j = ny * W + nx;
              if (!MapGen.onBoard(nx, ny) || lab[j] >= 0 || wet(j) !== w0) continue;
              lab[j] = comps.length; q.push(j);
            }
          }
          comps.push(c);
        }
        let water = 0, board = 0;
        for (let y = 1; y < CFG.H - 1; y++) for (let x = 1; x < W - 1; x++) { board++; if (wet(y * W + x)) water++; }
        o.isles = comps.filter(c => !c.wet && c.n >= 6).length;
        o.lakes = comps.filter(c => c.wet && !c.edge && c.n >= 4).length;
        o.water = +(water / board).toFixed(2);
        // the six lessons' ground: a road, the barracks, the range, the tower, a wall on the bridge
        o.road = place('road', 'roadSite'); o.barracks = place('barracks', 'barracksSite'); o.range = place('range', 'rangeSite');
        o.tower = place('tower', 'towerSite'); o.wall = place('wall', 'wallSite');
        // the deer grazing in sight of the village, and a lodge may stand where it falls
        G.updateVisibility();
        const deer = S.units.filter(u => u.owner === 'W' && u.kind === 'deer');
        const d0 = m.deer && deer.find(u => Math.hypot(u.x - m.deer[0] - 0.5, u.y - m.deer[1] - 0.5) < 1.5);
        // and falls to a villager's first blow (a deer bolts from every blow, away from the hall)
        o.deer = { n: deer.length, mark: !!d0, seen: !!(d0 && G.visibleAt(d0.x | 0, d0.y | 0)), reach: !!(d0 && near(d0.x | 0, d0.y | 0)),
          oneBlow: !!(d0 && d0.hp > 0 && d0.hp <= CFG.UNITS.villager.atk && d0.maxhp === d0.hp) };
        if (d0) { G.noteHunt(d0.x | 0, d0.y | 0); o.lodge = place('lodge', 'deer'); }
        /* THE BRIDGE CLOSED BY THREE SECTIONS (operator, build 187: "place it and
           then place the wall next to it, and then another wall … Then show an
           enemy coming to scout"): each of the line's tiles takes a wall, the
           scout's wood is the mainland the bridge joins, and the three sections
           standing cut it off from the hall's doorstep */
        const lineT = ['wall1', 'wall2', 'wall3'].map(k => m[k]).filter(Boolean);
        o.line = ['wall1', 'wall2', 'wall3'].map(k => place('wall', k));
        const sfI = m.scoutFrom ? m.scoutFrom[1] * W + m.scoutFrom[0] : -1;
        o.scoutWood = sfI >= 0 && has(sfI) && S.map.terrain[sfI] === T.GRASS;
        for (const [x, y] of lineT) Bld.place('P', 'wall', x, y, { free: true, noAutoAssign: true });
        const shut = Path.reachFrom(home, true);
        o.lineShuts = lineT.length === 3 && sfI >= 0 && !!shut && !shut[sfI];
      }
      if (g === 3) {
        o.berryKind = m.berries ? R.fertileKindAt(m.berries[0], m.berries[1]) : null;
        o.barracks = place('barracks', 'barracksSite');
        o.wonder = place('wonder', 'wonderSite');
        // the stations' worked ground (a felled stand, broken rock, picked-bare soil) and the seam
        o.lumber = place('lumber', 'stumps'); o.quarry = place('quarry', 'pebbles'); o.farm = place('farm', 'barren');
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
  // game 1 teaches all three goods (operator, build 184: "Move wood, food and stone education to level 1")
  ck('andItsGreyRocksAreStoneWithinReach', markOn(g1, 'stone', 'HILLS'), JSON.stringify(g1.marks.stone));
  /* THE OLD HOME BURNED OFF THE MAP (operator, build 183: "it doesn't make sense to
     build a new villager next to the burned out village … Removed all the burned out
     buildings"): no journey world lays ruins or their rubble ground */
  ck('noJourneyWorldOpensBesideABurnedVillage', [1, 2, 3].every(g => r[g].ruins === 0 && r[g].rubble === 0),
    [1, 2, 3].map(g => `game ${g}: ${r[g].ruins} ruins, ${r[g].rubble} rubble tiles`).join('; '));
  ck('gameOneShowsItsWholeValleyAndNoRival', g1.seen >= 0.999 && !g1.rival.seen && g1.rival.close >= 5 && g1.build0 === 0,
    `charted ${(g1.seen * 100).toFixed(1)}%, rival halls ${g1.rival.n} seen ${g1.rival.seen} nearest walkable ${g1.rival.close}, menu ${g1.build0}`);
  /* GAME 2 IS ISLANDS AND LAKES (operator, build 184: "Make the level 2 map totally
     different from the last one. It should be something like islands and lakes") */
  ck('gameTwoIsIslandsAndLakes', g2.isles >= 4 && g2.lakes >= 2 && g2.water >= 0.35,
    `${g2.isles} land masses, ${g2.lakes} lakes, water ${g2.water} of the board`);
  ck('andOpensGrownWithNoRelic', g2.hall === 2 && !g2.relic && markOn(g2, 'stone', 'HILLS') && g2.berryKind === 'berry',
    `hall ${g2.hall}, relic ${g2.relic}, stone ${JSON.stringify(g2.marks.stone)}, berry ${g2.berryKind}`);
  ck('gameTwosLessonsStandWhereTheGuideSays', ['road', 'barracks', 'range', 'tower', 'wall'].every(k => g2[k] === 'ok'),
    ['road', 'barracks', 'range', 'tower', 'wall'].map(k => k + ' ' + g2[k]).join(', '));
  ck('andItsThreeWallSectionsCloseTheLandBridge', g2.line.every(v => v === 'ok') && g2.scoutWood && g2.lineShuts,
    `sections ${g2.line.join(', ')}; scout's wood on the mainland ${g2.scoutWood}; closed by the three ${g2.lineShuts}`);
  ck('andItsDeerGrazesInSightWhereALodgeMayStand', g2.deer.mark && g2.deer.seen && g2.deer.reach && g2.lodge === 'ok', JSON.stringify(g2.deer) + ' lodge ' + g2.lodge);
  /* build 185: at a deer's 20 health a villager's hunt bolted it from blow to
     blow, away from the hunter and so from the hall — three hunts in ten ended
     11+ tiles out, and the lodge with them. The lesson deer falls to the first */
  ck('andFallsToTheFirstBlowWhereItGrazes', g2.deer.oneBlow, JSON.stringify(g2.deer));
  ck('gameThreesSitesStandWhereTheGuideSays', g3.barracks === 'ok' && g3.wonder === 'ok' && markOn(g3, 'stone', 'HILLS') && g3.berryKind === 'berry' && markOn(g3, 'gold', 'GOLDORE'),
    `barracks ${g3.barracks}, wonder ${g3.wonder}, stone ${JSON.stringify(g3.marks.stone)}, gold ${JSON.stringify(g3.marks.gold)}, berry ${g3.berryKind}`);
  // the other key buildings (operator, build 184): each station on the ground its own work left
  ck('gameThreesStationsStandOnTheirOwnWorkedGround', g3.lumber === 'ok' && g3.quarry === 'ok' && g3.farm === 'ok'
    && markOn(g3, 'stumps', 'STUMPS') && markOn(g3, 'pebbles', 'PEBBLES') && markOn(g3, 'barren', 'BARREN'),
    `lumber ${g3.lumber}, quarry ${g3.quarry}, farm ${g3.farm}, marks ${['stumps', 'pebbles', 'barren'].map(k => JSON.stringify(g3.marks[k])).join(' ')}`);
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
  /* a line whose instruction NAMES a good ("Send someone to gather berries",
     "Now send someone to cut wood", "…the grey rocks for stone", "A villager
     needs more food. Gather it at the berries.") and a ring drawn on a tile of
     ANOTHER good is the fault the operator met in game 1 (build 185): said
     berries, rang a tree. The instruction is the line's last sentence (the
     first may be a callback — "Berries for tonight." — or the praise of the
     deed before); a sentence naming no good, or two, is not judged */
  const said = E ? E.txt.textContent : '';
  const last = said.split(/(?<=[.!?])\s+/).filter(Boolean).pop() || '';
  const GOODS = { food: /berr(y|ies)|\bfood\b/i, wood: /\bwood|timber|\btrees?\b/i, stone: /\bstone|\brocks?\b/i, gold: /\bgold\b/i };
  const hits = Object.keys(GOODS).filter(k => GOODS[k].test(last));
  const named = hits.length === 1 ? hits[0] : null;
  let wrong = null;
  if (named && r && raw && raw.x !== undefined && !raw.sel) {
    const g = CFG.GATHER[S.map.terrain[(raw.y | 0) * CFG.W + (raw.x | 0)]];
    if (g && g.res !== named) wrong = `said ${named}, rang ${g.res}`;
  }
  return { over: !!S.over, id: line ? (P._aside ? 'aside:' : '') + line.id : '', phase: (line && line.phase) || '', auto: !!(line && line.auto), wrong,
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
  const seen = [], slow = [], blocked = [], wrong = [], said = new Set();
  let clicks = 0, last = '', lastKey = null, keySince = 0, lastTap = null, pend = null;
  let st = await read();
  const t0 = st.clk;
  for (let k = 0; k < 20000 && !st.over && st.clk - t0 < maxT; k++) {
    if (st.id && st.id !== last) { seen.push({ id: st.id }); last = st.id; }
    if (st.open && st.txt && !said.has(st.txt)) said.add(st.txt);
    if (st.blocked && blocked.length < 6) blocked.push(`${st.clk.toFixed(1)}s ${st.id} ${st.key} under ${st.blocked}`);
    if (st.wrong && wrong.length < 6) wrong.push(`${st.clk.toFixed(1)}s ${st.id}: ${st.wrong} ("${st.txt}")`);
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
  return { over: st.over, clk: st.clk - t0, clicks, seen, said: [...said], slow, blocked, wrong, played: st.played };
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
   pace: a mark under the minimap, where a tap moves the camera and nobody is
   sent; a ghost a slip moved onto ground it cannot take, with the guide still
   ringing the greyed ✓; a toast written over the Elder's line). Played in
   game 3 since build 184: its gold seam is a mark a hand is sent to, its farm
   a ghost seated on picked-bare soil — with an origin that plants no station,
   so the farm's line is still to be said ---- */
{
  const { p, ctx } = await page('?prologue=1', { 1: Date.now() - 120000, 2: Date.now() - 60000 });
  await p.click('#btnBegin').catch(() => {});
  await p.waitForFunction(() => Screens.current === 'draft', null, { timeout: 40000 }).catch(() => {});
  await p.evaluate(() => {
    const plants = ['grainkeeper', 'timberwright', 'stoneheart'], h = (S.draft && S.draft.hand) || [];
    let i = h.findIndex(c => !plants.includes(c.key)); if (i < 0) i = 0;
    Cards.pick(i); Screens.enterGame();
  });
  await p.waitForFunction(() => Screens.current === 'playing' && S.scenario === 'prologue_3', null, { timeout: 40000 }).catch(() => {});
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
  // the seam's line, a villager in hand, and its mark parked under the minimap (a player who opened it)
  const pre = await p.evaluate(() => {
    const P = Prologue;
    UI.setMiniCollapsed(false);
    S.pro.i = P._beats.findIndex(b => b.id === 'mine'); P._shown = null; P._aside = null;
    for (let i = 0; i < 4; i++) G.simStep(0.05, 0.05);
    const v = P.vils()[0]; UI.select('unit', v.id);
    const m = P.mark('gold', 1), mini = document.getElementById('miniWrap').getBoundingClientRect();
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
  ck('theGuideNeverRingsAMarkUnderTheMinimap', pre.line === 'mine' && pre.under && !pre.open && post.hit === 'c',
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
    S.pro.i = P._beats.findIndex(b => b.id === 'mine'); P._shown = null; P._aside = null;
    for (let i = 0; i < 4; i++) G.simStep(0.05, 0.05);
    const v = P.vils()[0]; UI.select('unit', v.id);
    const m = P.mark('gold', 1), z = R.cam.z, TL = CFG.TILE;
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

/* ---- 2e. THE RING POINTS AT THE GOOD THE LINE NAMES (operator, build 185:
   "after it asked you to build a house it seems like it then says collect
   berries, but it points you to the wood so it's confusing"). The train
   beat's price was read off CFG.UNITS, which carries none (a villager's price
   is the HALL's train line), so need() fell back to "food if food < wood,
   else wood" — and right after the house, wood is the smaller pile: the line
   said berries, the ring rang a tree. Now a held line's good is the beat's
   own price (`key`, `unit`), the ring sends hands to the very good the line
   named (never spread() under it), and the good is KEPT while still short,
   so two goods short by the same share never trade places under one line.
   And THE TOP BAR ANSWERS THE DEED (the same ruling: "once you start
   collecting berries or chopping wood or mining the stone give a little gold
   flutter around the resource bar … for that icon … do the same thing as
   well for the house and then give a little flutter around the population"):
   the first of each good a game brings home flutters its chip gold, and the
   people chip flutters for the first house's room and the first newborn —
   once each a game, carried in the save, CSS at the screen's own pixels ---- */
{
  const { p, ctx } = await page('?prologue=reset');
  await p.click('#btnBegin').catch(() => {});
  await p.waitForFunction(() => Screens.current === 'playing' && S.scenario === 'prologue_1', null, { timeout: 40000 }).catch(() => {});
  await p.waitForTimeout(3500);   // the establishing glide
  // the reported moment: the house stands, the train beat holds on food, wood the smaller pile
  const tr = await p.evaluate(() => {
    const P = Prologue, tile = t => { if (!t || t.x === undefined) return t && t.u !== undefined ? 'hand' : null; const g = CFG.GATHER[S.map.terrain[(t.y | 0) * CFG.W + (t.x | 0)]]; return g ? g.res : 'none'; };
    for (const id of ['open', 'wood', 'stone', 'house']) { S.pro.done[id] = 1; S.pro.said[id] = 1; }
    S.pro.i = P._beats.findIndex(b => b.id === 'train'); P._shown = null; P._viewKey = null; P._aside = null;
    S.res.food = 30; S.res.wood = 5; S.res.stone = 10;
    for (const u of P.vils()) { u.task = null; u.path = null; }
    UI.deselect && UI.deselect();
    P.simTick(0.05);
    const v0 = P._shown, line0 = P._el.txt.textContent, none = v0.ring.call(P), taps = v0.taps.call(P).map(tile);
    UI.select('unit', P.vils()[0].id);
    P.simTick(0.05);
    const v = P._shown;
    return { id: v.id, phase: v.phase, line: line0, good: v.good, inHand: tile(v.ring.call(P)), none: tile(none), taps, price: JSON.stringify(P.goalCost()) };
  });
  ck('aHeldLineAndItsRingNameOneGood', tr.id === 'train' && tr.phase === 'held' && /needs more food/.test(tr.line) && /berries/.test(tr.line)
    && tr.good === 'food' && tr.inHand === 'food' && tr.none === 'hand' && tr.taps[0] === 'hand' && tr.taps[1] === 'food' && tr.price === '{"food":50}', JSON.stringify(tr));
  // a building's own price, never the hall's; and the named good, never spread(), for the hand in hand
  const bk = await p.evaluate(() => {
    const P = Prologue, tile = t => { if (!t || t.x === undefined) return null; const g = CFG.GATHER[S.map.terrain[(t.y | 0) * CFG.W + (t.x | 0)]]; return g ? g.res : 'none'; };
    UI.deselect && UI.deselect();
    S.pro.done.train = 1; S.pro.said.train = 1;
    const at = id => { S.pro.i = P._beats.findIndex(b => b.id === id); P._shown = null; P._viewKey = null; P._aside = null; P._needS = null; };
    at('house');
    delete S.pro.said.house; delete S.pro.done.house;
    const hc = Bld.effCost('P', 'house');
    S.res.food = 0; S.res.wood = 0; S.res.stone = 0;
    P.simTick(0.05);
    const house = { line: P._el.txt.textContent, good: P._shown.good, price: JSON.stringify(P.goalCost()) };
    // two goods short by the same share: the first named is KEPT while still short
    // (the beat held whatever the stores say, so its price alone decides the good)
    const v = P.vils(), price = { wood: 40, stone: 40 }, hb = P._beats[S.pro.i], when0 = hb.when;
    hb.cost = () => price; hb.when = () => false;
    S.res.wood = 20; S.res.stone = 20; P._needS = null; P._shown = null; P._viewKey = null;
    P.simTick(0.05);
    const first = P._shown.good;
    S.res.stone = 12; P.simTick(0.05);
    const kept = P._shown.good, keptLine = P._el.txt.textContent;
    // a hand already on the named good, another idle in hand: the ring still sends it to the named good
    const w = P.workFor(v[1], first); Units.assignGather(v[1], w.x | 0, w.y | 0);
    UI.select('unit', v[0].id); v[0].task = null; v[0].path = null;
    P.simTick(0.05);
    const ringGood = tile(P._shown.ring.call(P)), spreadWas = P.spread();
    // the named good comes in: the line names the next at once
    S.res[first] = 40; P.simTick(0.05);
    const next = P._shown.good, nextLine = P._el.txt.textContent;
    delete hb.cost; hb.when = when0;
    return { house, first, kept, keptLine, ringGood, spreadWas, next, nextLine };
  });
  ck('andABuildingsHeldLineNamesItsOwnPrice', /A house needs more wood/.test(bk.house.line) && bk.house.good === 'wood' && JSON.parse(bk.house.price).wood > 0, JSON.stringify(bk.house));
  ck('andTheGoodItNamesIsKeptWhileStillShort', bk.first === 'wood' && bk.kept === 'wood' && /wood/.test(bk.keptLine) && bk.next === 'stone' && /stone/.test(bk.nextLine),
    JSON.stringify({ first: bk.first, kept: bk.kept, keptLine: bk.keptLine, next: bk.next, nextLine: bk.nextLine }));
  ck('andTheHandInHandIsSentToThatGoodNeverSpread', bk.ringGood === 'wood' && bk.spreadWas === 'stone', `ring ${bk.ringGood}, spread() would have sent it to ${bk.spreadWas}`);
  await ctx.close();
}
{
  const { p, ctx } = await page('?prologue=reset');
  await p.click('#btnBegin').catch(() => {});
  await p.waitForFunction(() => Screens.current === 'playing' && S.scenario === 'prologue_1', null, { timeout: 40000 }).catch(() => {});
  await p.waitForTimeout(3500);
  // a hand to each good, the sim stepped until each comes home: the fly lands, the chip flutters
  await p.evaluate(() => {
    const P = Prologue, v = P.vils();
    window.__fl = [];
    // each flutter measured as it is drawn: its ring hugging its chip, its sparks, and nothing raster in it
    const real = P.flutter;
    P.flutter = function (c) {
      const ok = real.call(this, c);
      const rings = document.querySelectorAll(`#proFx .pflR[data-chip="${c}"]`), ring = rings[rings.length - 1], chip = document.querySelector(`#topbar [data-chip="${c}"]`);
      // the ring's own box (its animation scales it as it breathes, so never its transformed rect)
      const a = ring && { left: parseFloat(ring.style.left), top: parseFloat(ring.style.top), width: parseFloat(ring.style.width), height: parseFloat(ring.style.height) };
      const b = chip && chip.getBoundingClientRect();
      const fx = [...document.querySelectorAll('#proFx .pflR, #proFx .pflS, #proFx .pflS b')];
      window.__fl.push({ c, ok, at: performance.now(), ring: !!ring, sparks: document.querySelectorAll('#proFx .pflS').length,
        hugs: !!(a && b) && Math.abs(a.left + a.width / 2 - (b.left + b.width / 2)) < 4 && Math.abs(a.top + a.height / 2 - (b.top + b.height / 2)) < 4 && a.width >= b.width,
        raster: fx.some(e => /url\(/.test(getComputedStyle(e).backgroundImage)) });
      return ok;
    };
    [['berries', 0], ['forest', 1], ['stone', 2]].forEach(([m, i]) => { const t = P.mark(m); Units.assignGather(v[i], t.x | 0, t.y | 0); });
    for (let i = 0; i < 400 && !(S.pro.fl.food && S.pro.fl.wood && S.pro.fl.stone); i++) G.simStep(0.05, 0.05);
  });
  await p.waitForFunction(() => ['food', 'wood', 'stone'].every(c => window.__fl.some(f => f.c === c)), null, { timeout: 8000 }).catch(() => {});
  const g = await p.evaluate(() => {
    const out = {};
    for (const c of ['food', 'wood', 'stone']) {
      const f = window.__fl.filter(x => x.c === c);
      out[c] = { fl: S.pro.fl[c], calls: f.length, ok: !!(f[0] && f[0].ok), ring: !!(f[0] && f[0].ring), hugs: !!(f[0] && f[0].hugs), sparks: f[0] ? f[0].sparks : 0 };
    }
    out.raster = window.__fl.some(x => x.raster);
    return out;
  });
  ck('theFirstOfEachGoodFluttersItsChipGold', ['food', 'wood', 'stone'].every(c => g[c].fl === 1 && g[c].calls === 1 && g[c].ok && g[c].ring && g[c].hugs && g[c].sparks > 0),
    JSON.stringify(g));
  ck('andTheFlutterIsDrawnNotPainted', !g.raster, 'a raster in the flutter: ' + g.raster);
  // more of the same good flutters nothing more
  const more = await p.evaluate(() => { for (let i = 0; i < 200; i++) G.simStep(0.05, 0.05); return ['food', 'wood', 'stone'].map(c => window.__fl.filter(f => f.c === c).length); });
  await p.waitForTimeout(300);
  ck('andOnlyOnceAGame', more.every(n => n === 1), JSON.stringify(more));
  // the house's room, then the newborn: the people chip flutters for each, once
  const pop = await p.evaluate(() => {
    const P = Prologue, m = P.mark('houseSite');
    Scenarios.unlock('house'); S.res.wood = Math.max(S.res.wood, 200);
    const cap0 = Bld.popCap('P');
    const h = Bld.place('P', 'house', m.x | 0, m.y | 0);
    const before = window.__fl.filter(f => f.c === 'pop').length;
    G.simStep(0.05, 0.05);
    const site = window.__fl.filter(f => f.c === 'pop').length;   // a site makes no room
    Bld.finish(h);
    G.simStep(0.05, 0.05);
    const room = window.__fl.filter(f => f.c === 'pop').length;
    S.res.food = Math.max(S.res.food, 200);
    const tc = Bld.tcOf('P'); Bld.train(tc, 'villager');
    if (tc.queue[0]) tc.queue[0].t = 0.001;   // trained at once: the newborn is what is measured
    for (let i = 0; i < 400 && P.vils().length <= P._n0; i++) G.simStep(0.05, 0.05);
    G.simStep(0.05, 0.05);
    const born = window.__fl.filter(f => f.c === 'pop').length;
    return { before, site, room, born, cap0, cap: Bld.popCap('P'), fl: S.pro.fl };
  });
  const popRing = await p.evaluate(() => window.__fl.filter(f => f.c === 'pop').every(f => f.ok && f.ring && f.hugs));
  ck('theHousesRoomFluttersThePeopleChip', pop.before === 0 && pop.site === 0 && pop.room === 1 && pop.cap > pop.cap0 && pop.fl.room === 1, JSON.stringify(pop));
  ck('andSoDoesTheFirstNewborn', pop.born === 2 && pop.fl.born === 1 && popRing, JSON.stringify({ born: pop.born, fl: pop.fl, popRing }));
  // the save carries what was answered: a reload flutters nothing again; an older save, nothing at all
  const re = await p.evaluate(() => {
    const n0 = window.__fl.length, js = G.saveJSON ? G.saveJSON() : JSON.stringify(S);
    G.loadJSON(js); Prologue.onWorldChange();
    for (let i = 0; i < 40; i++) G.simStep(0.05, 0.05);
    const again = window.__fl.length - n0;
    const old = JSON.parse(js); delete old.pro.fl;
    G.loadJSON(JSON.stringify(old)); Prologue.onWorldChange();
    for (let i = 0; i < 40; i++) G.simStep(0.05, 0.05);
    return { again, old: window.__fl.length - n0 - again, fl: S.pro.fl };
  });
  ck('aContinueFluttersNothingTwice', re.again === 0 && re.old === 0 && re.fl.food === 1 && re.fl.room === 1, JSON.stringify(re));
  await ctx.close();
}

/* ---- 2f. THE CARD STAYS AT THE TOP AND CARRIES THE TASK (operator, build 186,
   with two phone shots: "The instructions keep changing from the bottom to the
   top. Since the build menu is in the bottom, let's fix the instructions to the
   top, so they don't shift all over the place. Additionally, instead a separate
   gold tag for the task (e.g. Build a Wall), why don't we incorporate that into
   the image text, maybe where it says Mira … The key is not to make the
   instructions any taller … the 'New' tag in the build menu is cut off").
     ONE SEAT    the card stands under the top bar whatever its line points at
                 — the Build tab, a card in the open menu, a villager low or
                 high on the screen (the look brings a covered target out
                 below it); the old seats flipped between the foot and the
                 top with the target
     THE TASK    there is no separate tracker: the card's header line — where
                 her name stood — carries the standing objective, her name is
                 a plate on her portrait, and the card is exactly as tall as
                 the same line was under the old "MIRA" header; on the
                 operator's 430px phone no deed of the journey is cut short
     FOLDED      a strip in the card's own corner, with the same task line;
                 a tap opens the card where it was
     THE MAP     opened over the card's corner, it stands below the card
     NEW         a build card's NEW tag is whole inside the menu, and the card
                 itself has not moved ---- */
{
  const ctx = await b.newContext({ viewport: { width: 430, height: 727 }, deviceScaleFactor: 2 });
  await ctx.addInitScript((d) => {
    try { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('neo-prologue', JSON.stringify({ v: 1, at: Date.now() - 600000, veteran: false, done: d })); sessionStorage.setItem('seeded', '1'); } } catch (e) {}
  }, { 1: Date.now() - 60000 });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto('file://' + join(root, 'index.html') + '?prologue=1', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.Screens && Screens.current === 'title' && !document.getElementById('splash'), null, { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(500);
  await p.click('#btnBegin').catch(() => {});
  await p.waitForFunction(() => Screens.current === 'playing' && S.scenario === 'prologue_2', null, { timeout: 40000 }).catch(() => {});
  await p.waitForTimeout(3500);   // the establishing glide
  const at = (id, res) => p.evaluate(([id, res]) => {
    const P = Prologue;
    if (UI.cancelPlacement) UI.cancelPlacement();
    UI.deselect && UI.deselect();
    if (UI.setMenuCollapsed) UI.setMenuCollapsed(true);
    Object.assign(S.res, res);
    // the beat afresh: a line once asked stays asked, whatever the stores do after
    delete S.pro.said[id]; delete S.pro.done[id];
    S.pro.i = P._beats.findIndex(x => x.id === id); P._shown = null; P._viewKey = null; P._aside = null;
    P._collapsed = false; P._userHid = false;
    for (let i = 0; i < 4; i++) G.simStep(0.05, 0.05);
    return P._shown && P._shown.id;
  }, [id, res]);
  const card = () => p.evaluate(() => {
    const E = Prologue._dom(), r = E.elder.getBoundingClientRect(), ring = Prologue._el.ring;
    const rr = ring.style.display !== 'none' ? ring.getBoundingClientRect() : null;
    return { shown: E.elder.style.display !== 'none', x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: r.height,
      bottom: r.bottom, ring: rr && { x: rr.left + rr.width / 2, y: rr.top + rr.height / 2 }, sel: (Prologue._shown && Prologue._shown.ring && (Prologue._shown.ring.call(Prologue) || {}).sel) || null };
  });
  // the tower beat, its line pointing four ways
  const seen = [];
  await at('tower', { wood: 200, stone: 200, gold: 100 });
  await p.waitForTimeout(500);
  seen.push(['the Build tab', await card()]);
  await p.evaluate(() => { UI.deselect && UI.deselect(); if (UI.setMenuCollapsed) UI.setMenuCollapsed(false); });
  await p.waitForTimeout(700);
  seen.push(['a card in the open menu', await card()]);
  // a villager to send, parked under the card's own seat: the look brings it out below
  await at('tower', { wood: 10, stone: 5 });
  await p.evaluate(() => {
    const P = Prologue, s = P._seatBox, ring = P._shown.ring.call(P), z = R.cam.z, TL = CFG.TILE;
    if (!ring || ring.u === undefined && ring.x === undefined) return;
    const u = ring.u !== undefined ? Units.get(ring.u) : null, wx = u ? u.x : ring.x, wy = u ? u.y - CFG.SPRITE_LIFT / TL : ring.y;
    R.cam.x = wx * TL - (s.x + s.w / 2) / z; R.cam.y = wy * TL - (s.y + s.h / 2) / z; if (R.clampCam) R.clampCam();
    P._looked = null; P._lookStuck = null;
  });
  await p.waitForTimeout(1200);   // the look's glide
  const low = await card();
  seen.push(['a target that was under it', low]);
  const under = await p.evaluate(() => { const P = Prologue, t = P._resolve(P._shown.ring.call(P)); return t ? { covered: P._seatCovers(P._seatBox, P._seatBox.w, P._seatBox.h, t), hit: (document.elementFromPoint(t.x, t.y) || {}).id } : null; });
  const s0 = seen[0][1];
  ck('theCardStaysAtTheTopWhateverItsLinePointsAt', seen.every(([, c]) => c.shown && c.x === s0.x && c.y === s0.y) && s0.y < 727 * 0.25
    && seen[0][1].sel === '#bmToggle' && /^\.bbtn/.test(seen[1][1].sel || '') && !seen[2][1].sel,
    seen.map(([k, c]) => `${k} (${c.sel || 'the world'}): ${c.shown ? c.x + ',' + c.y : 'hidden'}`).join('; '));
  ck('andATargetUnderItIsBroughtOutBelow', !!under && !under.covered && under.hit === 'c' && !!low.ring && low.ring.y > low.bottom, JSON.stringify({ under, ring: low.ring, cardBottom: low.bottom }));
  // the task rides in the card: no tracker, the header line carries it, her name is on her portrait
  const task = await p.evaluate(() => {
    const E = Prologue._dom(), row = E.elder.querySelector('.peTask'), nm = E.elder.querySelector('.peName'), pic = E.elder.querySelector('.pePic');
    const rr = row.getBoundingClientRect(), cs = getComputedStyle(row), er = E.elder.getBoundingClientRect(), nr = nm.getBoundingClientRect();
    return { tracker: !!document.getElementById('proGoal'), text: row.textContent, head: row.querySelector('.pgt').textContent,
      icons: row.querySelectorAll('.pgn svg').length, oneLine: rr.height <= 13.5, foot: rr.height + parseFloat(cs.marginBottom),
      name: nm.textContent, onPic: pic.contains(nm), plateIn: nr.bottom <= er.bottom - 5 && nr.top >= er.top };
  });
  ck('theTaskRidesInTheCardWhereHerNameStood', !task.tracker && task.head === 'Build a watchtower' && task.icons === 2 && task.oneLine && task.foot <= 16.6 && /Wood 10\/45/.test(task.text),
    JSON.stringify(task));
  ck('andHerNameIsAPlateOnHerPortrait', task.name === 'Mira' && task.onPic && task.plateIn, JSON.stringify({ name: task.name, onPic: task.onPic, plateIn: task.plateIn }));
  // no taller: the same line under the old "MIRA" header (11.5px, 5px under it) measures the same card
  const tall = await p.evaluate(async () => {
    const E = Prologue._dom(), row = E.elder.querySelector('.peTask'), out = [];
    for (const line of ['Build a watchtower.', 'A tower needs more stone. Gather it at the grey rocks.', 'Walls keep raiders out. Build one on the land bridge, where the riders will come across.']) {
      Prologue._shown = Object.assign({}, Prologue._shown, { text: line }); Prologue.say(line, 'point');
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const now = E.elder.getBoundingClientRect().height;
      const old = document.createElement('b');
      old.textContent = 'Mira'; old.style.cssText = "display:block;font:700 11.5px/1 'Cinzel','Times New Roman',Georgia,serif;letter-spacing:1.6px;text-transform:uppercase;margin:0 0 5px";
      row.style.display = 'none'; row.parentNode.insertBefore(old, row);
      const was = E.elder.getBoundingClientRect().height;
      old.remove(); row.style.display = '';
      out.push({ line: line.length, now: Math.round(now * 10) / 10, was: Math.round(was * 10) / 10 });
    }
    return out;
  });
  ck('andTheCardIsNoTallerForCarryingIt', tall.every(t => t.now <= t.was + 0.5), JSON.stringify(tall));
  // folded: a strip in the card's own corner with the same task, and a tap opens the card where it was
  await p.click('#proElder .peHide');
  await p.waitForTimeout(300);
  const fold = await p.evaluate(() => { const m = document.getElementById('proMini'), r = m.getBoundingClientRect(); return { shown: getComputedStyle(m).display !== 'none', x: Math.round(r.left), y: Math.round(r.top), h: r.height, task: m.querySelector('.peTask').textContent, card: getComputedStyle(document.getElementById('proElder')).display }; });
  await p.click('#proMini');
  await p.waitForTimeout(300);
  const back = await card();
  ck('foldedTheCardIsAStripInItsOwnCornerThatKeepsTheTask', fold.shown && fold.card === 'none' && fold.x === s0.x && fold.y === s0.y && fold.h <= 48 && /Build a watchtower/.test(fold.task) && back.shown && back.x === s0.x && back.y === s0.y,
    JSON.stringify({ fold, back: { shown: back.shown, x: back.x, y: back.y } }));
  // an opened map stands below the open card, and back in its corner beside the strip
  const map = await p.evaluate(async () => {
    UI.setMiniCollapsed(false);
    await new Promise(r => setTimeout(r, 250));
    const mr = document.getElementById('miniWrap').getBoundingClientRect(), er = document.getElementById('proElder').getBoundingClientRect();
    Prologue._collapsed = true;
    await new Promise(r => setTimeout(r, 250));
    const mr2 = document.getElementById('miniWrap').getBoundingClientRect(), sr = document.getElementById('proMini').getBoundingClientRect();
    Prologue._collapsed = false;
    UI.setMiniCollapsed(true);
    await new Promise(r => setTimeout(r, 100));
    return { mapTop: mr.top, cardBottom: er.bottom, mapTop2: mr2.top, stripRight: sr.right, mapLeft2: mr2.left };
  });
  ck('anOpenedMapStandsBelowTheCard', map.mapTop >= map.cardBottom && map.mapTop2 < map.cardBottom && map.stripRight <= map.mapLeft2, JSON.stringify(map));
  // no deed of the journey is cut short on this 430px phone, its goods at their longest
  const cut = await p.evaluate(async () => {
    const P = Prologue, E = P._dom(), row = E.elder.querySelector('.peTask'), out = [];
    for (const g of [1, 2, 3]) {
      const beats = (P.SCRIPTS[g] ? P.SCRIPTS[g].call(P) : []);
      for (const b of beats) {
        if (!b.goal) continue;
        // every good one short of its price: the longest numbers the line can show
        const real = P.costLine, realH = P.hallNeeds, realA = P.afford, realA2 = P.afford2;
        const long = c => Object.keys(c || {}).filter(k => c[k]).map(k => k[0].toUpperCase() + k.slice(1) + ' ' + (c[k] - 1) + '/' + c[k]).join(' · ');
        // game 3's monument is a fraction of the full price (CFG.MODES.prologue_3.wonderCost), as Bld.effCost reads it there
        const price = key => { const c = Bld.effCost('P', key), f = key === 'wonder' && (CFG.MODES['prologue_' + g] || {}).wonderCost;
          const base = Bld.buildSpec('wonder', 'P').lv.cost;
          return f ? Object.fromEntries(Object.entries(base).map(([k, v]) => [k, Math.round(v * (f[k] != null ? f[k] : 1))])) : c; };
        P.costLine = key => long(price(key)); P.afford = () => false; P.afford2 = () => false;
        P.hallNeeds = () => long(Scenarios.RULES['prologue_' + g].tc[g + 1].cost) + ' · Buildings 2/3';
        let txt = '';
        try { txt = typeof b.goal === 'function' ? b.goal.call(P) : b.goal; } catch (e) { txt = ''; }
        P.costLine = real; P.hallNeeds = realH; P.afford = realA; P.afford2 = realA2;
        if (!txt) continue;
        P._goalBeat = { goal: txt }; P._task(E); P._fitTask(row);
        const t = row.querySelector('.pgt');
        out.push({ g, id: b.id, txt, cut: t.scrollWidth > t.clientWidth + 0.5, fit: row.className.replace('peTask', '').trim() });
      }
    }
    P._goalBeat = null; P._taskTxt = null;
    return out;
  });
  const cutShort = cut.filter(c => c.cut);
  ck('noDeedOfTheJourneyIsCutShortOnThisPhone', cut.length >= 20 && !cutShort.length, cutShort.length ? cutShort.map(c => `g${c.g} ${c.id}: "${c.txt}" (${c.fit})`).join('; ') : cut.length + ' task lines whole');
  // the NEW tag is whole inside the menu, and the card under it has not moved
  const nw = await p.evaluate(async () => {
    UI.deselect && UI.deselect(); if (UI.setMenuCollapsed) UI.setMenuCollapsed(false);
    await new Promise(r => setTimeout(r, 300));
    const c = document.querySelector('#buildmenu .bbtn.new'), m = document.getElementById('buildmenu'), bar = document.getElementById('bottombar');
    if (!c) return null;
    const cr = c.getBoundingClientRect(), mr = m.getBoundingClientRect(), br = bar.getBoundingClientRect(), tag = getComputedStyle(c, '::before');
    return { tagTop: cr.top + parseFloat(tag.top), menuTop: mr.top, cardTop: cr.top, barTop: br.top, barPad: parseFloat(getComputedStyle(bar).paddingTop), content: tag.content };
  });
  ck('aNewTagIsWholeInsideTheMenu', !!nw && /NEW/.test(nw.content) && nw.tagTop >= nw.menuTop - 0.5 && Math.abs(nw.cardTop - (nw.barTop + nw.barPad)) <= 1, JSON.stringify(nw));
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
  // and says in a breath why the clan starts again: another clan burned its home (the hook of game 3)
  ck('andSaysAnotherClanBurnedTheOldHome', /another clan/i.test(e1.txt) && /burn/i.test(e1.txt), e1.txt);
  const run = await follow(p, 700);
  ck('gameOneIsWonByFollowingTheGuideAlone', run.over && run.clicks > 4, `over ${run.over} at ${run.clk.toFixed(0)} s of play, ${run.clicks} taps, lines ${run.seen.map(s => s.id).join(' › ')}`);
  ck('andEveryLineItSaidWasShort', run.said.length > 5 && run.said.every(t => t.split(/\s+/).filter(Boolean).length <= 15), run.said.filter(t => t.split(/\s+/).filter(Boolean).length > 15).join(' | ') || run.said.length + ' lines');
  ck('andEveryTapWasAnsweredWithinASecond', run.clicks > 4 && !run.slow.length, run.slow.join('; ') || run.clicks + ' taps');
  ck('andTheRingWasNeverDrawnWhereATapCannotLand', !run.blocked.length, run.blocked.join('; ') || 'clear');
  ck('andItRangTheGoodItsLineNamed', !run.wrong.length, run.wrong.join('; ') || 'agreed');
  const win = await p.evaluate(() => ({ win: !!(S.over && S.over.win), cause: S.over && S.over.cause, cur: Screens.current, txt: (document.querySelector('#proElder .peTxt') || {}).textContent || '',
    done: Object.keys((S.pro && S.pro.done) || {}) }));
  // food, wood and stone, then a roof and a new villager (operator, build 184)
  ck('andGameOneTeachesFoodWoodAndStone', ['open', 'wood', 'stone', 'house', 'train'].every(k => win.done.includes(k)), win.done.join(', '));
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
  // the scout's wounds, and who dealt them: an archer up the tower, by the arrows' own source
  await p.evaluate(() => {
    window.__scout = { hits: 0, fromTower: 0, wall: 0, toasts: [] };
    const dmg = Units.damage;
    Units.damage = function (u, amt, by) {
      if (u && u.proScout) { window.__scout.hits++; const a = by && Units.get(by); if (a && a.perch) window.__scout.fromTower++; }
      return dmg.apply(this, arguments);
    };
    const bd = Bld.damage;
    Bld.damage = function (b, amt) { if (b && b.owner === 'P' && b.key === 'wall' && Prologue.scout && Prologue.scout()) window.__scout.wall++; return bd.apply(this, arguments); };
    const t = UI._showToast;
    if (t) UI._showToast = function (msg) { if (Prologue._shown && /^(wall|scout|gate)/.test(Prologue._shown.id)) window.__scout.toasts.push(String(msg)); return t.apply(this, arguments); };
  });
  const run = await follow(p, 1400);
  const g2w = await p.evaluate(() => ({ done: Object.keys((S.pro && S.pro.done) || {}),
    has: ['lodge', 'barracks', 'range', 'tower', 'wall', 'gate'].filter(k => S.buildings.some(b => b.owner === 'P' && b.key === k)),
    line: Prologue.lineForts().map(b => b.key + (b.construction > 0 ? ' site' : '') + (b.raised ? ' shut' : '')),
    scout: window.__scout, scoutLeft: !!Prologue.scout(),
    roads: Object.keys((S.map && S.map.roads) || {}).length + S.buildings.filter(b => b.owner === 'P' && b.key === 'road').length,
    up: S.units.filter(u => u.owner === 'P' && window.Lookout && Lookout.sentUp(u)).length,
    lodgeAt: (S.buildings.find(b => b.owner === 'P' && b.key === 'lodge') || {}), tc: Bld.tcOf('P') }));
  const lodgeD = g2w.lodgeAt.x != null ? Math.hypot(g2w.lodgeAt.x - g2w.tc.x, g2w.lodgeAt.y - g2w.tc.y) : 99;
  /* THE LAKE ISLES' SIX WORKS (operator, build 184: "Add roads, hunters lodge, barracks,
     archers towers and walls to level 2"): each taught and standing, an archer on the
     tower, and the deer — held grazing until the hunter came — fallen near home */
  ck('gameTwoTeachesTheHuntRoadsAndDefences', ['hunt', 'lodge', 'road', 'barracks', 'range', 'tower', 'man', 'wall', 'deck'].every(k => g2w.done.includes(k))
    && g2w.has.length === 6 && g2w.roads > 0 && g2w.up > 0 && lodgeD < 10,
    `taught ${g2w.done.join(', ')}; standing ${g2w.has.join(', ')}; road tiles ${g2w.roads}; archers up ${g2w.up}; lodge ${lodgeD.toFixed(1)} tiles from the hall`);
  /* THE WALL, THE SCOUT AND THE GATE (operator, build 187): three sections laid one
     beside the other close the bridge, a scout comes out of the wood to the finished
     wall and falls to the archer on the tower (his blows land on the wall, never on
     anyone behind it), then a section is cut into a gate and the gate is opened —
     and while those lines are up the line tool says nothing over the guide */
  const order = run.seen.map(s => s.id), at = id => order.indexOf(id);
  ck('andItLaysTheWallASectionAtATimeUntilTheBridgeIsClosed', ['wall', 'wall2', 'wall3'].every(k => g2w.done.includes(k)) && at('wall') < at('wall2') && at('wall2') < at('wall3')
    && g2w.line.length === 3, `lines ${order.join(' › ')}; the line ${g2w.line.join(', ')}`);
  ck('thenAScoutComesToTheWallAndFallsToTheTowersArcher', g2w.done.includes('scout') && at('scout') > at('wall3') && !g2w.scoutLeft
    && g2w.scout.fromTower >= 3 && g2w.scout.fromTower === g2w.scout.hits, JSON.stringify(g2w.scout));
  ck('thenASectionIsCutIntoAGateAndOpened', ['gate', 'opengate'].every(k => g2w.done.includes(k)) && at('gate') > at('scout') && at('opengate') > at('gate') && at('deck') > at('opengate')
    && g2w.line.filter(x => x === 'gate').length === 1 && g2w.line.filter(x => x === 'wall').length === 2, `the line ${g2w.line.join(', ')}; lines ${order.join(' › ')}`);
  ck('andTheLineToolSaysNothingOverTheGuide', !g2w.scout.toasts.some(t => /Drag along|Wall line|needs a builder|walled in|under attack/i.test(t)), g2w.scout.toasts.join(' | ') || 'quiet');
  ck('gameTwoIsWonByFollowingTheGuideAlone', run.over && run.played >= 1, `over ${run.over} at ${run.clk.toFixed(0)} s, ${run.clicks} taps, cards played ${run.played}, lines ${run.seen.map(s => s.id).join(' › ')}`);
  ck('andEveryLineItSaidWasShortToo', run.said.length > 5 && run.said.every(t => t.split(/\s+/).filter(Boolean).length <= 15), run.said.filter(t => t.split(/\s+/).filter(Boolean).length > 15).join(' | ') || run.said.length + ' lines');
  ck('andEveryTapOfGameTwoWasAnsweredWithinASecond', run.clicks > 4 && !run.slow.length, run.slow.join('; ') || run.clicks + ' taps');
  ck('andItsRingWasNeverDrawnWhereATapCannotLand', !run.blocked.length, run.blocked.join('; ') || 'clear');
  ck('andItRangTheGoodItsLineNamed', !run.wrong.length, run.wrong.join('; ') || 'agreed');
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
  const fin = await p.evaluate(() => ({ win: !!(S.over && S.over.win), cause: S.over && S.over.cause, march: !!(S.pro && S.pro.march), wonder: S.buildings.some(x => x.owner === 'P' && x.key === 'wonder'), done: Object.keys((S.pro && S.pro.done) || {}),
    has: ['lumber', 'quarry', 'farm', 'mine'].filter(k => S.buildings.some(b => b.owner === 'P' && b.key === k)), allow: S.allow.slice() }));
  const ids = run.seen.map(s => s.id);
  ck('gameThreeIsWonByFollowingTheGuideAlone', run.over && fin.win, `over ${run.over} at ${run.clk.toFixed(0)} s, ${JSON.stringify(fin)}, ${run.clicks} taps, lines ${ids.join(' › ')}`);
  ck('andTheRaidIsMetAndBeaten', ids.includes('raid') && fin.done.includes('raid'), ids.join(' › ') + ' / done ' + fin.done.join(','));
  /* THE OTHER KEY BUILDINGS (operator, build 184): a lumber camp, a quarry and a farm on
     their own worked ground, and the gold seam claimed — each taught (or planted by the
     origin, its card opened all the same) before the raid */
  ck('andGameThreeTeachesTheStationsAndTheSeam', ['lumber', 'quarry', 'farm', 'mine'].every(k => fin.done.includes(k) && fin.has.includes(k))
    && ['lumber', 'quarry', 'farm'].every(k => fin.allow.includes(k)) && ids.indexOf('raid') > Math.max(...['lumber', 'quarry', 'farm', 'mine'].map(k => ids.indexOf(k))),
    `done ${fin.done.join(',')}; standing ${fin.has.join(',')}; menu ${fin.allow.join(',')}; lines ${ids.join(' › ')}`);
  ck('andTheWonderIsTheRoadTheGuideWalks', ['save', 'wonder'].every(x => ids.includes(x) && fin.done.includes(x)) && fin.wonder, ids.join(' › ') + ' / done ' + fin.done.join(','));
  ck('andEveryTapOfGameThreeWasAnsweredWithinASecond', run.clicks > 4 && !run.slow.length, run.slow.join('; ') || run.clicks + ' taps');
  ck('andGameThreesRingWasNeverDrawnWhereATapCannotLand', !run.blocked.length, run.blocked.join('; ') || 'clear');
  ck('andItRangTheGoodItsLineNamed', !run.wrong.length, run.wrong.join('; ') || 'agreed');
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
