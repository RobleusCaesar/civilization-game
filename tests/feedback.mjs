/* FEEDBACK CONTRACT — what the game says reaches the screen, and stays there
   long enough to be read.

   Three faults, measured on build 126/127 by the sprint's Gate 1 audit:
     1. A REFUSAL VANISHED BEFORE IT COULD BE READ, AND A SECOND TAP WAS
        SILENT (PX-06). Every toast held 3.2 s whatever its length — the day-
        one station refusals run 24–31 words, 7–8.75 s of reading — and
        UI.toast dropped any repeat of the same words for six seconds, so a
        player who missed the line and tapped again got nothing: the button
        read as dead (the tap contract's rule 4).
     2. THE GAME THREW AWAY ITS OWN INSTRUCTIONS (PX-12). A toast with no
        level is shown nowhere, so the buttons that arm a "now tap the map"
        mode (Rally, a villager's Build, a doctrine, a sapper's tool, an army's
        banner) said nothing, and the sapper's no-ground refusal was silent.
     3. THE NEWS NEVER REACHED A MUTED PLAYER (PX-17). The horn sounded on a
        raid's first blow but the "X under attack!" toast rode a 15% roll per
        blow (first on blow 5 by the median, and about one lone-raider house in
        six burned with no toast at all); a finished building, a trained unit
        and a hall's new level wrote only to the event log.

   The rules this pins:
     - UI.toast(msg, warn, ms, dedupe): the six-second collapse (UI._toastAt)
       applies only when `dedupe` is asked for — G.log asks for it for every
       game event, so "House under attack!" ×9 is still one line — and a
       refusal answering the player's tap always shows; a repeat of one still
       on screen replaces it with ONE fresh node that shakes (warnings only,
       never a note). A toast holds max(3.2 s, 1.2 s + 0.26 s a word), then
       fades as before. Never more than five on screen.
     - While a lesson's note is up (Tutorial.noteUp), a NOTE waits and is shown
       once it is answered; a warning shows at once; a note held 20 s is
       dropped, never shown late.
     - The armed modes say what to do next ('note'); an order acknowledgement
       says nothing (the calm-screen rule).
     - "X under attack!" sounds on the first blow after ten quiet seconds, per
       building, from anyone but the player — and the old 15% roll's
       Math.random draw is KEPT, under its old guard, so every seeded stream
       is where it was.
     - A finished work, a trained unit and a hall's new level are a NOTE when
       they happen outside the open view (UI.inOpenBand: under the top bar,
       above the bottom bar, off the sides — the panel counts as off view),
       never for a wall or a gate; trained units coalesce per building per ten
       seconds; the hall's new level also sounds.

   Run this after touching UI.toast, UI.inOpenBand, G.log, Combat.hitBuilding's
   alarm, Bld.finish / releaseTrained / finishUpgrade's news, or any toast
   level in ui.js.

     node tests/feedback.mjs      # exits non-zero on any regression        */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const res = {}, fails = [];
const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };

/* ---- 0. the source: the refusal flag at the G.log refusals, and the
   acknowledgements that must stay silent (static, so a later edit that drops
   either is caught without a world to stage it in) ---- */
{
  const src = f => readFileSync(join(root, 'js', f), 'utf8');
  // every top-level argument of the call that starts at `i` (just past its '(')
  const args = (s, i) => {
    const out = []; let depth = 0, cur = '', q = null; const tq = [];
    for (; i < s.length; i++) {
      const c = s[i], p = s[i - 1];
      if (q) { cur += c;
        if (q === '`' && c === '{' && p === '$') { tq.push(depth); depth++; q = null; continue; }
        if (c === q && p !== '\\') q = null; continue; }
      if (c === '"' || c === "'" || c === '`') { q = c; cur += c; continue; }
      if (c === '}' && tq.length && depth - 1 === tq[tq.length - 1]) { depth--; tq.pop(); q = '`'; cur += c; continue; }
      if (c === '(' || c === '[' || c === '{') { depth++; cur += c; continue; }
      if (c === ')' || c === ']' || c === '}') { if (!depth && c === ')') { if (cur.trim()) out.push(cur.trim()); return out; } depth--; cur += c; continue; }
      if (c === ',' && !depth) { out.push(cur.trim()); cur = ''; continue; }
      cur += c;
    }
    return out;
  };
  const calls = (file, re) => { const s = src(file), out = []; let m;
    while ((m = re.exec(s))) out.push(args(s, m.index + m[0].length)); return out; };
  const glogs = [...calls('units.js', /\bG\.log\(/g), ...calls('buildings.js', /\bG\.log\(/g)];
  const refusals = [/No shore to land on/, /No open shore beside the hull/, /The gold seam cannot be reached/, /Bridge works need a sapper/];
  const flagged = refusals.map(re => { const c = glogs.find(a => re.test(a[0] || '')); return !!c && c[1] === 'true' && c[3] === 'true'; });
  ck('theGameLogsRefusalsCarryTheRefusalFlag', flagged.every(Boolean),
    refusals.map((re, i) => `${re.source.slice(0, 24)}: ${flagged[i] ? 'flagged' : 'NOT flagged'}`).join('; '));
  const toasts = calls('ui.js', /\bthis\.toast\(/g);
  const acks = [/^'Attack!'$/, /^'Gathering ' \+/, /War party moving/, /^'Villager stationed/];
  const loud = acks.filter(re => toasts.some(a => re.test(a[0] || '') && a.length > 1 && !/^(false|undefined|null|0)$/.test(a[1])));
  ck('orderAcknowledgementsStaySilent', !loud.length && acks.every(re => toasts.some(a => re.test(a[0] || ''))),
    loud.length ? 'given a level: ' + loud.map(r => r.source).join(', ') : 'Attack!, Gathering…, War party moving…, Villager stationed… pass no level');
}

const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_FILE_NOT_FOUND')) errs.push('console: ' + m.text()); });
await p.goto('file://' + join(root, 'index.html'), { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.Screens && Screens.current === 'title', null, { timeout: 60000 });
await p.waitForTimeout(500);

// helpers installed once in the page
await p.evaluate(() => {
  window.__fb = {
    setup(seed) {
      G.newGame(seed, 'moderate', 'large'); Screens._demo = false; Screens.show('playing'); S.paused = true;
      S.res = { food: 99999, wood: 99999, stone: 99999, gold: 99999 };
      UI.deselect(); UI.exitPlacement && UI.exitPlacement();
      document.getElementById('toasts').innerHTML = ''; UI._toastAt = {};
      G.freeVis = true; G.updateVisibility();
      return Bld.tcOf('P');
    },
    clear() { document.getElementById('toasts').innerHTML = ''; UI._toastAt = {}; },
    nodes() { return [...document.querySelectorAll('#toasts .toast')]; },
    // SEEN, by visibility: displayed, sized, and the topmost thing at its own
    // centre (the column takes no pointer events, so the probe lends it some)
    seen(el) {
      if (!el || !el.isConnected) return false;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      const box = document.getElementById('toasts');
      const pe = box.style.pointerEvents;
      box.style.pointerEvents = 'auto'; el.style.pointerEvents = 'auto';
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      box.style.pointerEvents = pe; el.style.pointerEvents = '';
      return !!hit && (hit === el || el.contains(hit));
    },
    shown(re) { return __fb.nodes().filter(n => re.test(n.textContent) && n.style.opacity !== '0' && __fb.seen(n)); },
    // the delays UI.toast asks setTimeout for, while `fn` runs
    delays(fn) {
      const st = window.setTimeout, out = [];
      window.setTimeout = function (f, d, ...a) { out.push(d | 0); return st.call(window, f, d, ...a); };
      try { fn(); } finally { window.setTimeout = st; }
      return out;
    },
    // a player's building, put down (or found) far from where the camera looks
    farFromCamera(x, y) {
      const W = CFG.W, H = CFG.H;
      R.cam.z = R.defaultZoom();
      R.centerOn(x < W / 2 ? W - 3 : 3, y < H / 2 ? H - 3 : 3);
    },
    placeNear(owner, key, x0, y0, opts) {
      for (let r = 2; r < 14; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = x0 + dx, y = y0 + dy;
        if (Bld.canPlace(owner, key, x, y, { noCost: true }).ok) { const b = Bld.place(owner, key, x, y, opts || { free: true }); Bld._block = null; return b; }
      }
      return null;
    },
    // a finished building on clear ground, whatever its tech gate (the other
    // contracts' free+instant convention: Bld.place validates nothing then)
    standNear(owner, key, x0, y0) {
      const sz = Bld.size(key);
      for (let r = 3; r < 14; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = x0 + dx, y = y0 + dy;
        let ok = true;
        for (let j = 0; j < sz && ok; j++) for (let i = 0; i < sz && ok; i++) ok = MapGen.onBoard(x + i, y + j) && Bld.tileFree(x + i, y + j);
        if (ok) { const b = Bld.place(owner, key, x, y, { free: true, instant: true }); Bld._block = null; return b; }
      }
      return null;
    },
  };
});

/* ---- 1. A REFUSAL IS READ, AND A REPEAT ANSWERS (PX-06) ---- */
const one = await p.evaluate(async () => {
  const out = {};
  __fb.setup('fb-1');
  // the hold is the words' own: a 31-word refusal stays for its reading time
  // (4 words a second and a second to notice it); three words keep 3.2 s
  const long = 'There are no trees on this tile. Your woodcutters would be standing in the grass looking at each other — a lumber camp goes on a stand you have already felled.';
  const words = long.trim().split(/\s+/).length;
  const dl = __fb.delays(() => UI.toast(long, true)).filter(d => d > 0).sort((a, c) => a - c);
  out.longHold = dl[0]; out.longWords = words; out.longNeed = Math.round((words / 4 + 1) * 1000);
  out.longFade = dl.length >= 2 && dl[1] - dl[0] === 700;
  __fb.clear();
  const ds = __fb.delays(() => UI.toast('Not enough resources', true)).filter(d => d > 0).sort((a, c) => a - c);
  out.shortHold = ds[0];
  out.shortFade = ds.length >= 2 && ds[1] - ds[0] === 700;
  // and it is SEEN
  out.seen = __fb.shown(/Not enough resources/).length === 1;
  // a repeat while it is still up: ONE fresh node, and it shakes
  const first = __fb.nodes().find(n => /Not enough resources/.test(n.textContent));
  UI.toast('Not enough resources', true);
  const after = __fb.nodes().filter(n => /Not enough resources/.test(n.textContent));
  out.repeat = { n: after.length, fresh: after.length === 1 && after[0] !== first, firstGone: !!first && !first.isConnected,
    shakes: after.length === 1 && after[0].classList.contains('shake'), seen: after.length === 1 && __fb.seen(after[0]) };
  // a repeated NOTE is replaced too, but never shakes
  __fb.clear();
  UI.toast('Tap a spot to rally', 'note'); UI.toast('Tap a spot to rally', 'note');
  const nn = __fb.nodes().filter(n => /Tap a spot to rally/.test(n.textContent));
  out.noteRepeat = { n: nn.length, shakes: nn.some(n => n.classList.contains('shake')) };
  // a FIRST showing never shakes
  __fb.clear();
  UI.toast('Queue full', true);
  out.firstShakes = __fb.nodes().some(n => n.classList.contains('shake'));
  // a refusal said through G.log carries the refusal flag and answers a repeat…
  __fb.clear();
  G.log('No open shore beside the hull — sail closer to land', true, undefined, true);
  const r1 = __fb.nodes()[0];
  G.log('No open shore beside the hull — sail closer to land', true, undefined, true);
  const rr = __fb.nodes().filter(n => /No open shore/.test(n.textContent));
  out.glogRefusal = { n: rr.length, fresh: rr.length === 1 && rr[0] !== r1 };
  // …while a game EVENT keeps the collapse: nine alarms inside six seconds are one line
  __fb.clear();
  for (let i = 0; i < 9; i++) G.log('House under attack!', true);
  out.nineAlarms = __fb.nodes().filter(n => /House under attack/.test(n.textContent)).length;
  out.nineLogged = S.log.filter(l => /House under attack/.test(l.msg)).length;
  // never more than five on screen
  __fb.clear();
  for (let i = 0; i < 9; i++) UI.toast(['Queue full', 'Not enough food', 'Fully staffed', 'Unexplored', 'Nobody aboard', 'Not enough resources',
    'Transport is full (or away from shore)', 'Can only heal within the Town Center grounds', 'No clear shore to fish from'][i], true);
  out.capped = __fb.nodes().length;
  // a call with no level is shown nowhere (the calm screen)
  __fb.clear();
  UI.toast('Attack!');
  out.silent = __fb.nodes().length;
  return out;
});
ck('aRefusalHoldsForItsReadingTime', one.longHold >= 1200 + 260 * one.longWords && one.longHold >= one.longNeed,
  `${one.longWords} words held ${one.longHold}ms (needs ${one.longNeed}ms to read)`);
ck('aShortRefusalKeepsTheOldHold', one.shortHold === 3200, `"Not enough resources" held ${one.shortHold}ms`);
ck('andTheFadeIsKept', one.longFade && one.shortFade, 'opacity 0 at the hold, removed 700ms later');
ck('aRefusalIsSeen', one.seen, 'displayed and topmost at its own centre');
ck('aRepeatedRefusalLeavesOneFreshNodeThatShakes', one.repeat.n === 1 && one.repeat.fresh && one.repeat.firstGone && one.repeat.shakes && one.repeat.seen,
  JSON.stringify(one.repeat));
ck('aRepeatedNoteIsReplacedButNeverShakes', one.noteRepeat.n === 1 && !one.noteRepeat.shakes, JSON.stringify(one.noteRepeat));
ck('aFirstShowingNeverShakes', !one.firstShakes, '');
ck('aRefusalThroughTheLogAnswersARepeat', one.glogRefusal.n === 1 && one.glogRefusal.fresh, JSON.stringify(one.glogRefusal));
ck('nineAlarmsInsideSixSecondsLeaveOneNode', one.nineAlarms === 1 && one.nineLogged === 9, `${one.nineAlarms} on screen, ${one.nineLogged} in the log`);
ck('neverMoreThanFiveToasts', one.capped <= 5, `${one.capped} after nine refusals`);
ck('aCallWithNoLevelIsShownNowhere', one.silent === 0, `${one.silent} nodes`);

/* ---- 1b. THE SHAKE IS A KEYFRAME WITH A REDUCED-MOTION GUARD ---- */
{
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const rule = /\.toast\.shake\s*\{[^}]*animation:\s*([\w-]+)/.exec(html);
  // a keyframe's own block — its steps, nothing after it
  const steps = name => { const m = new RegExp('@keyframes\\s+' + name + '\\s*\\{((?:[^{}]*\\{[^{}]*\\})*)[^{}]*\\}').exec(html); return m ? m[1] : null; };
  const MOVES = /transform|translate|rotate|scale|left|top/;
  const shake = rule && steps(rule[1]);
  const guard = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[^}]*\.toast\.shake\s*\{[^}]*animation:\s*(none|[\w-]+)/.exec(html);
  // reduced motion's keyframe may not move anything (the shake itself must, or the probe sees nothing)
  const still = guard && (guard[1] === 'none' || (steps(guard[1]) != null && !MOVES.test(steps(guard[1]))));
  ck('theShakeIsAKeyframeAndReducedMotionStandsItDown', !!shake && MOVES.test(shake) && !!still,
    rule ? `animation ${rule[1]} (moves ${!!shake && MOVES.test(shake)}); reduced motion: ${guard ? guard[1] + (still ? ', still' : ', MOVES') : 'NO GUARD'}` : 'no .toast.shake rule');
}

/* ---- 2. WHILE A LESSON'S NOTE IS UP, A NOTE WAITS (PX-06, the hold) ---- */
const hold = await p.evaluate(async () => {
  const out = {};
  __fb.setup('fb-2');
  const had = Object.prototype.hasOwnProperty.call(Tutorial, 'noteUp'), real = Tutorial.noteUp;
  let up = true;
  Tutorial.noteUp = () => up;
  const pn = performance.now.bind(performance); let off = 0;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  // a condition, never a fixed nap: a loaded machine delays the timers
  const until = async (fn, ms) => { const t0 = pn(); while (!fn() && pn() - t0 < ms) await wait(50); return fn(); };
  try {
    // the WORLD'S news comes through G.log (it rides the lesson out);
    // the answer to the player's own tap never waits (section 2b below)
    G.log('A hut is finished off in the hills', 'note');
    UI.toast('Not enough resources', true);
    out.noteHeld = __fb.nodes().filter(n => /A hut is finished/.test(n.textContent)).length === 0;
    out.warnAtOnce = __fb.shown(/Not enough resources/).length === 1;
    await wait(700);
    out.stillHeld = __fb.nodes().filter(n => /A hut is finished/.test(n.textContent)).length === 0;
    up = false;
    out.shownAfter = await until(() => __fb.shown(/A hut is finished/).length === 1, 6000);
    // a note held past twenty seconds is dropped, never shown late: a fresh
    // note queued behind it (on the advanced clock) proves the flush has run
    up = true;
    G.log('A stale piece of news', 'note');
    performance.now = () => pn() + off;
    off = 21000;
    G.log('A fresh piece of news', 'note');
    up = false;
    out.freshShown = await until(() => __fb.shown(/A fresh piece of news/).length === 1, 6000);
    out.staleDropped = out.freshShown && __fb.nodes().filter(n => /A stale piece of news/.test(n.textContent)).length === 0;
  } finally {
    performance.now = pn;
    if (had) Tutorial.noteUp = real; else delete Tutorial.noteUp;
  }
  // with no lesson predicate at all, nothing is held
  UI._toastAt = {};
  UI.toast('An ordinary note', 'note');
  out.noPredicateNoHold = __fb.shown(/An ordinary note/).length === 1;
  return out;
});
ck('aNoteWaitsWhileTheLessonsNoteIsUp', hold.noteHeld && hold.stillHeld, JSON.stringify(hold));
ck('aWarningShowsAtOnceOverTheLesson', hold.warnAtOnce, '');
ck('andTheNoteComesOnceTheLessonIsAnswered', hold.shownAfter, '');
ck('aNoteHeldTwentySecondsIsDropped', hold.staleDropped, '');
ck('withNoLessonNothingIsHeld', hold.noPredicateNoHold, '');

/* ---- 2b. THE ANSWER TO THE PLAYER'S OWN TAP NEVER WAITS (integration) ----
   The lesson hold is for the WORLD'S news (G.log, the "N ready" fold). A
   note that answers what the player just did (a station's "no ground yet",
   the wall's how-to, a top-bar number's explanation, Build's hint) must show
   at once over the lesson card, or a tap reads as dead: the tap contract's
   rule 4, no silent failure. Red on the merged lanes (PX-06's hold kept
   every note back), green once the hold asks for news alone. */
const answer = await p.evaluate(async () => {
  const out = {};
  __fb.setup('fb-2b');
  const had = Object.prototype.hasOwnProperty.call(Tutorial, 'noteUp'), real = Tutorial.noteUp;
  Tutorial.noteUp = () => true;
  try {
    UI.toast('Drag along the ground to lay a wall — release to build', 'note');
    out.answerAtOnce = __fb.shown(/Drag along the ground to lay a wall/).length === 1;
    // the real path: a top-bar number tapped during a lesson says what it means
    UI._toastAt = {};
    const before = __fb.nodes().length;
    const chip = document.querySelector('#topbar [data-chip="food"]');
    if (chip) chip.click();
    out.chipAtOnce = !!chip && __fb.nodes().length > before;
    // and the world's news still waits behind the same lesson
    G.log('A hut is finished off in the hills', 'note');
    out.newsStillWaits = __fb.nodes().filter(n => /A hut is finished/.test(n.textContent)).length === 0;
  } finally {
    if (had) Tutorial.noteUp = real; else delete Tutorial.noteUp;
  }
  return out;
});
ck('anAnswerToTheTapShowsAtOnceOverTheLesson', answer.answerAtOnce, JSON.stringify(answer));
ck('andATappedNumberExplainsItselfOverTheLesson', answer.chipAtOnce, '');
ck('whileTheWorldsNewsStillWaits', answer.newsStillWaits, '');

/* ---- 3. THE ARMED MODES SAY WHAT TO DO NEXT (PX-12) ---- */
const arm = await p.evaluate(async () => {
  const out = {};
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const tc = __fb.setup('fb-3');
  R.centerOn(tc.x + 1, tc.y + 1);
  const press = (sel) => { const el = document.querySelector(sel); if (!el) return false; el.click(); return true; };
  // the hall's Rally
  UI.select('bld', tc.id); UI.renderPanel(); __fb.clear();
  out.rallyBtn = press('#panel [data-act="rally"]');
  out.rally = __fb.shown(/Tap a (new )?spot/).length === 1;
  UI.settingRally = null; UI.deselect();
  // a villager's Build
  const v = S.units.find(u => u.owner === 'P' && u.kind === 'villager');
  UI.select('unit', v.id); UI.renderPanel(); __fb.clear();
  out.buildBtn = press('#panel [data-act="gobuild"]');
  out.build = __fb.shown(/Pick a building, then tap a site/).length === 1;
  UI.builderFor = null; UI.deselect();
  // a war party's doctrine: arming says what to do; standing it down is silent
  const ids = [];
  for (let i = 0; i < 3; i++) ids.push(Units.spawn('defender', 'P', tc.x + 3 + i, tc.y + 3).id);
  UI.sel = { type: 'group', ids }; UI.tacticsOpen = true; UI.renderPanel(); __fb.clear();
  out.strikeBtn = press('#panel [data-act="gstrat"][data-strat="strike"]');
  out.strike = __fb.shown(/Strike — tap ONE target/).length === 1;
  UI.tacticsOpen = true; UI.renderPanel(); __fb.clear();
  press('#panel [data-act="gstrat"][data-strat="strike"]');
  out.standDownSilent = __fb.nodes().length === 0;
  // an army's banner
  __fb.clear();
  UI.saveArmy(ids);
  out.army = __fb.shown(/Army 1 mustered/).length === 1;
  UI.deselect();
  // a sapper's tool: picking it up says what to do; putting it down is silent
  const camp = __fb.standNear('P', 'sapper', tc.x, tc.y);
  const sp = Units.spawn('sapper', 'P', tc.x + 1, tc.y + 3);
  UI.select('unit', sp.id); UI.renderPanel(); __fb.clear();
  out.digBtn = !!camp && press('#panel [data-act="terra"][data-job="dig"]');
  out.dig = __fb.shown(/Dig tool — tap or drag/).length === 1;
  __fb.clear();
  press('#panel [data-act="terra"][data-job="dig"]');
  out.toolDownSilent = __fb.nodes().length === 0;
  UI.terraMode = null; UI.deselect();
  // the levy: the one consequence the player cannot otherwise see
  UI.noteStruck();
  UI.select('bld', tc.id); UI.renderPanel(); __fb.clear();
  out.levyBtn = press('#panel [data-act="levy"]');
  out.levy = __fb.shown(/the levy eats like soldiers/).length === 1;
  if (S.levy) Units.standDownLevy();
  UI.deselect();
  /* the sapper's no-ground refusal: a dig tile walled in by forest on every
     side queues, but no hand can stand beside it — said, as a warning */
  {
    const x0 = tc.x + 8, y0 = tc.y + 1;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const i = MapGen.idx(x0 + dx, y0 + dy);
      S.map.terrain[i] = (dx || dy) ? T.FOREST : T.GRASS; S.map.resAmount[i] = (dx || dy) ? 100 : 0; S.map.explored[i] = 1;
    }
    Bld._block = null;
    const s2 = Units.spawn('sapper', 'P', tc.x + 1, tc.y + 3);
    UI.select('unit', s2.id); UI.terraMode = 'dig';
    UI.terraDrag = [{ x: x0, y: y0 }];
    UI.updateTerraGhost();
    __fb.clear();
    UI.commitTerraDrag();
    const w = __fb.shown(/No clear ground to stand beside/);
    out.noGround = { n: w.length, warn: w.length === 1 && w[0].classList.contains('warn'), queued: (UI.terraGhost || []).filter(t => t.ok).length };
    UI.terraMode = null; UI.terraDrag = null; UI.deselect();
  }
  return out;
});
ck('theRallyButtonSaysWhatToDoNext', arm.rallyBtn && arm.rally, JSON.stringify({ button: arm.rallyBtn, shown: arm.rally }));
ck('aVillagersBuildSaysWhatToDoNext', arm.buildBtn && arm.build, JSON.stringify({ button: arm.buildBtn, shown: arm.build }));
ck('aDoctrineSaysWhatToDoNext', arm.strikeBtn && arm.strike, JSON.stringify({ button: arm.strikeBtn, shown: arm.strike }));
ck('andStandingItDownIsSilent', arm.standDownSilent, '');
ck('anArmysBannerSaysHowToReturn', arm.army, '');
ck('aSappersToolSaysWhatToDoNext', arm.digBtn && arm.dig, JSON.stringify({ button: arm.digBtn, shown: arm.dig }));
ck('andPuttingItDownIsSilent', arm.toolDownSilent, '');
ck('theLevySaysItEatsLikeSoldiers', arm.levyBtn && arm.levy, JSON.stringify({ button: arm.levyBtn, shown: arm.levy }));
ck('theSappersNoGroundRefusalIsAWarning', arm.noGround.n === 1 && arm.noGround.warn, JSON.stringify(arm.noGround));

/* ---- 4. THE ALARM, ON THE FIRST BLOW (PX-17) ---- */
const alarm = await p.evaluate(() => {
  const out = {};
  const tc = __fb.setup('fb-4');
  const house = __fb.placeNear('P', 'house', tc.x, tc.y, { free: true, instant: true });
  const bks = __fb.standNear('P', 'barracks', tc.x, tc.y);
  const said = [], gl = G.log;
  G.log = function (m) { said.push(String(m)); return gl.apply(this, arguments); };
  const rnd = Math.random, pn = performance.now.bind(performance);
  let off = 0;
  try {
    // the old roll would have failed (0.5 ≥ 0.15): the alarm must not need it
    Math.random = () => 0.5;
    Combat.hitBuilding(house, 1, false, 'R');
    out.firstBlow = said.filter(m => /House under attack/.test(m)).length;
    out.firstSeen = __fb.shown(/House under attack/).length === 1;
    // a sustained raid: thirty blows inside a second — one alarm (and the old
    // roll, made to pass every time, would have said it thirty times)
    Math.random = () => 0.0;
    for (let i = 0; i < 30; i++) Combat.hitBuilding(house, 1, false, 'R');
    out.sustained = said.filter(m => /House under attack/.test(m)).length;
    // …another building is its own alarm
    Combat.hitBuilding(bks, 1, false, 'R');
    out.other = said.filter(m => /Barracks under attack/.test(m)).length;
    // ten quiet seconds later the next blow sounds it again
    performance.now = () => pn() + off;
    off = 10050;
    Combat.hitBuilding(house, 1, false, 'R');
    out.afterQuiet = said.filter(m => /House under attack/.test(m)).length;
    // the player's own blow raises nothing
    off = 30000;
    Combat.hitBuilding(house, 1, false, 'P');
    out.ownBlow = said.filter(m => /House under attack/.test(m)).length;
    // a blow with no striker named (the old call shape) still sounds it
    Combat.hitBuilding(house, 1, false);
    out.noBy = said.filter(m => /House under attack/.test(m)).length;
    // THE OLD ROLL'S DRAW IS KEPT: one Math.random a non-lethal blow on the
    // player's works, none on anyone else's
    let draws = 0;
    Math.random = () => { draws++; return 0.5; };
    off = 50000;
    Combat.hitBuilding(house, 1, false, 'R');
    out.drawsP = draws; draws = 0;
    const atc = Bld.tcOf('A');
    Combat.hitBuilding(atc, 1, false, 'P');
    out.drawsA = draws; draws = 0;
    off = 70000;
    Combat.hitBuilding(house, 1, false, 'P');
    out.drawsOwn = draws;
  } finally { Math.random = rnd; performance.now = pn; G.log = gl; }
  // the stamps are nobody's save: a new world starts quiet
  out.inSave = /_alarmAt|underAttack/.test(JSON.stringify(S));
  const tc2 = __fb.setup('fb-4');
  const said2 = [];
  G.log = function (m) { said2.push(String(m)); return gl.apply(this, arguments); };
  try { Math.random = () => 0.5; Combat.hitBuilding(tc2, 1, false, 'R'); }
  finally { Math.random = rnd; G.log = gl; }
  out.newWorld = said2.filter(m => /under attack/.test(m)).length;
  return out;
});
ck('theAlarmSoundsOnTheFirstBlow', alarm.firstBlow === 1 && alarm.firstSeen, JSON.stringify({ first: alarm.firstBlow, seen: alarm.firstSeen }));
ck('aSustainedRaidIsOneAlarmPerBuildingPerTenSeconds', alarm.sustained === 1 && alarm.other === 1 && alarm.afterQuiet === 2,
  `30 more blows: ${alarm.sustained} in all; the barracks ${alarm.other}; after ten quiet seconds ${alarm.afterQuiet}`);
ck('thePlayersOwnBlowRaisesNoAlarm', alarm.ownBlow === alarm.afterQuiet, `${alarm.ownBlow - alarm.afterQuiet} from the player's blow`);
ck('aBlowWithNoStrikerNamedStillSoundsIt', alarm.noBy === alarm.ownBlow + 1, `${alarm.noBy - alarm.ownBlow}`);
ck('theOldRollsDrawIsKept', alarm.drawsP === 1 && alarm.drawsA === 0 && alarm.drawsOwn === 1,
  `Math.random draws: ${alarm.drawsP} on the player's works, ${alarm.drawsA} on the rival's, ${alarm.drawsOwn} for the player's own blow`);
ck('theStampsAreNobodysSave', !alarm.inSave && alarm.newWorld === 1, `in the save ${alarm.inSave}; a new world's first blow ${alarm.newWorld}`);

/* ---- 5. THE NEWS, OFF THE VIEW (PX-17) ---- */
const news = await p.evaluate(() => {
  const out = {};
  const tc = __fb.setup('fb-5');
  out.hasBand = typeof UI.inOpenBand === 'function';
  const band = (x, y) => out.hasBand ? UI.inOpenBand(x, y) : null;
  const soundCalls = [];
  const su = Sound.ui;
  Sound.ui = function (k) { soundCalls.push(k); return false; };
  try {
    // a house finished far off the view: a note
    const h1 = __fb.placeNear('P', 'house', tc.x, tc.y);
    __fb.farFromCamera(Bld.cx(h1), Bld.cy(h1));
    out.h1Band = band(Bld.cx(h1), Bld.cy(h1));
    __fb.clear();
    Bld.finish(h1);
    const n1 = __fb.shown(/House complete/);
    out.offView = { n: n1.length, note: n1.length === 1 && !n1[0].classList.contains('warn') };
    // a house finished in the middle of the view: the log alone
    const h2 = __fb.placeNear('P', 'house', tc.x, tc.y);
    R.centerOn(Bld.cx(h2), Bld.cy(h2));
    out.h2Band = band(Bld.cx(h2), Bld.cy(h2));
    __fb.clear();
    Bld.finish(h2);
    out.onView = { n: __fb.nodes().length, logged: /House complete/.test(S.log[0].msg) };
    // a house finished UNDER THE OPEN PANEL is off the view
    const h3 = __fb.placeNear('P', 'house', tc.x, tc.y);
    UI.setMenuCollapsed(false);
    const bar = document.getElementById('bottombar').getBoundingClientRect();
    R.centerOn(Bld.cx(h3), Bld.cy(h3));
    // slide the camera so the house's middle sits inside the bar
    const want = bar.top + Math.max(8, bar.height / 2);
    R.cam.y -= (want - innerHeight / 2) / R.cam.z;
    const sy = (Bld.cy(h3) * CFG.TILE - R.cam.y) * R.cam.z;
    out.underPanel = { inBar: sy > bar.top && sy < bar.bottom, band: band(Bld.cx(h3), Bld.cy(h3)) };
    __fb.clear();
    Bld.finish(h3);
    out.underPanel.n = __fb.shown(/House complete/).length;
    // a wall or a gate never toasts its finish
    const wl = __fb.placeNear('P', 'wall', tc.x + 6, tc.y + 6);
    __fb.farFromCamera(Bld.cx(wl), Bld.cy(wl));
    __fb.clear();
    Bld.finish(wl);
    out.wall = __fb.nodes().length;
    // trained units off the view: one note a burst, counted
    const bk = __fb.standNear('P', 'barracks', tc.x, tc.y);
    __fb.farFromCamera(Bld.cx(bk), Bld.cy(bk));
    __fb.clear();
    for (let i = 0; i < 3; i++) Bld.releaseTrained(bk, 'defender', Bld.spawnSpot(bk, 'defender'));
    const rd = __fb.nodes().filter(n => /ready/.test(n.textContent));
    out.ready = { n: rd.length, text: rd.map(n => n.textContent), seen: rd.length === 1 && __fb.seen(rd[0]),
      logged: S.log.slice(0, 3).filter(l => /Defender ready/.test(l.msg)).length };
    // …and on the view, the log alone
    R.centerOn(Bld.cx(bk), Bld.cy(bk));
    __fb.clear();
    Bld.releaseTrained(bk, 'defender', Bld.spawnSpot(bk, 'defender'));
    out.readyOnView = __fb.nodes().length;
    // the hall's new level off the view: a note, and the sound
    __fb.farFromCamera(Bld.cx(tc), Bld.cy(tc));
    __fb.clear(); soundCalls.length = 0;
    Bld.finishUpgrade(tc);
    const lv = __fb.shown(/Town Center reached Lv 2/);
    out.hall = { n: lv.length, note: lv.length === 1 && !lv[0].classList.contains('warn'), sound: soundCalls.includes('complete') };
    // a card's raising says nothing per building and sounds nothing
    __fb.clear(); soundCalls.length = 0;
    const bl = S.buildings.find(o => o.owner === 'P' && o.key === 'barracks');
    Bld.finishUpgrade(bl, true);
    out.byCard = { n: __fb.nodes().length, sound: soundCalls.includes('complete') };
    // the rival's raising neither
    __fb.clear(); soundCalls.length = 0;
    Bld.finishUpgrade(Bld.tcOf('A'));
    out.rival = { n: __fb.nodes().length, sound: soundCalls.includes('complete') };
  } finally { Sound.ui = su; }
  return out;
});
ck('aFinishedWorkOffTheViewIsANote', news.offView.n === 1 && news.offView.note, JSON.stringify(news.offView) + ' band ' + news.h1Band);
ck('onTheViewItStaysInTheLog', news.onView.n === 0 && news.onView.logged && news.h2Band === true, JSON.stringify(news.onView) + ' band ' + news.h2Band);
ck('underTheOpenPanelIsOffTheView', news.underPanel.inBar && news.underPanel.band === false && news.underPanel.n === 1, JSON.stringify(news.underPanel));
ck('aWallNeverToastsItsFinish', news.wall === 0, `${news.wall} nodes`);
ck('trainedUnitsOffTheViewAreOneCountedNote', news.ready.n === 1 && news.ready.seen && /^Barracks: 3 defenders ready$/.test(news.ready.text[0] || '') && news.ready.logged === 3,
  JSON.stringify(news.ready));
ck('andOnTheViewTheyStayInTheLog', news.readyOnView === 0, `${news.readyOnView} nodes`);
ck('theHallsNewLevelIsANoteAndASound', news.hall.n === 1 && news.hall.note && news.hall.sound, JSON.stringify(news.hall));
ck('aCardsRaisingSaysNothing', news.byCard.n === 0 && !news.byCard.sound, JSON.stringify(news.byCard));
ck('theRivalsRaisingSaysNothing', news.rival.n === 0 && !news.rival.sound, JSON.stringify(news.rival));

console.log(JSON.stringify(res, null, 1));
const realErrs = errs.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e));
if (realErrs.length) { fails.push('pageErrors'); console.log('errors:', realErrs.slice(0, 5)); }
console.log(fails.length ? `${fails.length} FAILURE(S) — ${fails.join(', ')}` : 'ALL FEEDBACK CHECKS PASS');
await b.close();
process.exit(fails.length ? 1 : 0);
