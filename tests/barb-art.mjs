/* THE WILD COUNTRY'S PEOPLE ARE DRAWN (Assets.BARB_ART / barbKey /
   loadBarbArt, R.unitArtKey; operator, build 155: "do an art pass on all the
   different types of barbarian tribes… they still look low pixel density…
   increase them so they look higher quality like some of the hero units for
   the player (bronze champion and fire archer)… unique, creative and
   different from each other").

     FIFTEEN DRAWN FIGHTERS  Every people (CFG.TRIBES) has a raider man, a
                    raider woman and a brute, each in all eight facings and
                    three poses (idle, walk, fight) — PixelLab characters made
                    in the champion's own style, at the villagers' density:
                    64px frames, a brute's 80px into a 40 box (Assets.UNIT_BOX).
                    A strike may take a bigger square frame (R.frameBox):
                    same feet, same column.
     A HEAD TALLER, MEASURED  A raider's strips fill 61 of their 64 rows and
                    a brute's 62 of 80, so drawn at the cast's 32 the two
                    stood the same height (operator, build 157: "the little
                    guys are the same height as the slow moving but big
                    guys"). The raider draws at 28 and the light skirmisher
                    at 26 (CFG.BARB_BANDS.TIERS.light.box, R.unitBox): the
                    walk's own ink, as drawn, puts the brute a head over the
                    plain raider in every people and the light man under him.
     ITS OWN PEOPLE  A band wears its camp's people (u.tribe) and its own
                    sex (u.female): the key is barb-{tribe}-raider-{m|f} or
                    barb-{tribe}-brute.
     NOT AT BOOT    The title's demo world asks for none of them; a played
                    world asks for its camps' peoples in the background tier,
                    and a band met first asks for its own strips.
     THE STAND-IN   A strip that is not there yet draws the procedural rig,
                    per lookup, as every other drawn unit does.

     node tests/barb-art.mjs      # exits non-zero on any regression */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const res = {}, fails = [];
const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };

// ---- 1. on disk: every people, every look, every facing and pose ----
const cfg = readFileSync(join(root, 'js/config.js'), 'utf8');
const tribes = [...cfg.slice(cfg.indexOf('TRIBES:')).matchAll(/key:\s*'(\w+)'/g)].slice(0, 5).map(m => m[1]);
const DIRS = ['s', 'se', 'e', 'ne', 'n', 'nw', 'w', 'sw'], POSES = ['idle', 'walk', 'fight'];
const png = f => { const b = readFileSync(f); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; };
{
  const missing = [], bad = [];
  for (const t of tribes) for (const look of ['raider-m', 'raider-f', 'brute'])
    for (const d of DIRS) for (const p of POSES) {
      const f = join(root, 'assets/units', `unit-barb-${t}-${look}-${d}-${p}.png`);
      if (!existsSync(f)) { missing.push(`${t}-${look}-${d}-${p}`); continue; }
      const { w, h } = png(f);
      // idle and walk ride the walk's 64px window; a strike may take a bigger square
      const base = look === 'brute' ? 80 : 64;
      if ((p !== 'fight' && h !== base) || (p === 'fight' && (h < base || h > base + 32)) || w % h || w / h < 4)
        bad.push(`${t}-${look}-${d}-${p} ${w}x${h}`);
    }
  ck('fiveTribes', tribes.length === 5, tribes.join(','));
  ck('everyPeopleEveryLookEveryFacingEveryPose', !missing.length,
    missing.length ? missing.length + ' missing, e.g. ' + missing.slice(0, 4).join(', ') : '360 strips');
  ck('atTheVillagersDensity', !bad.length, bad.slice(0, 4).join(', '));
}

// ---- 2. in the game ----
const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: 430, height: 880 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
const asked = [];
p.on('request', r => { if (/unit-barb-/.test(r.url())) asked.push(r.url()); });
await p.goto('file://' + join(root, 'index.html'), { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.Screens && Screens.current === 'title', null, { timeout: 60000 });
await p.waitForTimeout(1500);
ck('theTitleAsksForNoBarbarian', asked.length === 0, asked.length + ' asked');
const out = await p.evaluate(async () => {
  const r = {};
  G.newGame('barbart', 'moderate', 'medium'); Screens._demo = false; Screens.show('playing'); S.paused = true;
  const tc = Bld.tcOf('P');
  const ppl = CFG.TRIBES.map(t => t.key);
  const us = [];
  for (const t of ppl) for (const [kind, female] of [['raider', false], ['raider', true], ['brute', false]]) {
    const u = Units.spawn(kind, 'R', tc.x + 6, tc.y + 6);
    u.tribe = t; u.female = female; us.push(u);
  }
  r.keys = us.map(u => R.unitArtKey ? R.unitArtKey(u) : null);
  Assets.loadBarbArt(ppl, false);
  for (let i = 0; i < 120; i++) {
    if (us.every(u => { const ua = Assets.unitArt[R.unitArtKey(u)]; return ua && ua.dirs && ua.dirs.s && ua.dirs.s.walk; })) break;
    await new Promise(z => setTimeout(z, 250));
  }
  r.drawn = us.map(u => { const ua = Assets.unitArt[R.unitArtKey(u)]; return !!(ua && ua.dirs && ua.dirs.s && ua.dirs.s.walk && ua.dirs.s.walk.length >= 4); });
  // the drawn frame is the art, and a strike's bigger frame stands on the same feet
  const u = us[1], B = R.unitBox(u); r.tile = CFG.TILE;
  const walk = R.unitSprite(u);
  r.walkW = walk && walk.width;
  r.boxWalk = R.frameBox(u, walk, B);
  const ua = Assets.unitArt[R.unitArtKey(u)];
  let big = null;
  for (const d in ua.dirs) { const f = ua.dirs[d].fight; if (f && f[0] && f[0].width > 64) { big = f[0]; break; } }
  R._sheetKey = R.unitArtKey(u);
  r.boxFight = big ? R.frameBox(u, big, B) : null; r.fightW = big ? big.width : null;
  r.feetSame = big ? (R.frameTop(5, B, r.boxWalk) + r.boxWalk) === (R.frameTop(5, B, r.boxFight) + r.boxFight) : null;
  const br = us[2];
  const bimg = R.unitSprite(br);
  r.bruteBox = R.unitBox(br); r.bruteW = bimg && bimg.width;
  // the boxes each tier is drawn at (a light man is a raider of the light tier)
  const lt = Units.spawn('raider', 'R', tc.x + 6, tc.y + 6); lt.tribe = 'wolf'; lt.tier = 'light';
  r.boxes = { light: R.unitBox(lt), mid: R.unitBox(u), heavy: R.unitBox(br) };
  return r;
});
// the drawn height of each fighter: its south walk's ink, averaged over the
// frames, scaled by the box it is drawn at (data URIs: nothing is tainted)
const UNITS = join(root, 'assets/units');
const ink = await (async () => {
  const p2 = await b.newPage();
  const list = [];
  for (const t of tribes) for (const look of ['raider-m', 'raider-f', 'brute'])
    list.push([t + '|' + look, readFileSync(join(UNITS, `unit-barb-${t}-${look}-s-walk.png`)).toString('base64')]);
  const r = await p2.evaluate(async (list) => {
    const o = {};
    for (const [k, data] of list) {
      const img = new Image(); img.src = 'data:image/png;base64,' + data; await img.decode();
      const H = img.height, n = Math.round(img.width / H);
      const c = document.createElement('canvas'); c.width = img.width; c.height = H;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, img.width, H).data; let sum = 0;
      for (let f = 0; f < n; f++) {
        let top = H, bot = -1;
        for (let y = 0; y < H; y++) for (let xx = 0; xx < H; xx++) if (d[(y * img.width + f * H + xx) * 4 + 3] > 127) { if (y < top) top = y; bot = y; }
        sum += bot - top + 1;
      }
      o[k] = { h: sum / n, F: H };
    }
    return o;
  }, list);
  await p2.close();
  return r;
})();
const drawn = (t, look, box) => ink[t + '|' + look].h * box / ink[t + '|' + look].F;
const heights = tribes.map(t => {
  const raider = Math.max(drawn(t, 'raider-m', out.boxes.mid), drawn(t, 'raider-f', out.boxes.mid));
  const light = Math.max(drawn(t, 'raider-m', out.boxes.light), drawn(t, 'raider-f', out.boxes.light));
  return { t, light: +light.toFixed(1), raider: +raider.toFixed(1), brute: +drawn(t, 'brute', out.boxes.heavy).toFixed(1) };
});
ck('aBandWearsItsOwnPeopleAndSex', out.keys.every((k, i) => {
  const t = tribes[(i / 3) | 0], look = ['raider-m', 'raider-f', 'brute'][i % 3];
  return k === `barb-${t}-${look}`;
}), out.keys.join(' '));
ck('andIsDrawnFromTheStrips', out.drawn.every(Boolean), out.drawn.map((d, i) => d ? '' : out.keys[i]).filter(Boolean).join(', '));
ck('theWalkIs64pxIntoTheRaidersBox', out.walkW === 64 && out.boxWalk === out.boxes.mid && out.boxes.mid < out.tile,
  `frame ${out.walkW}, box ${out.boxWalk}, raider box ${out.boxes.mid}`);
ck('aBiggerStrikeIsABiggerPictureOnTheSameFeet', out.boxFight === null || (out.boxFight > out.boxWalk && out.feetSame),
  out.boxFight === null ? 'no oversize strike' : `strike ${out.fightW}px → box ${out.boxFight}`);
ck('aBruteIsDrawnFromHis80pxFrames', out.bruteBox === 40 && out.bruteW === 80, `box ${out.bruteBox}, frame ${out.bruteW}`);
// a head taller than the plain raider (a tenth at the least, the tallest
// raider of the people against its brute), and the light man under the raider
ck('aBruteStandsAHeadOverTheRaider', heights.every(h => h.brute >= h.raider * 1.1), JSON.stringify(heights));
ck('andTheLightManIsTheSmallest', out.boxes.light < out.boxes.mid && heights.every(h => h.light < h.raider), JSON.stringify(out.boxes));
const bad = errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e));
ck('noErrors', !bad.length, bad.slice(0, 3).join(' | '));
console.log(JSON.stringify(res, null, 1));
console.log(fails.length ? 'FAILURES: ' + fails.join(', ') : 'ALL BARBARIAN ART CHECKS PASS');
await b.close();
process.exit(fails.length ? 1 : 0);
