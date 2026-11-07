/* BATTLE FX — the fight as a picture (js/battlefx.js, build 160).
   Operator, 2026-11-07: "Add more sprites to fights so the animations are
   smoother… 1-2 unique fighting animations per fighter type… dying sprites…
   leave the bodies on the ground for a few seconds… very very mild blood…
   arrows sticking out of the ground when shots are missed… small craters…
   small explosions, if they're on fire… more pixels and sprites for siege
   shots, especially when they crash against buildings."

   What this pins:
   §1 the kill switch: BattleFX.ON false draws nothing and changes no strike
   §2 a picture only: no write to S, no draw from the run's RNG, nothing in a save
   §3 fog-honest: nothing written on ground the player cannot see
   §4 every pool is capped
   §5 THE STRIKE LANDS ON THE BLOW: the impact frame is on screen the instant
      the cooldown resets (the blow), the frame before it while the next is due
   §6 variety: a fighter with fight2/fight3 picks one per blow, never the same
      twice running; a bow on a platform keeps its one strip; the wild keeps its tempo
   §7 the dead lie BODY_S seconds, then go — and the pool spreads under them
   §8 a miss stands in the ground (a ripple on water); a stone digs a crater,
      a bolt digs nothing, a stone into a building flinches it
   §9 the battle strips are LAZY (none at boot, a character's when one is drawn),
      the table names exactly the files on disk, every impact frame is inside
      its strip, and every death ends lying down
   §10 nothing in the black: every pass is clipped to the board

     node tests/battle-fx.mjs      # exits non-zero on any regression */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdirSync, existsSync } from 'node:fs';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: 900, height: 700 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
const asked = [];
p.on('request', r => { const u = r.url(); if (/unit-.*-(fight2|fight3|die)\.png/.test(u)) asked.push(u); });
await p.goto('file://' + join(root, 'index.html'), { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.Screens && Screens.current === 'title', null, { timeout: 60000 });
await p.waitForTimeout(1500);
const atBoot = asked.length;

const res = {}, fails = [];
const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };

ck('theTitleAsksForNoBattleStrip', atBoot === 0, atBoot + ' asked at boot');

/* ---- the table names exactly the files on disk ---- */
const DIRS = ['s', 'se', 'e', 'ne', 'n', 'nw', 'w', 'sw'];
const table = await p.evaluate(() => ({ art: Assets.BATTLE_ART, strike: BattleFX.STRIKE_AT }));
{
  const onDisk = readdirSync(join(root, 'assets/units')).filter(f => /^unit-.*-(fight2|fight3|die)\.png$/.test(f));
  const listed = new Set();
  let missing = [];
  for (const [key, poses] of Object.entries(table.art)) for (const [pose, mask] of Object.entries(poses))
    DIRS.forEach((d, i) => { if (mask & (1 << i)) { const f = 'unit-' + key + '-' + d + '-' + pose + '.png'; listed.add(f); if (!existsSync(join(root, 'assets/units', f))) missing.push(f); } });
  const orphan = onDisk.filter(f => !listed.has(f));
  ck('theBattleTableNamesExactlyTheFilesOnDisk', !missing.length && !orphan.length,
    listed.size + ' listed; missing ' + missing.slice(0, 4).join(',') + ' orphan ' + orphan.slice(0, 4).join(','));
}

const out = await p.evaluate(async (DIRS) => {
  const res = {}, fails = [];
  const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };
  Screens._demo = false;
  G.newGame('battle-fx', 'moderate', 'medium');
  Screens.show('playing'); S.paused = true; S.peace = false; G.freeVis = true; G.updateVisibility();
  // the people's strips (the defender's among them) are on the page before the checks read them
  for (let i = 0; i < 400 && !(Assets.artReady && Assets.artReady()); i++) await new Promise(r => setTimeout(r, 100));
  Assets.loadMilitaryArt && Assets.loadMilitaryArt('P', false, ['defender', 'axeman', 'archer', 'elite']);
  for (let i = 0; i < 100 && !(Assets.unitArt['defender-p-' + G.tunicOf('P')] && Assets.unitArt['defender-p-' + G.tunicOf('P')].dirs.s && Assets.unitArt['defender-p-' + G.tunicOf('P')].dirs.s.fight); i++) await new Promise(r => setTimeout(r, 100));
  // a field of open, visible grass to stage on
  let fx = 0, fy = 0;
  for (let y = 4; y < CFG.H - 4 && !fx; y++) for (let x = 4; x < CFG.W - 4; x++) {
    let ok = true;
    for (let dy = -2; dy <= 2 && ok; dy++) for (let dx = -2; dx <= 2; dx++)
      if (S.map.terrain[MapGen.idx(x + dx, y + dy)] !== T.GRASS || Bld.at(x + dx, y + dy)) { ok = false; break; }
    if (ok) { fx = x + 0.5; fy = y + 0.5; break; }
  }
  const clear = () => BattleFX.reset();
  const step = (secs) => { const was = S.paused; S.paused = false; for (let t = 0; t < secs; t += 0.05) BattleFX.beginFrame(0.05); S.paused = was; };
  const kill = (kind, owner, x, y) => {
    const u = Units.spawn(kind, owner, x, y);
    BattleFX.onDeath(u, null, owner === 'P' ? 'A' : 'P');
    Units.despawn(u);
  };

  /* ---- §1 the kill switch ---- */
  {
    clear(); BattleFX.ON = false;
    const u = Units.spawn('defender', 'P', fx, fy);
    BattleFX.onHit(u, 30, null); BattleFX.onDeath(u, null, 'A');
    BattleFX.arrowLanded({ miss: true, x1: fx - 3, y1: fy, x2: fx, y2: fy });
    BattleFX.siegeLanded({ kind: 'stone', x2: fx, y2: fy }, null);
    const ps = BattleFX.pickStrike(u, { fight: [1, 2, 3], fight2: [4, 5, 6] }, [1, 2, 3], 'fight', 's', 'defender-p-blue');
    const pools = BattleFX.bodies.length + BattleFX.stains.length + BattleFX.arrows.length + BattleFX.craters.length + BattleFX.chips.length + BattleFX.bursts.length;
    ck('theKillSwitchDrawsNothingAndChangesNoStrike', pools === 0 && ps.k === null, pools + ' pooled, k=' + ps.k);
    BattleFX.ON = true; Units.despawn(u);
  }

  /* ---- §2 a picture only ---- */
  {
    clear();
    const pairs = [];
    for (let i = 0; i < 6; i++) pairs.push([Units.spawn(i % 2 ? 'axeman' : 'archer', i % 2 ? 'A' : 'P', fx + (i - 3) * 0.6, fy), Units.spawn('archer', 'P', fx - 3, fy)]);
    const before = G.saveJSON(), rng = S.rngState;
    for (const [u, a] of pairs) { BattleFX.onHit(u, 30, a); BattleFX.onDeath(u, a, 'P'); }
    BattleFX.arrowLanded({ miss: true, x1: fx - 3, y1: fy, x2: fx + 0.3, y2: fy + 0.4 });
    BattleFX.siegeLanded({ kind: 'flame', fx: 'firestorm', x2: fx + 1, y2: fy }, null);
    BattleFX.siegeLanded({ kind: 'stone', fx: 'blast', x2: fx - 1, y2: fy }, null);
    step(2);
    const c = document.createElement('canvas').getContext('2d');
    BattleFX.drawGround(c); BattleFX.prepFlush(); BattleFX.flush(c, 1e9); BattleFX.drawAir(c);
    const after = G.saveJSON();
    ck('aBattleWritesNothingToTheRun', before === after, before.length + ' / ' + after.length + ' bytes');
    ck('andDrawsNothingFromItsRng', S.rngState === rng, rng + ' → ' + S.rngState);
    ck('andItsPoolsLiveOffTheState', !after.includes('"bodies"') && !after.includes('"craters"') && !after.includes('"stains"'));
    for (const [u, a] of pairs) S.units = S.units.filter(z => z !== u && z !== a);
  }

  /* ---- §3 fog-honest ---- */
  {
    clear();
    G.freeVis = false; G.updateVisibility();
    // a tile nobody of the player's can see
    let hx = -1, hy = -1;
    for (let y = 2; y < CFG.H - 2 && hx < 0; y++) for (let x = 2; x < CFG.W - 2; x++)
      if (!G.visibleAt(x, y) && S.map.terrain[MapGen.idx(x, y)] === T.GRASS) { hx = x + 0.5; hy = y + 0.5; break; }
    const u = Units.spawn('defender', 'A', hx, hy);
    BattleFX.onHit(u, 40, null);
    BattleFX.arrowLanded({ miss: true, x1: hx - 3, y1: hy, x2: hx, y2: hy });
    BattleFX.siegeLanded({ kind: 'stone', x2: hx, y2: hy }, null);
    ck('nothingIsWrittenOnGroundNobodySees', hx > 0 && !BattleFX.chips.length && !BattleFX.arrows.length && !BattleFX.craters.length,
      'chips ' + BattleFX.chips.length + ', arrows ' + BattleFX.arrows.length + ', craters ' + BattleFX.craters.length);
    Units.despawn(u);
    G.freeVis = true; G.updateVisibility();
  }

  /* ---- §4 capped ---- */
  {
    clear();
    for (let i = 0; i < 120; i++) kill(i % 3 ? 'defender' : 'archer', i % 2 ? 'P' : 'A', fx + ((i % 5) - 2) * 0.3, fy + ((i / 5 | 0) % 5 - 2) * 0.3);
    for (let i = 0; i < 300; i++) BattleFX.arrowLanded({ miss: true, x1: fx - 3, y1: fy, x2: fx + (i % 7 - 3) * 0.2, y2: fy + 0.1 });
    for (let i = 0; i < 90; i++) BattleFX.siegeLanded({ kind: i % 2 ? 'flame' : 'stone', x2: fx + (i % 5 - 2) * 0.4, y2: fy }, null);
    const F = BattleFX;
    ck('everyPoolIsCapped', F.bodies.length <= F.BODY_MAX && F.arrows.length <= F.ARROW_MAX && F.craters.length <= F.CRATER_MAX &&
      F.chips.length <= F.CHIP_MAX && F.bursts.length <= F.BURST_MAX && F.stains.length <= F.STAIN_MAX,
      `bodies ${F.bodies.length}/${F.BODY_MAX} arrows ${F.arrows.length}/${F.ARROW_MAX} craters ${F.craters.length}/${F.CRATER_MAX} chips ${F.chips.length}/${F.CHIP_MAX}`);
  }

  /* ---- §5 the strike lands on the blow ---- */
  {
    const u = Units.spawn('defender', 'P', fx, fy);
    const cd = BattleFX.cdOf(u), n = 12, k = 7;
    u.cd = cd;                                       // the blow, this instant
    const atBlow = BattleFX.strikeIndex(u, n, k);
    u.cd = 0;                                        // due, not yet struck: coiled
    const coiled = BattleFX.strikeIndex(u, n, k);
    // the frames run forward through the blow and never backward inside it
    let mono = true, last = -1;
    for (let s = 0; s <= 0.4; s += 0.02) {
      u.cd = cd - s; const f = BattleFX.strikeIndex(u, n, k);
      if (f < last && f >= k) mono = false; last = f;
    }
    ck('theImpactFrameIsOnScreenAtTheBlow', atBlow === k && coiled === k - 1, 'at the blow ' + atBlow + ', coiled ' + coiled);
    ck('andTheFollowThroughRunsForward', mono);
    // and through the real sheet seam: the frame R.unitSprite draws IS the impact frame
    const ua = Assets.unitArt[R.unitArtKey(u)];
    if (ua && ua.dirs.s && ua.dirs.s.fight) {
      const foe = Units.spawn('axeman', 'A', fx + 0.6, fy);
      u.tUnit = foe.id; u.cd = cd;
      const spr = R.unitSprite(u);
      const k2 = R._strikeK, d = ua.dirs[R._sheetFace] || ua.dirs.s;
      const strips = [d.fight, d.fight2, d.fight3].filter(Boolean);
      const hit = strips.some(st => st[k2] === spr);
      ck('theSheetSeamDrawsTheImpactFrame', k2 != null && hit, 'k=' + k2 + ', face ' + R._sheetFace);
      Units.despawn(foe); u.tUnit = null;
    } else ck('theSheetSeamDrawsTheImpactFrame', false, 'no defender art installed');
    Units.despawn(u);
  }

  /* ---- §6 variety ---- */
  {
    const u = Units.spawn('defender', 'P', fx, fy);
    const cd = BattleFX.cdOf(u);
    const mk = (n) => Array.from({ length: 12 }, () => document.createElement('canvas'));
    const d = { fight: mk(), fight2: mk(), fight3: mk() };
    const seq = [];
    for (let blow = 0; blow < 14; blow++) {
      u.cd = 0.01; BattleFX.pickStrike(u, d, d.fight, 'fight', 's', 'defender-p-blue');
      u.cd = cd;                                    // the cooldown jumps up: a blow
      const ps = BattleFX.pickStrike(u, d, d.fight, 'fight', 's', 'defender-p-blue');
      seq.push(ps.fr === d.fight ? 1 : ps.fr === d.fight2 ? 2 : 3);
    }
    let twice = 0; for (let i = 1; i < seq.length; i++) if (seq[i] === seq[i - 1]) twice++;
    ck('aFighterNeverRepeatsAStrikeTwiceRunning', twice === 0 && new Set(seq).size >= 3, seq.join(''));
    u.perch = 1;
    const ps = BattleFX.pickStrike(u, d, d.fight, 'fight', 's', 'archer-p-blue');
    ck('aBowOnAPlatformKeepsItsOneStrip', ps.fr === d.fight);
    u.perch = 0;
    const w = Units.spawn('wolf', 'W', fx + 2, fy);
    const sw = Units.spawn('bear', 'W', fx + 3, fy); sw.strife = 1;
    ck('theWildKeepsItsOwnTempo', !BattleFX.synced(w) && !BattleFX.synced(sw));
    S.units = S.units.filter(z => z !== u && z !== w && z !== sw);
  }

  /* ---- §7 the dead lie, then go ---- */
  {
    clear();
    kill('defender', 'P', fx, fy);
    const body = BattleFX.bodies[0];
    const life = BattleFX.dieDur(body) + BattleFX.BODY_S + BattleFX.BODY_FADE_S;
    step(life - 0.6);
    const lying = BattleFX.bodies.length === 1, pooled = BattleFX.stains.some(s => s.pool);
    step(1.2);
    ck('theDeadLieForSecondsThenGo', lying && BattleFX.bodies.length === 0, 'lying ' + lying + ', after ' + BattleFX.bodies.length);
    ck('andALittleBloodSpreadsUnderThem', pooled);
    // a hull goes under, an engine breaks up, a beast tips before its carcass
    clear();
    const hull = Units.spawn('fishboat', 'P', fx, fy); BattleFX.onDeath(hull, null, 'A'); Units.despawn(hull);
    const eng = Units.spawn('catapult', 'P', fx + 1, fy); BattleFX.onDeath(eng, null, 'A'); Units.despawn(eng);
    const beast = Units.spawn('deer', 'W', fx + 2, fy); BattleFX.onDeath(beast, null, 'P'); Units.despawn(beast);
    ck('aHullSinksAnEngineBreaksABeastFalls',
      BattleFX.bodies.some(b => b.sink) && BattleFX.bodies.some(b => b.engine) && BattleFX.falls.length === 1 &&
      !BattleFX.bodies.some(b => b.engine && b.organic));
  }

  /* ---- §8 arrows, craters, the struck building ---- */
  {
    clear();
    Combat.shots.length = 0;
    Combat.shots.push({ x1: fx - 3, y1: fy, x2: fx + 0.2, y2: fy + 0.1, t: 0.01, t0: 0.24, miss: true });
    Combat.update(0.05);
    ck('aMissedShaftStandsInTheGround', BattleFX.arrows.length === 1, BattleFX.arrows.length + ' stuck');
    // on water a miss rings the surface and stands nowhere
    let wx = -1, wy = -1;
    for (let i = 0; i < S.map.terrain.length; i++) if (S.map.terrain[i] === T.WATER && G.visibleAt(i % CFG.W, (i / CFG.W) | 0)) { wx = i % CFG.W + 0.5; wy = ((i / CFG.W) | 0) + 0.5; break; }
    if (wx > 0) {
      clear(); BattleFX.arrowLanded({ miss: true, x1: wx - 3, y1: wy, x2: wx, y2: wy });
      ck('aMissOnWaterRipplesAndStandsNowhere', !BattleFX.arrows.length && BattleFX.bursts.some(b => b.kind === 'ripple'));
    }
    clear();
    const tu = Units.spawn('defender', 'A', fx, fy);
    Combat.impact({ kind: 'stone', tgt: { kind: 'unit', id: tu.id, dmg: 1 }, owner: 'P', x2: fx, y2: fy });
    const stone = BattleFX.craters.length;
    Combat.impact({ kind: 'bolt', tgt: { kind: 'unit', id: tu.id, dmg: 1 }, owner: 'P', x2: fx + 1, y2: fy });
    ck('aStoneDigsACraterABoltDigsNone', stone === 1 && BattleFX.craters.length === 1, stone + ' / ' + BattleFX.craters.length);
    Combat.impact({ kind: 'flame', tgt: { kind: 'unit', id: tu.id, dmg: 1 }, owner: 'P', x2: fx - 1, y2: fy });
    ck('aBurningShotBurstsAndScorches', BattleFX.craters.some(c => c.fire) && BattleFX.bursts.some(b => b.kind === 'boom'));
    Units.despawn(tu);
    clear();
    const h = Bld.place('A', 'house', Math.floor(fx), Math.floor(fy) + 2, { free: true, instant: true });
    const hp0 = h.hp;
    Combat.impact({ kind: 'stone', tgt: { kind: 'bld', id: h.id, dmg: 5 }, owner: 'P', x2: Bld.cx(h), y2: Bld.cy(h) });
    const jolt = BattleFX.bldJolt(h), chips = BattleFX.chips.length;
    BattleFX._bHit.get(h.id).t -= 1;
    ck('aStoneIntoAHouseFlinchesItAndThrowsItsStuff', Math.abs(jolt) === 1 && chips >= 8 && BattleFX.bldJolt(h) === 0 && !BattleFX.craters.length,
      'jolt ' + jolt + ', chips ' + chips + ', hp ' + hp0 + '→' + h.hp);
    Bld.removeToRuin(h, true);
  }

  /* ---- §9 lazy art, impact frames inside their strips, deaths that lie down ---- */
  {
    const keys = Object.keys(Assets.BATTLE_ART);
    // drawing a character asks for its battle strips, once
    const mil = keys.find(k => ['defender', 'axeman', 'elite', 'archer', 'longbow', 'marksman'].includes(k));
    let lazy = 'no military battle art yet';
    if (mil) {
      const u = Units.spawn(mil, 'P', fx, fy);
      R.sheetFrames(u);
      lazy = BattleFX._wanted.has(R.unitArtKey(u)) && Assets._battleAsked[R.unitArtKey(u)] ? 'ok' : 'not asked';
      Units.despawn(u);
    }
    res.__lazy = lazy;
    // every strip's frames, measured off the files
    const load = (src) => new Promise(r => { const im = new Image(); im.onload = () => r(im); im.onerror = () => r(null); im.src = src; });
    const ink = (im, i, n) => {
      const H = im.height, c = document.createElement('canvas'); c.width = H; c.height = H;
      const g = c.getContext('2d'); g.drawImage(im, i * H, 0, H, H, 0, 0, H, H);
      const d = g.getImageData(0, 0, H, H).data;
      let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      for (let y = 0; y < H; y++) for (let x = 0; x < H; x++) if (d[(y * H + x) * 4 + 3] > 0) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      return x1 < 0 ? null : { w: x1 - x0 + 1, h: y1 - y0 + 1 };
    };
    const badK = [], upright = [], wrongBox = [];
    for (const [key, row] of Object.entries(BattleFX.STRIKE_AT)) for (const [pose, ks] of Object.entries(row)) {
      for (let i = 0; i < 8; i++) {
        if (ks[i] == null) continue;
        const im = await load('assets/units/unit-' + key + '-' + DIRS[i] + '-' + pose + '.png');
        if (!im) { badK.push(key + '-' + DIRS[i] + '-' + pose + ' (no file)'); continue; }
        const n = im.width / im.height;
        if (!(ks[i] >= 1 && ks[i] < n)) badK.push(key + '-' + DIRS[i] + '-' + pose + ' k=' + ks[i] + '/' + n);
      }
    }
    for (const [key, poses] of Object.entries(Assets.BATTLE_ART)) for (const [pose, mask] of Object.entries(poses)) {
      for (let i = 0; i < 8; i++) {
        if (!(mask & (1 << i))) continue;
        const src = 'assets/units/unit-' + key + '-' + DIRS[i] + '-' + pose + '.png';
        const im = await load(src);
        if (!im) { wrongBox.push(src + ' (unreadable)'); continue; }
        // the character's own scale: square frames, no smaller than its walk, at most 1.75x it
        const walk = await load('assets/units/unit-' + key + '-' + DIRS[i] + '-walk.png') || await load('assets/units/unit-' + key + '-s-walk.png');
        const W = im.height, base = walk ? walk.height : W;
        if (im.width % W || W < base || W > base * 1.75) wrongBox.push(key + '-' + DIRS[i] + '-' + pose + ' ' + W + ' vs ' + base);
        if (pose === 'die') {
          const n = im.width / W, a = ink(im, 0, n), z = ink(im, n - 1, n);
          // lying down: the last frame no taller than two thirds of the first
          if (!a || !z || z.h > a.h * 0.67) upright.push(key + '-' + DIRS[i] + ' ' + (a && a.h) + '→' + (z && z.h));
        }
      }
    }
    ck('everyImpactFrameIsInsideItsStrip', !badK.length, badK.slice(0, 5).join('; '));
    ck('everyBattleStripIsItsCharactersOwnSize', !wrongBox.length, wrongBox.slice(0, 5).join('; '));
    ck('everyDeathEndsLyingDown', !upright.length, upright.slice(0, 5).join('; '));
  }

  /* ---- §10 nothing in the black ---- */
  {
    clear();
    kill('defender', 'P', fx, fy);
    BattleFX.arrowLanded({ miss: true, x1: fx - 3, y1: fy, x2: fx + 0.4, y2: fy });
    BattleFX.siegeLanded({ kind: 'stone', x2: fx - 1, y2: fy }, null);
    step(0.5);
    const real = R.clipBoard; let n = 0;
    R.clipBoard = function (g, fn) { n++; return real.call(this, g, fn); };
    const c = document.createElement('canvas').getContext('2d');
    BattleFX.drawGround(c); const g1 = n;
    BattleFX.prepFlush(); BattleFX.flush(c, 1e9); const g2 = n;
    BattleFX.drawAir(c); const g3 = n;
    R.clipBoard = real;
    ck('everyPassIsClippedToTheBoard', g1 >= 1 && g2 >= g1 + 2 && g3 >= g2 + 1, g1 + '/' + g2 + '/' + g3);
  }
  return { res, fails };
}, DIRS);

const lazy = out.res.__lazy; delete out.res.__lazy;
Object.assign(res, out.res); fails.push(...out.fails);
await p.waitForTimeout(600);
if (lazy !== 'no military battle art yet') ck('aCharactersBattleStripsComeWhenItIsDrawn', lazy === 'ok' && asked.length > 0, lazy + ', ' + asked.length + ' asked');

await b.close();
for (const [k, v] of Object.entries(res)) console.log(' ' + k + ': ' + v);
const bad = errs.filter(e => !/ERR_FILE_NOT_FOUND/.test(e));
console.log('errors:', JSON.stringify(bad));
if (fails.length || bad.length) { console.error('BATTLE-FX CHECKS FAILED:', fails.join(', ')); process.exit(1); }
console.log('ALL BATTLE-FX CHECKS PASS');
