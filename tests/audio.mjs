/* THE GAME'S VOICE — the contract for js/audio.js (Sprint 5).

   What this pins, and why each one is worth a check:

   1. NOT ONE BYTE OF AUDIO SHIPS. Every sound is synthesised at runtime, so
      the boot path is untouched by a feature the player can switch off. A
      dropped-in .mp3 would pass every other check here and quietly undo the
      load-speed pass, so the check is on the REPO: no audio file, anywhere.
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
   8. THE MUSIC IS GENERATED, NOT LOOPED. It schedules ahead of the audio
      clock and keeps producing new material, which is what "loopable" means
      when there is no recording to loop.
   9. THE WIRING IS REAL: the settings rows paint from the live state, and
      the game's own events reach the one door.

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
  ck('notOneByteOfAudioShips', found.length === 0,
    found.length ? found.join(', ') : 'every sound is synthesised at runtime');
  const src = readFileSync(join(root, 'js/audio.js'), 'utf8');
  ck('andTheModuleFetchesNothing', !/new Audio\(|\.src\s*=|fetch\(|XMLHttpRequest/.test(src),
    'no loader, no decode, nothing on the wire');
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

  /* ---- 8. the music is GENERATED: it schedules ahead and keeps going ---- */
  Sound.setSfx(true); Sound.setMusic(true);
  await wait(150);
  const m1 = Sound._music && Sound._music.i;
  const n1 = Sound._music && Sound._music.next;
  await wait(1400);
  const m2 = Sound._music && Sound._music.i;
  r.music = { started: !!Sound._music, i1: m1, i2: m2, aheadOfClock: n1 > Sound.ctx.currentTime,
    drone: Sound._music ? Sound._music.drone.length : 0 };
  Sound.setMusic(false);

  /* ---- 9. the settings rows paint from the live state ---- */
  Sound.setSfx(false); Sound.setMusic(true);
  Screens.paintAudioRows();
  const sel = (id) => [...document.getElementById(id).querySelectorAll('.abtn')]
    .filter(x => x.classList.contains('sel')).map(x => x.dataset.v).join(',');
  r.rows = { sfx: sel('setSfx'), music: sel('setMusic') };
  Sound.setSfx(true); Sound.setMusic(false);
  Screens.paintAudioRows();
  r.rows2 = { sfx: sel('setSfx'), music: sel('setMusic') };
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
ck('theMusicIsGeneratedNotLooped',
  out.music.started && out.music.i2 > out.music.i1 && out.music.aheadOfClock && out.music.drone >= 2,
  'slots ' + out.music.i1 + ' → ' + out.music.i2 + ', scheduled ahead: ' + out.music.aheadOfClock +
  ', drone voices ' + out.music.drone);
ck('theSettingsRowsReadTheLiveState',
  out.rows.sfx === '0' && out.rows.music === '1' && out.rows2.sfx === '1' && out.rows2.music === '0',
  JSON.stringify(out.rows) + ' then ' + JSON.stringify(out.rows2));

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
    'work is heard where it is seen (render.workFloat)': /Sound\.play\(txt === '\+wood'/.test(S_('js/render.js')),
    'a work finished (Bld.finish)': /Sound\.play\('done'\)/.test(S_('js/buildings.js')),
    'a unit trained (Bld)': /Sound\.play\('train'\)/.test(S_('js/buildings.js')),
    'blows and deaths (Units.damage)': /Sound\.play\(rng >= 4 \? 'arrow' : 'hit'\)/.test(S_('js/units.js')) &&
                                       /Sound\.play\('die'\)/.test(S_('js/units.js')),
    'the alarm (Combat.hitBuilding)': /Sound\.play\('raid'\)/.test(S_('js/combat.js')),
    'UI.cue goes through it': /Sound\.play\(kind === 'ok'/.test(S_('js/ui.js')),
  };
  const missing = Object.entries(hooks).filter(([, ok]) => !ok).map(([k]) => k);
  ck('theGamesOwnEventsReachTheOneDoor', missing.length === 0, missing.join('; ') || '');
  /* THE RIVAL'S WORK IS NOT OURS TO HEAR — a chop from across the fog would
     tell the player something the fog exists to hide. */
  ck('andOnlyTheOwnTribeIsAudible',
    /u\.owner === 'P' && typeof Sound !== 'undefined'/.test(S_('js/render.js')) &&
    /b\.owner === 'P' && typeof Sound !== 'undefined'/.test(S_('js/buildings.js')),
    'work and works alike are gated on the owner');
}

const real = errors.filter(e => !/supabase|fetch|TUNNEL|net::/.test(e));
if (real.length) { fails.push('pageErrors'); res.pageErrors = 'FAIL — ' + real.join(' | '); }
await b.close();

for (const [k, v] of Object.entries(res)) console.log(v.startsWith('PASS') ? '  ✅' : '  ❌', k, '—', v);
if (fails.length) { console.log(`\n${fails.length} FAILURE(S) — the audio contract is broken`); process.exit(1); }
console.log('\nAll audio contract checks passed.');
