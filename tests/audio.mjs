/* THE GAME'S VOICE — the contract for js/audio.js (Sprint 5).

   What this pins, and why each one is worth a check:

   1. ONLY THE GAME'S OWN RECORDINGS SHIP, AND NONE ON THE BOOT PATH (the
      operator's ruling, 2026-10-29: a recorded theme, battle music and a
      dozen effects). The repo holds exactly the named files under
      assets/music and assets/sfx, each inside its budget, and nothing is
      fetched until a gesture has unlocked the speaker — the battle not
      until a real game is under way.
   2. TWO SWITCHES, INDEPENDENTLY. Effects and music are separate decisions
      with separate keys and separate buses. The cross-checks matter: music
      off must not silence the axe, and effects off must not stop the music.
   3. OFF MEANS OFF. `play()` returns false and schedules nothing while the
      effects switch is off; `setMusic(false)` tears the scheduler down.
   4. THE MEMORY HAS A FALLBACK. localStorage can throw (iOS "Block All
      Cookies"), and when it does a toggle must still work for the session —
      the exact failure the onboarding pass had to fix in Screens.lsGet.
   5. IT IS THROTTLED, PER KIND. Twenty villagers chopping is twenty
      axe-falls a second without it. The gap is real time and the voice cap
      is absolute.
   6. NOTHING REACHES A SAVE. The context, the buses, the scheduler and the
      throttle clocks are module state (the R.collapses rule).
   7. IT NEVER THROWS AT A CALLER. A missing speaker must not cost a frame,
      so every door is wrapped — measured by deleting AudioContext outright
      and calling everything.
   8. THE THEME IS THE RECORDING, AND THE GENERATED BED STANDS IN for it
      when the recording cannot play: it schedules ahead of the audio clock
      and keeps producing new material.
  12. THE EFFECTS ARE HEARD BY WHAT THE CAMERA SEES: nothing off camera, the
      middle loud and the edges quiet, the work a sampled din, our weapons
      leading and the enemy's faint unless they are the only fight.
  13. THE BATTLE BUILDS ON THE MARCH AND BEATS IN THE FIGHT — the player's
      attack, never a defence at home — and fades back to the theme, or ends
      with the game. Its loop's seam runs straight into its start.
   9. THE WIRING IS REAL: the settings rows paint from the live state, and
      the game's own events reach the one door.
  10. THERE IS A DIAL, AND IT SHIPS DOWN. On/Off alone shipped a game the
      first real player called "far, far too loud", with no way down except
      the system volume — which turns down everything else on the device
      too. Each bus now has a 0-100 dial that persists, that moves the LIVE
      gain, and that starts under the measured ceiling (DEFAULT_VOL).
  11. MUTE AND ZERO ARE ONE STATE. A speaker icon reading "on" over a dial
      at zero is a control that lies, so sfxOn() asks both — and un-muting a
      zeroed dial lifts it, rather than turning on silence.

     node tests/audio.mjs      # exits non-zero on any regression */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync, statSync } from 'node:fs';
let pw;
try { pw = (await import('playwright')).default; }
catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const res = {}, fails = [];
const ck = (n, ok, i) => { res[n] = (ok ? 'PASS' : 'FAIL') + (i ? ' — ' + i : ''); if (!ok) fails.push(n); };

/* ---- 1. not one byte of audio ships (the repo, not the page) ---- */
{
  const AUDIO = /\.(mp3|ogg|wav|m4a|aac|flac|opus|webm)$/i;
  const found = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir)) {
      if (e === '.git' || e === 'node_modules') continue;
      const f = join(dir, e);
      let st; try { st = statSync(f); } catch (err) { continue; }
      if (st.isDirectory()) walk(f);
      else if (AUDIO.test(e)) found.push(f.slice(root.length + 1));
    }
  };
  walk(root);
  const SFX = ['chop', 'chip', 'gold', 'rake', 'hammer', 'sword', 'arrows', 'trebuchet', 'boulder', 'ship', 'gallop', 'complete', 'select', 'horn'];
  const TUNES = ['theme', 'theme-2', 'theme-3', 'theme-4'];
  const want = [...TUNES.map(n => 'assets/music/' + n + '.mp3'), 'assets/music/battle.mp3', ...SFX.map(n => 'assets/sfx/' + n + '.mp3')];
  const extra = found.filter(f => !want.includes(f)), missing = want.filter(f => !found.includes(f));
  ck('theOnlyAudioIsTheGamesOwnRecordings', !extra.length && !missing.length,
    (extra.length ? 'unexpected: ' + extra.join(', ') : '') + (missing.length ? ' missing: ' + missing.join(', ') : '') || want.length + ' files, all named');
  const size = f => { try { return statSync(join(root, f)).size; } catch (e) { return Infinity; } };
  const sfxTotal = SFX.reduce((t, n) => t + size('assets/sfx/' + n + '.mp3'), 0);
  ck('andEachIsInsideItsBudget', TUNES.every(n => size('assets/music/' + n + '.mp3') <= 4.2e6) && size('assets/music/battle.mp3') <= 0.6e6 &&
    SFX.every(n => size('assets/sfx/' + n + '.mp3') <= 80e3) && sfxTotal <= 600e3,
    `tunes ${TUNES.map(n => (size('assets/music/' + n + '.mp3') / 1e6).toFixed(2)).join('/')}MB, battle ${(size('assets/music/battle.mp3') / 1e3).toFixed(0)}KB, effects ${(sfxTotal / 1e3).toFixed(0)}KB`);
  // the module's own source names the same effects it ships
  const src = readFileSync(join(root, 'js/audio.js'), 'utf8');
  ck('andTheModuleNamesTheSameEffects', SFX.every(n => new RegExp('\\n    ' + n + ':\\s+\\{ lufs:').test(src)), '');
}

const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 900, height: 700 } });
const errors = [];
p.on('pageerror', e => errors.push(String(e)));
await p.goto('file://' + join(root, 'index.html'));
await p.waitForFunction(() => window.Screens && Screens.current === 'title', null, { timeout: 30000 });

const out = await p.evaluate(async () => {
  const r = {};
  const wait = (ms) => new Promise(z => setTimeout(z, ms));

  /* ---- 2/3. two switches, and off means off ---- */
  Sound.setSfx(true); Sound.setMusic(false);
  Sound.unlock();
  await wait(60);
  r.ctxMade = !!Sound.ctx;
  r.sfxPlays = Sound.play('chop');
  Sound.onWorldChange();
  Sound.setSfx(false);
  r.sfxSilent = Sound.play('chop');
  r.stillSeparate = Sound.musicOn() === false && Sound.sfxOn() === false;

  // music ON while effects stay OFF — the cross-check that matters
  Sound.setMusic(true);
  await wait(120);
  r.musicWithoutSfx = Sound.musicPlaying() && !Sound.sfxOn();
  // …and effects back ON while music keeps playing
  Sound.setSfx(true);
  Sound.onWorldChange();
  r.sfxWithMusic = Sound.play('mine') && Sound.musicPlaying();
  Sound.setMusic(false);
  await wait(60);
  r.musicStops = !Sound.musicPlaying();

  /* ---- 5. the throttle, per kind, in real time ---- */
  Sound.onWorldChange();
  const first = Sound.play('chop');
  const second = Sound.play('chop');          // same kind, same instant
  const other = Sound.play('mine');           // a different kind is unaffected
  r.throttle = { first, second, other };
  r.gapIsRealTime = typeof Sound.GAP.chop === 'number' && Sound.GAP.chop > 0;
  // the voice cap is absolute: past it, nothing is scheduled at all
  Sound.onWorldChange();
  const live = Sound._live;
  Sound._live = Sound.MAX_VOICES;
  r.cappedHard = Sound.play('done') === false;
  Sound._live = live;

  /* ---- 6. nothing reaches a save ---- */
  Sound.onWorldChange();
  Sound.play('chop');
  G.newGame('aud', 'moderate', 'medium');
  Screens._demo = false; Screens.show('playing'); S.paused = true;
  const save = G.saveJSON ? G.saveJSON() : JSON.stringify(S);
  const str = typeof save === 'string' ? save : JSON.stringify(save);
  r.notInSave = !/neo-music|_aiCrewAudio|musicBus|sfxBus|_refSink/.test(str) &&
    !/"ctx"|"_live"|"_music"/.test(str);
  r.worldChangeClears = (Sound.onWorldChange(), Object.keys(Sound._last).length === 0);

  /* ---- 8. the theme is the RECORDING; the generated bed stands in ---- */
  Sound.setSfx(true); Sound.setMusic(true);
  await wait(150);
  r.theme = { rec: !!(Sound._music && Sound._music.rec), src: Sound._theme ? Sound._theme.el.src : '', loops: !!(Sound._theme && Sound._theme.el.loop) };
  Sound.setMusic(false);
  await wait(60);
  // the recording cannot play (no media path, a 404): the generated bed takes its place
  const keepTh = Sound._theme, keepF = Sound._themeFailed;
  Sound._theme = null; Sound._themeFailed = true;
  Sound.setMusic(true);
  await wait(150);
  const m1 = Sound._music && Sound._music.i;
  const n1 = Sound._music && Sound._music.next;
  await wait(1400);
  const m2 = Sound._music && Sound._music.i;
  r.music = { started: !!Sound._music, i1: m1, i2: m2, aheadOfClock: n1 > Sound.ctx.currentTime,
    drone: Sound._music && Sound._music.drone ? Sound._music.drone.length : 0 };
  Sound.setMusic(false);
  Sound._theme = keepTh; Sound._themeFailed = keepF;

  /* ---- 9. the settings rows paint from the live state ---- */
  // a row reads as {speaker glyph, dial value, the label beside it}
  const row = (id) => {
    const el = document.getElementById(id);
    return { spk: el.querySelector('.spk').textContent, off: el.querySelector('.spk').classList.contains('off'),
      val: +el.querySelector('.vol').value, pct: el.querySelector('.vpct').textContent,
      muted: el.classList.contains('muted'), fill: el.querySelector('.vol').style.getPropertyValue('--p') };
  };
  Sound.setSfx(false); Sound.setMusic(true);
  Screens.paintAudioRows();
  r.rows = { sfx: row('setSfx'), music: row('setMusic') };
  Sound.setSfx(true); Sound.setMusic(false);
  Screens.paintAudioRows();
  r.rows2 = { sfx: row('setSfx'), music: row('setMusic') };

  /* ---- 10. the dial: it persists, and it moves the live gain ---- */
  Sound.setSfx(true); Sound.setMusic(true);
  r.dial = {};
  r.dial.defaults = { sfx: Sound.DEFAULT_VOL.sfx, music: Sound.DEFAULT_VOL.music };
  // it ships UNDER the measured ceiling — that is the whole point
  r.dial.shipsQuiet = Sound.DEFAULT_VOL.sfx < 100 && Sound.DEFAULT_VOL.music < 100;
  Sound.setVol('sfx', 100);
  r.dial.ceiling = +Sound.sfxBus.gain.value.toFixed(4) === +Sound.SFX_GAIN.toFixed(4);
  Sound.setVol('sfx', 25);
  r.dial.quarter = Math.abs(Sound.sfxBus.gain.value - Sound.SFX_GAIN * 0.25) < 1e-4;
  r.dial.stored = Sound.lsGet('neo-sfx-vol');
  r.dial.clamped = [Sound.setVol('sfx', -10), Sound.setVol('sfx', 400)];
  // the music bus follows its dial while it is playing
  Sound.setVol('music', 100); await wait(140);
  const loud = Sound.musicBus.gain.value;
  Sound.setVol('music', 20); await wait(140);
  r.dial.musicFollows = Sound.musicBus.gain.value < loud - 0.01;
  Sound.setMusic(false);

  /* ---- 11. mute and zero are one state ---- */
  Sound.setSfx(true); Sound.setVol('sfx', 0);
  r.zero = { onAtZero: Sound.sfxOn(), playsAtZero: Sound.play('done') };
  Screens.paintAudioRows();
  r.zero.reads = row('setSfx');
  Sound.setSfx(true);                       // un-mute a zeroed dial
  r.zero.lifted = Sound.vol('sfx');
  r.zero.onAfter = Sound.sfxOn();
  // …and lifting the dial off zero un-mutes, so the two can never disagree
  Sound.setSfx(false); Sound.setVol('sfx', 60);
  r.zero.dialUnmutes = Sound.sfxOn() && Sound.vol('sfx') === 60;
  Sound.setVol('sfx', Sound.DEFAULT_VOL.sfx);
  return r;
});

ck('anEffectSoundsWhenItIsOn', out.ctxMade && out.sfxPlays === true, 'ctx ' + out.ctxMade);
ck('andIsSilentWhenItIsOff', out.sfxSilent === false, 'play() returned ' + out.sfxSilent);
ck('theMusicPlaysWithTheEffectsOff', out.musicWithoutSfx === true,
  'losing the flute must not cost you the axe, or the other way round');
ck('andTheEffectsPlayWithTheMusicOn', out.sfxWithMusic === true, '');
ck('andTurningTheMusicOffStopsIt', out.musicStops === true, '');
ck('theSameSoundIsThrottled', out.throttle.first === true && out.throttle.second === false,
  JSON.stringify(out.throttle) + ' — twenty villagers chopping is a machine gun without this');
ck('butADifferentOneIsNot', out.throttle.other === true, '');
ck('andTheVoiceCapIsAbsolute', out.cappedHard === true, 'a town under siege must not become white noise');
ck('nothingReachesASave', out.notInSave === true, '');
ck('andAFreshWorldClearsTheClocks', out.worldChangeClears === true, '');
ck('theSettingsRowsTellTheTruth',
  out.rows.sfx.off === true && out.rows.sfx.pct === 'Off' && out.rows.sfx.muted === true &&
  out.rows.music.off === false && /%$/.test(out.rows.music.pct) &&
  out.rows2.sfx.off === false && out.rows2.music.off === true,
  JSON.stringify(out.rows) + ' then ' + JSON.stringify(out.rows2));
ck('andAMutedRowKeepsItsLevelOnTheDial', out.rows.sfx.val > 0 && out.rows.sfx.fill === out.rows.sfx.val + '%',
  'a mute that forgets the level makes the player set it twice — dial ' + out.rows.sfx.val + ', fill ' + out.rows.sfx.fill);
ck('theDialShipsUnderTheCeiling', out.dial.shipsQuiet,
  'defaults ' + JSON.stringify(out.dial.defaults) + ' — 100 is the measured ceiling, not the shipping level');
ck('andItMovesTheLiveGain', out.dial.ceiling && out.dial.quarter && out.dial.musicFollows,
  '100 = SFX_GAIN: ' + out.dial.ceiling + ', 25 = a quarter of it: ' + out.dial.quarter + ', music follows: ' + out.dial.musicFollows);
ck('andItIsRememberedAndClamped', out.dial.stored === '25' && out.dial.clamped[0] === 0 && out.dial.clamped[1] === 100,
  'stored ' + out.dial.stored + ', clamped ' + JSON.stringify(out.dial.clamped));
ck('aDialAtZeroIsMuted', out.zero.onAtZero === false && out.zero.playsAtZero === false && out.zero.reads.off === true,
  JSON.stringify(out.zero));
ck('andUnMutingItLiftsTheDial', out.zero.lifted === out.dial.defaults.sfx && out.zero.onAfter === true,
  'un-muting must produce sound, not silence — lifted to ' + out.zero.lifted);
ck('andLiftingTheDialUnMutes', out.zero.dialUnmutes === true,
  'the speaker and the dial can never disagree');
ck('theThemeIsTheRecording', out.theme.rec && /assets\/music\/theme\.mp3\?v=\d+$/.test(out.theme.src) && out.theme.loops,
  JSON.stringify(out.theme));
ck('andTheGeneratedBedStandsInForIt',
  out.music.started && out.music.i2 > out.music.i1 && out.music.aheadOfClock && out.music.drone >= 2,
  'slots ' + out.music.i1 + ' → ' + out.music.i2 + ', scheduled ahead: ' + out.music.aheadOfClock +
  ', drone voices ' + out.music.drone);
/* ---- 4. the memory has a fallback ---- */
{
  const p2 = await b.newPage({ viewport: { width: 900, height: 700 } });
  await p2.addInitScript(() => {
    const boom = () => { throw new Error('Block All Cookies'); };
    try { Object.defineProperty(Storage.prototype, 'getItem', { value: boom });
          Object.defineProperty(Storage.prototype, 'setItem', { value: boom }); } catch (e) {}
  });
  await p2.goto('file://' + join(root, 'index.html'));
  await p2.waitForFunction(() => window.Screens && Screens.current === 'title', null, { timeout: 30000 });
  const v = await p2.evaluate(() => {
    const before = Sound.sfxOn();          // absent reads as ON, even when the store throws
    Sound.setSfx(false);
    const after = Sound.sfxOn();
    Sound.setMusic(false);
    return { before, after, music: Sound.musicOn() };
  });
  ck('aThrowingStorageStillRemembersForTheSession',
    v.before === true && v.after === false && v.music === false,
    JSON.stringify(v) + ' — the toggle must not be a button that does nothing');
  await p2.close();
}

/* ---- 7b. THE FIRST GESTURE STARTS THE MUSIC ----
   resume() is ASYNCHRONOUS. Calling it and then reading ctx.state in the next
   statement reads 'suspended' still, so startMusic bailed and the bed never
   began — on the FIRST gesture, every time, which is the only gesture most
   players make before deciding the game has no music. It took an offline
   render of this very module to catch (the effects were fine and the bed came
   out digitally silent), so it is pinned here on a page with NO autoplay
   permission, where the context really does start suspended. */
{
  const p4 = await b.newPage({ viewport: { width: 900, height: 700 } });
  await p4.goto('file://' + join(root, 'index.html'));
  await p4.waitForFunction(() => window.Screens && Screens.current === 'title', null, { timeout: 30000 });
  const started = await p4.evaluate(async () => {
    Sound.lsSet('neo-music', '1');
    Sound.ac();
    // a file:// page is not always held by autoplay policy, so SUSPEND the
    // context by hand: the race only exists from a suspended start, and a
    // check that never reaches it would pass on the broken code too
    try { await Sound.ctx.suspend(); } catch (e) {}
    Sound.stopMusic();
    return { before: Sound.ctx && Sound.ctx.state, playing: Sound.musicPlaying() };
  });
  await p4.mouse.click(450, 350);                 // ONE real gesture, as a player makes
  await p4.waitForTimeout(700);
  const after = await p4.evaluate(() => ({ state: Sound.ctx && Sound.ctx.state, playing: Sound.musicPlaying() }));
  ck('oneGestureIsEnoughToStartTheMusic', started.before === 'suspended' && after.playing === true,
    'context was ' + started.before + ', after one click ' + after.state +
    ', playing ' + after.playing + ' — resume() resolves asynchronously');
  await p4.close();
}

/* ---- 7. it never throws at a caller ---- */
{
  const p3 = await b.newPage({ viewport: { width: 900, height: 700 } });
  const boom = [];
  p3.on('pageerror', e => boom.push(String(e)));
  await p3.addInitScript(() => {
    // a device that will not give us audio at all
    try { delete window.AudioContext; delete window.webkitAudioContext; } catch (e) {}
  });
  await p3.goto('file://' + join(root, 'index.html'));
  await p3.waitForFunction(() => window.Screens && Screens.current === 'title', null, { timeout: 30000 });
  const v = await p3.evaluate(() => {
    const r = { threw: null };
    try {
      Sound.init(); Sound.unlock();
      r.play = Sound.play('chop');
      r.music = Sound.startMusic();
      Sound.stopMusic(); Sound.onWorldChange();
      Sound.setSfx(true); Sound.setMusic(true);
      UI.cue('confirm');
      r.ac = Sound.ac();
    } catch (e) { r.threw = String(e); }
    return r;
  });
  ck('noSpeakerCostsNoFrame',
    !v.threw && v.play === false && v.music === false && v.ac === null && boom.length === 0,
    v.threw || (boom.join(' | ') || 'every door wrapped; play/startMusic answer false'));
  await p3.close();
}

/* ---- 9b. the game's own events reach the one door (source) ---- */
{
  const S_ = f => readFileSync(join(root, f), 'utf8');
  const hooks = {
    'a work finished (Bld.finish)': /Sound\.ui\('complete'/.test(S_('js/buildings.js')),
    'a unit trained (Bld)': /Sound\.play\('train'\)/.test(S_('js/buildings.js')),
    'a death, on camera (Units.damage)': /Sound\.place\(u\.x, u\.y\)/.test(S_('js/units.js')) && /Sound\.play\('die'\)/.test(S_('js/units.js')),
    'blows at the swing (Combat)': /Sound\.at\(CFG\.UNITS\[u\.kind\]\.rng \? 'arrows' : 'sword'/.test(S_('js/combat.js')),
    'engines and hulls at the launch (Combat.launch)': /Sound\.at\(Units\.isNaval\(u\) \? 'ship' : 'trebuchet'/.test(S_('js/combat.js')),
    'stone into the works (Combat.impact)': /Sound\.at\('boulder'/.test(S_('js/combat.js')),
    'the towers loose (Combat)': /Sound\.at\('arrows', cx, cy, b\.owner\)/.test(S_('js/combat.js')),
    'the alarm (Combat.hitBuilding)': /Sound\.ui\('horn'\)/.test(S_('js/combat.js')),
    'the muster horn (UI)': /Sound\.ui\('horn'\)/.test(S_('js/ui.js')),
    'a selection (UI.select)': /Sound\.ui\('select'\)/.test(S_('js/ui.js')),
    'UI.cue goes through it': /Sound\.play\(kind === 'ok'/.test(S_('js/ui.js')),
  };
  const missing = Object.entries(hooks).filter(([, ok]) => !ok).map(([k]) => k);
  ck('theGamesOwnEventsReachTheOneDoor', missing.length === 0, missing.join('; ') || '');
  /* THE RIVAL'S WORK IS NOT OURS TO HEAR — a chop from across the fog would
     tell the player something the fog exists to hide. */
  ck('andOnlyTheOwnTribeIsAudible',
    /if \(u\.owner !== 'P' \|\| !Units\.isVillager\(u\)/.test(S_('js/audio.js')) &&
    /b\.owner === 'P' && typeof Sound !== 'undefined'/.test(S_('js/buildings.js')) &&
    !/Sound\.play\(txt === '\+wood'/.test(S_('js/render.js')),
    'the din hears only our hands; the works finished are ours; the old per-hand tick is gone');
}

/* ---- 12/13. THE CAMERA'S EAR AND THE BATTLE (served over HTTP: fetch and
   decodeAudioData need a real origin — a file:// page plays the synthesised
   stand-ins, which is its own proof that a missing file costs nothing) ---- */
{
  const { createServer } = await import('node:http');
  const { readFile } = await import('node:fs/promises');
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.json': 'application/json', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.css': 'text/css', '.svg': 'image/svg+xml' };
  const reqs = [];
  const srv = createServer(async (rq, rs) => {
    try {
      let q = decodeURIComponent(new URL(rq.url, 'http://x').pathname); if (q.endsWith('/')) q += 'index.html';
      if (/\.mp3$/.test(q)) reqs.push(q);
      const buf = await readFile(join(root, q));
      rs.writeHead(200, { 'content-type': MIME[q.slice(q.lastIndexOf('.'))] || 'application/octet-stream' }); rs.end(buf);
    } catch (e) { rs.writeHead(404); rs.end(); }
  });
  await new Promise(z => srv.listen(0, '127.0.0.1', z));
  const p5 = await b.newPage({ viewport: { width: 1280, height: 800 } });
  p5.on('pageerror', e => errors.push(String(e)));
  await p5.goto(`http://127.0.0.1:${srv.address().port}/index.html`);
  await p5.waitForFunction(() => window.Screens && Screens.current === 'title', null, { timeout: 30000 });
  await p5.waitForTimeout(1200);
  const beforeTap = reqs.slice();
  await p5.mouse.click(640, 760);
  await p5.waitForFunction(() => Object.keys(Sound._buf).length >= 14, null, { timeout: 30000 }).catch(() => {});
  // the theme is a media element streaming on its own clock: on a loaded
  // machine its first request lands a beat after the effects' buffers, so wait
  // for the request itself rather than snapshotting the moment they arrive
  for (let i = 0; i < 100 && !reqs.some(q => /music\/theme\.mp3/.test(q)); i++) await p5.waitForTimeout(100);
  const afterTap = reqs.slice();
  ck('nothingIsFetchedBeforeAGesture', beforeTap.length === 0, beforeTap.join(', ') || 'the boot fetched no audio');
  ck('andTheTapBringsTheThemeAndTheEffectsButNotTheBattle',
    afterTap.some(q => /music\/theme\.mp3/.test(q)) && afterTap.filter(q => /\/sfx\//.test(q)).length === 14 && !afterTap.some(q => /battle/.test(q)),
    afterTap.length + ' requests: ' + afterTap.map(q => q.split('/').pop()).join(' '));

  /* ---- 14. FOUR TUNES IN TURN (operator, build 121): after ROTATE_S of a
     tune heard the next fades in over the one playing, round the list for
     good; a tune is fetched only when its turn comes, the clock stands still
     through a battle, a tune that will not load is skipped ---- */
  ck('theOtherTunesWaitForTheirTurn', !afterTap.some(q => /theme-\d/.test(q)),
    'the tap fetched ' + (afterTap.filter(q => /theme-\d/.test(q)).join(', ') || 'no second tune'));
  const rot = await p5.evaluate(async () => {
    const r = {}, wait = ms => new Promise(z => setTimeout(z, ms));
    r.decks = !!(Sound._theme && Sound._deck2);
    r.playing = !!(Sound._theme && !Sound._theme.el.paused);
    // the clock stands still while the battle has the floor
    const keepB = Sound._battle;
    Sound._themeClock = 0; Sound._battle = { mode: 'on' };
    Sound._themeTick(5);
    r.heldInBattle = Sound._themeClock === 0;
    Sound._battle = keepB;
    // a short turn, then watch the decks change hands
    Sound.ROTATE_S = 0.8; Sound.ROTATE_FADE = 0.4;
    const seen = [];
    let fadeIn = null;
    for (let t = 0; t < 140 && seen.length < 5; t++) {
      await wait(100);
      const th = Sound._theme;
      if (!th) continue;
      if (!seen.length || seen[seen.length - 1].i !== th.i) {
        seen.push({ i: th.i, src: th.el.src.replace(/^.*\/music\//, '') });
        if (th.i === 1 && !fadeIn) {
          await wait(60);
          fadeIn = { next: +Sound._theme.g.gain.value.toFixed(3), old: +Sound._deck2.g.gain.value.toFixed(3) };
        }
      }
    }
    r.seen = seen; r.fadeIn = fadeIn;
    await wait(700);
    r.level = { want: Sound._themeLevel(Sound._theme.i), now: +Sound._theme.g.gain.value.toFixed(3), other: +Sound._deck2.g.gain.value.toFixed(4) };
    // a tune that will not load is skipped
    Sound.ROTATE_S = 1e9;
    const from = Sound._theme.i;
    Sound._themeBad = { [(from + 1) % 4]: true };
    Sound._themeFading = 0;
    Sound._themeNext(true);
    r.skip = { from, to: Sound._theme.i };
    Sound._themeBad = {};
    Sound.ROTATE_S = 300; Sound.ROTATE_FADE = 8;
    return r;
  });
  const order = rot.seen.map(x => x.i).join(' → ');
  ck('fourTunesTakeTurns', rot.decks && rot.playing && rot.seen.length >= 5 &&
    rot.seen.slice(0, 5).map(x => x.i).join() === '0,1,2,3,0' &&
    rot.seen.slice(0, 5).map(x => x.src.split('?')[0]).join() === 'theme.mp3,theme-2.mp3,theme-3.mp3,theme-4.mp3,theme.mp3',
    order + ' (' + rot.seen.map(x => x.src.split('?')[0]).join(', ') + ')');
  ck('andEachFadesInOverTheOneBefore', !!rot.fadeIn && rot.fadeIn.next > 0.0001 && rot.fadeIn.old > 0.0001 &&
    Math.abs(rot.level.now - rot.level.want) < 0.05 && rot.level.other < 0.01,
    JSON.stringify({ fadeIn: rot.fadeIn, level: rot.level }));
  ck('theClockStandsStillThroughABattle', rot.heldInBattle, '');
  ck('aTuneThatWillNotLoadIsSkipped', rot.skip.to === (rot.skip.from + 2) % 4,
    JSON.stringify(rot.skip) + ' with tune ' + ((rot.skip.from + 1) % 4) + ' refusing to load');
  ck('andEachTuneIsFetchedOnlyOnItsTurn', ['theme-2', 'theme-3', 'theme-4'].every(n => reqs.some(q => q.endsWith('/' + n + '.mp3'))),
    reqs.filter(q => /theme/.test(q)).map(q => q.split('/').pop()).join(' '));

  const v = await p5.evaluate(async () => {
    const r = {}, wait = ms => new Promise(z => setTimeout(z, ms));
    Sound.lsSet('neo-music', '1'); Sound.lsSet('neo-sfx', '1');
    G.newGame('aud-cam', 'moderate', 'medium'); Screens._demo = false; Screens.show('playing'); S.paused = false;
    G.freeVis = false; G.updateVisibility();
    const plays = [];
    const orig = Sound._sample.bind(Sound);
    Sound._sample = (n, o) => { const x = orig(n, o); if (x) plays.push({ n, g: o.gain, t: Sound.ctx.currentTime, d: Sound._buf[n].duration / (o.rate || 1) }); return x; };
    // ---- the camera: the middle loud, the edge quiet, off camera nothing
    const TL = CFG.TILE, z = R.cam.z;
    const top = R.topReserve || 0, H = R.viewH() - (R.bottomReserve || 0);
    const at = (fx, fy) => ({ x: (R.cam.x + fx * R.viewW() / z) / TL, y: (R.cam.y + (top + fy * (H - top)) / z) / TL });
    const c = at(0.5, 0.5), e = at(0.98, 0.5), off = at(1.6, 0.5);
    r.place = { centre: Sound.place(c.x, c.y), edge: Sound.place(e.x, e.y), off: Sound.place(off.x, off.y) };
    // ---- a blow: off camera is not heard; ours lead, theirs faint, theirs alone heard
    Sound.onWorldChange();
    r.offHeard = Sound.at('sword', off.x, off.y, 'P');
    Sound.onWorldChange(); plays.length = 0;
    const ownSword = Sound.at('sword', c.x, c.y, 'P');
    const foeLvlUnder = (Sound._sfxLast.boulder = -1e9, Sound.at('boulder', c.x, c.y, 'A'), plays.find(q => q.n === 'boulder'));
    Sound.onWorldChange(); plays.length = 0;
    Sound.at('boulder', c.x, c.y, 'P'); const ownB = plays.find(q => q.n === 'boulder');
    Sound.onWorldChange(); plays.length = 0; Sound._sfxLive = {};   // (the last two boulders are still falling: the cap is per sound)
    Sound.at('boulder', c.x, c.y, 'A'); const foeAlone = plays.find(q => q.n === 'boulder');
    r.blows = { ownSword, under: foeLvlUnder && ownB ? foeLvlUnder.g / (ownB.g || 1) : null, alone: foeAlone && ownB ? foeAlone.g / ownB.g : null };
    // a foe's blow on ground the player cannot see is not heard
    let fogTile = null;
    for (let y = 1; y < CFG.H - 1 && !fogTile; y++) for (let x = 1; x < CFG.W - 1; x++) if (!G.visibleAt(x, y)) { fogTile = { x, y }; break; }
    if (fogTile) { R.cam.x = (fogTile.x + 0.5) * TL - R.viewW() / z / 2; R.cam.y = (fogTile.y + 0.5) * TL - (top + (H - top) / 2) / z; }
    Sound.onWorldChange();
    r.fogHeard = fogTile ? Sound.at('sword', fogTile.x + 0.5, fogTile.y + 0.5, 'A') : 'no fog';
    // ---- the din: a busy town in view, never more than WORK_MAX at once, never closer than WORK_GAP
    const tc = Bld.tcOf('P');
    R.cam.x = Bld.cx(tc) * TL - R.viewW() / z / 2; R.cam.y = Bld.cy(tc) * TL - (top + (H - top) / 2) / z;
    G.freeVis = true; G.updateVisibility();
    const tiles = t => { const o = []; for (let dy = -8; dy <= 8; dy++) for (let dx = -10; dx <= 10; dx++) { const x = tc.x + dx, y = tc.y + dy; if (MapGen.inB(x, y) && S.map.terrain[MapGen.idx(x, y)] === t) o.push({ x, y }); } return o; };
    const forest = tiles(T.FOREST), hills = tiles(T.HILLS);
    for (let i = 0; i < 8; i++) Units.spawn('villager', 'P', tc.x + (i % 3), tc.y + 2 + (i / 3 | 0));
    const vs = S.units.filter(u => u.owner === 'P' && Units.isVillager(u));
    vs.forEach((u, i) => { const f = i % 2 ? hills[i] : forest[i]; if (f) Units.assignGather(u, f.x, f.y); });
    // a rival woodcutter in plain view is not ours to hear
    const ra = Units.spawn('villager', 'A', tc.x + 1, tc.y + 3); ra.task = { type: 'gather', res: 'wood', x: tc.x, y: tc.y };
    r.rivalWork = Sound.workKind(ra);
    Sound.onWorldChange(); plays.length = 0;
    await wait(9000);
    const work = plays.filter(q => ['chop', 'chip', 'gold', 'rake', 'hammer'].includes(q.n));
    let maxC = 0, minGap = Infinity;
    for (let i = 0; i < work.length; i++) {
      maxC = Math.max(maxC, work.filter(f => f.t <= work[i].t && f.t + f.d > work[i].t).length);
      if (i) minGap = Math.min(minGap, work[i].t - work[i - 1].t);
    }
    r.din = { n: work.length, maxC, minGap, kinds: [...new Set(work.map(q => q.n))], working: vs.map(u => Sound.workKind(u)).filter(Boolean).length };
    // ---- the battle
    S.units = S.units.filter(u => u.owner === 'P' || u.owner === 'W');
    S.buildings = S.buildings.filter(b => !(b.owner === 'A' && (b.key === 'tower' || b.key === 'warcamp'))); Bld._block = null;
    S.peace = false;
    const ftc = Bld.tcOf('A'), fx = Bld.cx(ftc), fy = Bld.cy(ftc), FR = Bld.tcRadius(ftc);
    const spot = d => { for (let a = 0; a < 96; a++) { const th = a / 96 * Math.PI * 2, x = Math.floor(fx + Math.cos(th) * d), y = Math.floor(fy + Math.sin(th) * d); if (MapGen.onBoard(x, y) && Path.passable(x, y, 'P') && !Bld.at(x, y)) return { x, y }; } return null; };
    const far = spot(FR * 3.2), near = spot(FR * 1.1);
    const sol = [0, 1, 2].map(() => Units.spawn('defender', 'P', far.x + 0.5, far.y + 0.5));
    for (const s of sol) { s.defend = false; Units.moveTo(s, near.x, near.y); }   // the player's march order
    // the rival's hall unfound: the march says nothing
    for (let dy = -2; dy < 4; dy++) for (let dx = -2; dx < 4; dx++) S.map.explored[MapGen.idx(ftc.x + dx, ftc.y + dy)] = 0;
    r.blind = Sound.warRead();
    for (let dy = -12; dy < 13; dy++) for (let dx = -12; dx < 13; dx++) if (MapGen.inB(ftc.x + dx, ftc.y + dy)) S.map.explored[MapGen.idx(ftc.x + dx, ftc.y + dy)] = 1;
    r.march = Sound.warRead();
    await wait(800);
    r.intro = { mode: Sound._battle.mode, beatIn: Sound._battle.beatAt - Sound.ctx.currentTime, eta: r.march.eta, theme: Sound._theme.g.gain.value };
    // a fight: the beat now
    const foe = Units.spawn('defender', 'A', near.x + 0.5, near.y + 0.5);
    for (const s of sol) s.tUnit = foe.id;
    await wait(700);
    r.fight = { read: Sound.warRead().fight, beatIn: Sound._battle.beatAt - Sound.ctx.currentTime };
    // over: fades back to the theme
    S.units = S.units.filter(u => !sol.includes(u) && u !== foe);
    const hold = Sound.BATTLE.hold; Sound.BATTLE.hold = 1;
    await wait(2200);
    r.after = { mode: Sound._battle.mode };
    await wait(3500);
    r.after.theme = Sound._theme.g.gain.value;
    Sound.BATTLE.hold = hold;
    // a fight in your own town is being attacked — not this music's
    const d1 = Units.spawn('defender', 'P', Bld.cx(tc) + 2, Bld.cy(tc)), rd = Units.spawn('raider', 'R', Bld.cx(tc) + 3, Bld.cy(tc));
    d1.tUnit = rd.id;
    r.home = Sound.warRead();
    await wait(800);
    r.homeMode = Sound._battle.mode;
    // the game ends mid-battle: it ENDS, and the theme waits for the next world
    S.units = S.units.filter(u => u !== d1 && u !== rd);
    const s2 = Units.spawn('defender', 'P', near.x + 0.5, near.y + 0.5), f2 = Units.spawn('defender', 'A', near.x + 0.5, near.y + 1.5);
    s2.tUnit = f2.id;
    await wait(800);
    r.overStart = Sound._battle.mode;
    S.over = { win: true };
    await wait(800);
    r.over = { mode: Sound._battle.mode, held: Sound._themeHeld };
    Sound.onWorldChange();
    r.over.heldAfter = Sound._themeHeld;
    // the loop's seam: its last sample runs into the bars before its first
    const bat = Sound._bat, B = Sound.BATTLE;
    if (bat) {
      const sr = bat.buf.sampleRate, a = Math.round(B.introEnd * sr), L = bat.loop.length;
      const src = bat.buf.getChannelData(0), lp = bat.loop.getChannelData(0);
      r.seam = { startIsTheHit: lp[0] === src[a], endIsTheLeadIn: Math.abs(lp[L - 1] - src[a - 1]) < 0.02, len: +(L / sr).toFixed(2) };
    }
    return r;
  });
  ck('theMiddleIsLoudTheEdgeQuietOffCameraNothing',
    v.place.centre && v.place.centre.g === 1 && v.place.edge && v.place.edge.g < 0.25 && v.place.off === null && v.offHeard === false,
    JSON.stringify(v.place) + ' off-camera blow heard: ' + v.offHeard);
  ck('ourWeaponsLeadAndTheirsAreFaint', v.blows.ownSword === true && v.blows.under != null && v.blows.under < 0.5,
    'enemy under ours at ' + (v.blows.under == null ? 'silence' : v.blows.under.toFixed(2)) + ' of our level');
  ck('butTheirsAloneAreHeard', v.blows.alone != null && v.blows.alone > 0.7,
    'an undefended town hears the enemy at ' + (v.blows.alone == null ? 'nothing' : v.blows.alone.toFixed(2)) + ' of our level');
  ck('aBlowInTheFogIsNotASound', v.fogHeard === false || v.fogHeard === 'no fog', String(v.fogHeard));
  ck('theWorkIsADinNotAVoicePerHand', v.din.working >= 4 && v.din.n >= 2 && v.din.maxC <= 2 && v.din.minGap >= 0.69 && v.din.n <= 9 / 0.7,
    JSON.stringify(v.din));
  ck('andTheRivalsWorkIsNotOurs', v.rivalWork === null, String(v.rivalWork));
  ck('theMarchIsSilentUntilTheRivalHallIsFound', v.blind.approach === 0, JSON.stringify(v.blind));
  ck('theIntroBuildsOnTheMarchTimedToArrive', v.march.approach === 1 && v.intro.mode === 'on' && v.intro.beatIn > 0 && v.intro.beatIn <= v.intro.eta + 1,
    JSON.stringify(v.intro));
  ck('theFightBringsTheBeatNow', v.fight.read && v.fight.beatIn <= 0.05, JSON.stringify(v.fight));
  ck('andItFadesBackToTheTheme', v.after.mode === 'off' && v.after.theme > 0.5, JSON.stringify(v.after));
  ck('aDefenceAtHomeIsNotTheBattle', !v.home.fight && v.homeMode === 'off', JSON.stringify(v.home) + ' mode ' + v.homeMode);
  ck('theGameOverEndsItAndTheThemeWaits', v.overStart === 'on' && v.over.mode === 'off' && v.over.held === true && v.over.heldAfter === false,
    JSON.stringify(v.over) + ' started ' + v.overStart);
  ck('theLoopsSeamRunsIntoItsStart', !!v.seam && v.seam.startIsTheHit && v.seam.endIsTheLeadIn, JSON.stringify(v.seam));
  await p5.close();
  srv.close();
}

const real = errors.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e));
if (real.length) { fails.push('pageErrors'); res.pageErrors = 'FAIL — ' + real.join(' | '); }
await b.close();

for (const [k, v] of Object.entries(res)) console.log(v.startsWith('PASS') ? '  ✅' : '  ❌', k, '—', v);
if (fails.length) { console.log(`\n${fails.length} FAILURE(S) — the audio contract is broken`); process.exit(1); }
console.log('\nAll audio contract checks passed.');
