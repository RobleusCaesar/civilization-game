/* THE GAME'S VOICE (tests/audio.mjs)
   ==================================================================
   Everything in this file is SYNTHESISED at runtime through Web Audio.
   Not one byte of audio ships, which is the same bargain the rest of the
   game makes with its art: the procedural version is the shipping version,
   it costs nothing on the wire, it loops forever without a seam, and a
   device that refuses to give us an AudioContext simply plays nothing and
   the game is untouched. A 2MB music file on the boot path would undo the
   whole of the load-speed pass for a thing the player can turn off.

   TWO BUSES, TWO SWITCHES, TWO DIALS. Sound effects and music are separate
   all the way down — separate gain nodes, separate localStorage keys,
   separate controls in Settings — because they are separate decisions.
   Plenty of people play with effects on and music off; nobody should have
   to lose the axe to lose the flute.

     neo-sfx        '0' silences effects   (the key UI.cue already used)
     neo-music      '0' silences the music
     neo-sfx-vol    0-100, how loud        (absent = DEFAULT_VOL)
     neo-music-vol  0-100
     absent         means ON, so a new player hears the game

   AND IT SHIPS QUIET. The mix was set by an offline render against a -6dBFS
   peak, which is right for a game somebody chose to listen to and wrong for
   one that starts talking the moment a tab opens: the first report from a
   real player was "far, far too loud" (2026-09-22). The bus gains below are
   still the measured ceiling — they are now what the dial reads at 100 —
   and DEFAULT_VOL starts every new player well under it. The volume is a
   plain amplitude multiplier (0.5 on the dial is half the amplitude, about
   -6dB), because a dial whose number means something is a dial a player can
   set once and forget.

   MUTE AND ZERO ARE THE SAME STATE, deliberately. A speaker icon that says
   "on" over a dial sitting at zero is a control that lies, so sfxOn() asks
   BOTH — is the switch on, and is there any volume — and setSfx(true) lifts
   a zeroed dial back to the default rather than turning on nothing.

   THE BROWSER WILL NOT LET US START. Autoplay policy blocks an AudioContext
   until the user has interacted with the page, and on iOS it suspends again
   whenever the tab goes to the background. So: the context is created
   LAZILY on the first sound anyone asks for, `resume()` is attempted on
   every gesture (Sound.unlock is wired to pointerdown/keydown once), and the
   music starts itself the moment a context becomes usable rather than at
   some fixed moment that may have been blocked. None of this is allowed to
   throw into a caller — every entry point is wrapped, because a missing
   speaker must never cost a frame.

   NOTHING HERE RIDES IN A SAVE. All state is module-level (the R.collapses
   rule): the context, the buses, the music scheduler and the per-effect
   throttle clocks. `Sound.onWorldChange()` resets the throttles so a fresh
   world does not inherit the last one's cooldowns.

   AND IT IS THROTTLED, PER KIND, IN REAL TIME. This is the lesson
   R.workFloat already paid for: twenty villagers chopping wood is twenty
   axe-falls a second, which is not atmosphere, it is a machine gun. Every
   effect declares a minimum gap and a cap on how many may overlap; past
   that the call is dropped. Real time, not game days — the ear does not
   care what the calendar says, and the game runs at several speeds. */
const Sound = {

  /* ---------------- the switches ---------------- */

  /* localStorage can THROW (iOS "Block All Cookies", a partitioned iframe),
     and it did — Screens.lsGet learned this the hard way during onboarding,
     where a throwing storage meant a toggle that could not turn anything
     off, forever. Same fallback here: an in-memory map keeps the choice for
     the session when the real store is unavailable. */
  _mem: {},
  lsGet(k) {
    try { return localStorage.getItem(k); }
    catch (e) { return Object.prototype.hasOwnProperty.call(this._mem, k) ? this._mem[k] : null; }
  },
  lsSet(k, v) {
    try { localStorage.setItem(k, v); } catch (e) { this._mem[k] = v; }
  },

  /* THE DIALS. 0-100, stored as text next to the switches. Everything else
     in this file reads volume through vol()/gain() so there is exactly one
     place that knows the scale. */
  DEFAULT_VOL: { sfx: 50, music: 40 },
  VOL_KEY: { sfx: 'neo-sfx-vol', music: 'neo-music-vol' },
  vol(bus) {
    const raw = this.lsGet(this.VOL_KEY[bus]);
    const n = raw == null ? this.DEFAULT_VOL[bus] : parseInt(raw, 10);
    return isFinite(n) ? Math.max(0, Math.min(100, n)) : this.DEFAULT_VOL[bus];
  },
  // the bus's actual gain: the measured ceiling scaled by the dial
  gainOf(bus) {
    return (bus === 'sfx' ? this.SFX_GAIN : this.MUSIC_GAIN) * (this.vol(bus) / 100);
  },
  /* Set a dial. Applies LIVE — a player dragging the slider in Settings
     hears the change while they drag, which is the only way to set a level
     — and a drag down to zero mutes, a drag up from zero unmutes, so the
     speaker icon and the dial can never disagree. Returns the clamped value. */
  setVol(bus, v) {
    v = Math.max(0, Math.min(100, Math.round(+v || 0)));
    this.lsSet(this.VOL_KEY[bus], String(v));
    const key = bus === 'sfx' ? 'neo-sfx' : 'neo-music';
    if (v > 0 && this.lsGet(key) === '0') this.lsSet(key, '1');   // a lift off zero is an unmute
    this.applyVol();
    // …and the music has to be told, because its bus is ramped, not set
    if (bus === 'music') { if (v > 0) this.unlock(); else this.stopMusic(); }
    return v;
  },
  /* Push both dials at the live buses. Safe before there is a context (there
     is nothing to push at yet) and safe to call as often as you like. */
  applyVol() {
    try {
      if (this.sfxBus) this.sfxBus.gain.value = this.gainOf('sfx');
      if (this.musicBus && this._music && this.ctx) {
        const g = this.musicBus.gain, t = this.ctx.currentTime;
        g.cancelScheduledValues(t);
        g.setValueAtTime(Math.max(0.0001, g.value), t);
        // a short ramp, not a jump: a step on a sustained pad is a click
        g.linearRampToValueAtTime(Math.max(0.0001, this.gainOf('music')), t + 0.08);
      }
    } catch (e) { /* a dial must never cost a frame */ }
  },

  // "will anything actually be heard" — the switch AND the dial, because a
  // speaker icon reading ON over a dial at zero is a control that lies
  sfxOn() { return this.lsGet('neo-sfx') !== '0' && this.vol('sfx') > 0; },
  musicOn() { return this.lsGet('neo-music') !== '0' && this.vol('music') > 0; },

  /* The toggles. Each returns the NEW state so a caller can paint a button
     from the return value rather than re-reading the store. Turning music
     off stops it immediately (a fade, not a cut — a hard stop on a pad is a
     click); turning it on starts it if a context is already usable. */
  setSfx(on) {
    this.lsSet('neo-sfx', on ? '1' : '0');
    // un-muting a dial that is at zero must produce sound, not silence
    if (on && this.vol('sfx') === 0) this.lsSet(this.VOL_KEY.sfx, String(this.DEFAULT_VOL.sfx));
    this.applyVol();
    if (on) this.unlock();
    return on;
  },
  setMusic(on) {
    this.lsSet('neo-music', on ? '1' : '0');
    if (on && this.vol('music') === 0) this.lsSet(this.VOL_KEY.music, String(this.DEFAULT_VOL.music));
    // unlock() is the ONE place that knows resume() is async; setMusic used to
    // call startMusic straight after it and hit the same suspended-context race
    if (on) this.unlock(); else this.stopMusic();
    return on;
  },

  /* ---------------- the context and the two buses ---------------- */

  ctx: null, sfxBus: null, musicBus: null, master: null,
  /* LEVELS, measured rather than guessed (scratchpad/render-audio.mjs renders
     this same code through an OfflineAudioContext and reports peak and RMS).
     The first cut peaked at 0.077 — about -22dBFS, which is a game nobody can
     hear without turning the system up and then being deafened by everything
     else. These land the mix near -6dBFS peak with the music sitting well
     under the effects. */
  // what the dials read at 100 — the measured ceiling, not the shipping level
  SFX_GAIN: 2.2, MUSIC_GAIN: 0.85,

  /* Lazily built. Returns null when the browser will not give us audio at
     all, which every caller treats as "then there is no sound", never as an
     error. */
  ac() {
    if (this.ctx) return this.ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      const ctx = new AC();
      /* ONE MASTER COMPRESSOR, and it is not polish — it is what lets the
         buses run loud enough to hear. Ten voices are allowed to overlap, and
         ten effects that each peak at a fifth of full scale would sum past
         1.0 and HARD-CLIP, which is the nastiest sound a browser can make.
         The compressor catches those peaks so the quiet single axe-fall can
         still be mixed loud. Gentle settings: it should be inaudible on one
         sound and only working during a battle. */
      let master = ctx.destination;
      try {
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -14; comp.knee.value = 14; comp.ratio.value = 6;
        comp.attack.value = 0.004; comp.release.value = 0.20;
        comp.connect(ctx.destination); master = comp;
      } catch (e) { /* no compressor — the buses just run into the speakers */ }
      const sfx = ctx.createGain(); sfx.gain.value = this.gainOf('sfx'); sfx.connect(master);
      const mus = ctx.createGain(); mus.gain.value = 0;            // faded up by startMusic
      mus.connect(master);
      this.ctx = ctx; this.sfxBus = sfx; this.musicBus = mus; this.master = master;
      return ctx;
    } catch (e) { return null; }
  },

  /* Called from a real user gesture (and harmlessly from anywhere else).
     Resuming a suspended context is the only thing that makes audio work at
     all after an autoplay block, and it has to be tried repeatedly because
     iOS re-suspends on every trip to the background. */
  unlock() {
    try {
      const ctx = this.ac();
      if (!ctx) return;
      const go = () => { try { if (this.musicOn()) this.startMusic(); } catch (e) {} };
      /* resume() IS ASYNCHRONOUS, and that is not a detail. Calling it and
         then asking `ctx.state` in the next statement reads 'suspended'
         still, so startMusic bailed and the music did not begin — on the
         FIRST gesture, every time, which is the only gesture most players
         will make before deciding this game has no music. It took an offline
         render of the real module to catch: the bed came out digitally
         silent while the effects were fine. Wait for the promise, and keep a
         statechange listener as the belt to that brace, since a context can
         also come back on its own after the tab returns. */
      if (ctx.state === 'suspended') {
        const r = ctx.resume();
        if (r && r.then) r.then(go, () => {}); else go();
      } else go();
      if (!this._stateHook) {
        this._stateHook = 1;
        try { ctx.addEventListener('statechange', () => { if (ctx.state === 'running') go(); }); } catch (e) {}
      }
    } catch (e) {}
  },

  /* ---------------- the throttle ---------------- */

  /* Per-KIND minimum gap in seconds, and how many of that kind may be
     sounding at once. A kind with no entry is ungated — that is for the
     one-off events (a building finishing, a victory) where every occurrence
     is worth hearing. The work sounds are the throttled ones, because they
     are the ones that repeat forever. */
  GAP: {
    chop: 0.40, mine: 0.45, farm: 0.55, build: 0.50,
    hit: 0.11, arrow: 0.16, miss: 0.30, die: 0.35,
    raid: 6.0,          // the alarm is a warning, not a siege soundtrack
    done: 0.30, train: 0.30, place: 0.20,
    tick: 0.05, bad: 0.25,
  },
  _last: {},          // kind -> last time it sounded, in ctx time
  _live: 0,           // how many voices are sounding right now
  MAX_VOICES: 10,     // a town under siege must not turn into white noise

  /* True when this kind may sound NOW. Stamps the clock as a side effect,
     so a caller that asks is a caller that plays. */
  _due(kind, now) {
    if (this._live >= this.MAX_VOICES) return false;
    const gap = this.GAP[kind];
    if (gap == null) return true;
    const last = this._last[kind];
    if (last != null && now - last < gap) return false;
    this._last[kind] = now;
    return true;
  },

  onWorldChange() { this._last = {}; this._live = 0; },

  /* ---------------- the voice ---------------- */

  /* ONE note. Everything the game says is built out of these: a waveform, a
     pitch (optionally sliding), an envelope, and an optional lowpass to take
     the edge off. Kept deliberately small — the character comes from how the
     effects below stack them, not from a synth engine nobody can read.

     The envelope uses exponentialRamp, which CANNOT reach or pass zero, so
     every ramp lands on 0.0001 and the node is stopped after it. A linear
     ramp to 0 is what makes a click. */
  _note(o) {
    const ctx = this.ac(); if (!ctx) return;
    const t0 = (o.at || ctx.currentTime) + (o.delay || 0);
    const dur = o.dur || 0.12;
    const osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.hz, t0);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.to), t0 + dur);
    let node = osc;
    if (o.lp) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.setValueAtTime(o.lp, t0);
      if (o.lpTo) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.lpTo), t0 + dur);
      osc.connect(f); node = f;
    }
    const g = ctx.createGain();
    const peak = Math.max(0.0002, o.gain == null ? 0.18 : o.gain);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(dur * 0.4, o.atk == null ? 0.008 : o.atk));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    node.connect(g).connect(o.bus || this.sfxBus);
    this._live++;
    osc.onended = () => { this._live = Math.max(0, this._live - 1); };
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  },

  /* A burst of filtered NOISE — what every impact, footfall and axe-fall is
     actually made of. Tonal oscillators alone cannot say "wood" or "stone";
     the pitch of the noise band is what names the material. The buffer is
     built once and reused, because allocating a second of noise per swing is
     a garbage-collection pause in the middle of a fight. */
  _noiseBuf: null,
  _noise(o) {
    const ctx = this.ac(); if (!ctx) return;
    if (!this._noiseBuf) {
      const n = Math.floor(ctx.sampleRate * 0.5);
      const buf = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let seed = 22222;                          // deterministic: the same crack every time
      for (let i = 0; i < n; i++) { seed = (seed * 1664525 + 1013904223) | 0; d[i] = (seed / 2147483648) * 0.9; }
      this._noiseBuf = buf;
    }
    const t0 = (o.at || ctx.currentTime) + (o.delay || 0);
    const dur = o.dur || 0.09;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    src.loop = true;
    src.playbackRate.value = o.rate || 1;
    const f = ctx.createBiquadFilter();
    f.type = o.filter || 'bandpass';
    f.frequency.setValueAtTime(o.hz, t0);
    if (o.to) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + dur);
    f.Q.value = o.q == null ? 1.2 : o.q;
    const g = ctx.createGain();
    const peak = Math.max(0.0002, o.gain == null ? 0.16 : o.gain);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + (o.atk == null ? 0.004 : o.atk));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(o.bus || this.sfxBus);
    this._live++;
    src.onended = () => { this._live = Math.max(0, this._live - 1); };
    src.start(t0); src.stop(t0 + dur + 0.02);
  },

  /* ---------------- the effects ---------------- */

  /* THE ONE DOOR. Every sound in the game comes through Sound.play(kind);
     that is what makes the mute switch, the throttle and the voice cap
     impossible to forget at a call site. An unknown kind is silently
     ignored rather than throwing — a typo in a caller must not break the
     frame it was called from.

     The vocabulary, and what each one is made of:

       chop    a dull axe into wood — a low noise thud plus a woody knock
       mine    pick on stone — a brighter, harder crack with a ring
       farm    a soft scythe brush, almost pitchless
       build   a hammer blow on a frame
       done    a work finished: a small rising third, the good news
       hit     a melee landing — body-weight noise, no pitch
       arrow   a bow's release and the air behind it
       miss    the same air, no impact, pitched down
       die     a unit falls: a short descending tone under a noise fall
       raid    the alarm: a low horn, the only sound that is allowed to be big
       place   a building set down
       train   a unit walks out of its yard
       tick    the UI's own small acknowledgement (UI.cue's old blip)
       bad     a refusal
       bond    the homestead's rising chime (moved here from UI.cue)
       win     the run is won
       lose    the run is lost */
  play(kind, opts) {
    try {
      if (!this.sfxOn()) return false;
      const ctx = this.ac(); if (!ctx) return false;
      if (ctx.state === 'suspended') { ctx.resume(); }
      const now = ctx.currentTime;
      if (!this._due(kind, now)) return false;
      const v = (opts && opts.gain != null) ? opts.gain : 1;
      const F = this._VOICES[kind];
      if (!F) return false;
      F.call(this, now, v);
      return true;
    } catch (e) { return false; }   // no speaker — the visuals carry it
  },

  _VOICES: {
    chop(t, v) {
      this._noise({ at: t, hz: 320, to: 140, dur: 0.11, q: 1.1, gain: 0.20 * v });
      this._note({ at: t, hz: 150, to: 92, dur: 0.10, type: 'triangle', gain: 0.10 * v, lp: 900 });
    },
    mine(t, v) {
      this._noise({ at: t, hz: 1900, to: 700, dur: 0.09, q: 2.2, gain: 0.16 * v });
      this._note({ at: t, hz: 430, to: 300, dur: 0.13, type: 'triangle', gain: 0.07 * v, lp: 2600 });
    },
    farm(t, v) {
      this._noise({ at: t, hz: 2600, to: 1500, dur: 0.16, q: 0.7, gain: 0.10 * v, filter: 'bandpass', atk: 0.03 });
    },
    build(t, v) {
      this._noise({ at: t, hz: 520, to: 200, dur: 0.10, q: 1.4, gain: 0.17 * v });
      this._note({ at: t, hz: 210, to: 150, dur: 0.09, type: 'square', gain: 0.05 * v, lp: 700 });
    },
    done(t, v) {
      [523, 659, 784].forEach((hz, i) =>
        this._note({ at: t, delay: i * 0.075, hz, dur: 0.30, type: 'sine', gain: 0.11 * v }));
    },
    hit(t, v) {
      this._noise({ at: t, hz: 260, to: 110, dur: 0.10, q: 0.9, gain: 0.20 * v });
    },
    arrow(t, v) {
      this._noise({ at: t, hz: 1200, to: 3200, dur: 0.13, q: 0.8, gain: 0.10 * v, atk: 0.02 });
    },
    miss(t, v) {
      this._noise({ at: t, hz: 900, to: 380, dur: 0.16, q: 0.6, gain: 0.07 * v, atk: 0.03 });
    },
    die(t, v) {
      this._note({ at: t, hz: 300, to: 90, dur: 0.34, type: 'triangle', gain: 0.10 * v, lp: 1200, lpTo: 300 });
      this._noise({ at: t, delay: 0.05, hz: 400, to: 150, dur: 0.20, q: 0.7, gain: 0.08 * v });
    },
    /* THE ALARM is the one sound allowed to be big, because it is the only
       one the player MUST hear over everything else: two low horn notes,
       the second a fourth below, the shape every warning horn in the world
       has. It is deliberately not pretty. */
    raid(t, v) {
      this._note({ at: t, hz: 196, dur: 0.55, type: 'sawtooth', gain: 0.13 * v, lp: 620, atk: 0.05 });
      this._note({ at: t, delay: 0.30, hz: 147, dur: 0.75, type: 'sawtooth', gain: 0.14 * v, lp: 520, atk: 0.06 });
    },
    place(t, v) {
      this._noise({ at: t, hz: 700, to: 180, dur: 0.16, q: 0.9, gain: 0.15 * v });
      this._note({ at: t, hz: 330, to: 247, dur: 0.14, type: 'triangle', gain: 0.07 * v, lp: 1400 });
    },
    train(t, v) {
      this._note({ at: t, hz: 392, to: 523, dur: 0.16, type: 'triangle', gain: 0.09 * v });
    },
    tick(t, v) {
      this._note({ at: t, hz: 440, dur: 0.06, type: 'triangle', gain: 0.07 * v });
    },
    bad(t, v) {
      this._note({ at: t, hz: 196, to: 150, dur: 0.14, type: 'triangle', gain: 0.09 * v });
    },
    bond(t, v) {
      [784, 988, 1319].forEach((hz, i) =>
        this._note({ at: t, delay: i * 0.085, hz, dur: 0.34, type: 'sine', gain: 0.09 * v }));
    },
    win(t, v) {
      [523, 659, 784, 1047].forEach((hz, i) =>
        this._note({ at: t, delay: i * 0.13, hz, dur: 0.6, type: 'sine', gain: 0.12 * v }));
    },
    lose(t, v) {
      [392, 330, 262].forEach((hz, i) =>
        this._note({ at: t, delay: i * 0.20, hz, dur: 0.8, type: 'triangle', gain: 0.11 * v, lp: 900 }));
    },
  },

  /* ================= THE MUSIC =================
     A relaxing, soft, endlessly loopable bed — and "loopable" here is not a
     seam hidden well, it is a piece with NO seam, because nothing is a
     recording. A scheduler wakes a few times a second and writes the next
     couple of bars into the audio clock; it can run until the sun burns out
     and never repeat exactly, which is what stops a background track from
     becoming the most irritating thing in the room by the second hour.

     The material is deliberately thin: a slow drifting drone two octaves
     below, a five-note scale with no semitone in it (a minor pentatonic —
     there is no wrong note in it, so a random walk cannot play anything
     ugly), and long soft attacks so nothing ever pops out of the mix. It
     sits under the game, never on top of it: MUSIC_GAIN is a third of the
     effects bus, and the whole thing is lowpassed so it stays behind the
     axe-falls.

     SCHEDULING, and why it is not setInterval-with-play: Web Audio's clock
     and the browser's timer clock are different clocks, and a note started
     "now" from a timer lands wherever the main thread happened to be. So
     the scheduler works AHEAD — it looks at the audio clock, and schedules
     every note that falls inside the next LOOKAHEAD seconds at its exact
     time. A frame that takes 200ms cannot make the music stutter, because
     the notes were already written into the clock before it started. */

  // A minor pentatonic, two octaves — the whole vocabulary of the piece
  SCALE: [220.00, 261.63, 293.66, 329.63, 392.00,
          440.00, 523.25, 587.33, 659.25, 783.99],
  ROOT: 110.00,                 // the drone, A2
  STEP: 2.2,                    // seconds between melody slots
  LOOKAHEAD: 2.5,               // how far ahead of the clock we write
  TICK_MS: 700,                 // how often the scheduler wakes

  _music: null,                 // { timer, next, i, drone[] } — never in a save

  startMusic() {
    try {
      if (this._music || !this.musicOn()) return false;
      const ctx = this.ac(); if (!ctx) return false;
      if (ctx.state === 'suspended') { ctx.resume(); if (ctx.state === 'suspended') return false; }
      // the bus comes up over four seconds: music that starts AT volume
      // announces itself, and this is meant to be noticed only if you listen
      const g = this.musicBus.gain;
      g.cancelScheduledValues(ctx.currentTime);
      g.setValueAtTime(Math.max(0.0001, g.value), ctx.currentTime);
      g.exponentialRampToValueAtTime(Math.max(0.0001, this.gainOf('music')), ctx.currentTime + 4);

      // THE DRONE: two detuned saws through a slow lowpass, an octave apart.
      // Detuning is what stops two oscillators sounding like one thin one —
      // the beating between them is the whole warmth of the pad.
      const drone = [];
      for (const [mult, cents, gain] of [[1, -4, 0.10], [1, +5, 0.09], [2, +2, 0.045]]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = this.ROOT * mult;
        o.detune.value = cents;
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = 340; f.Q.value = 0.6;
        const gn = ctx.createGain(); gn.gain.value = gain;
        o.connect(f).connect(gn).connect(this.musicBus);
        o.start();
        drone.push({ o, f });
      }
      this._music = { next: ctx.currentTime + 0.4, i: 0, drone, timer: 0, phase: 0 };
      this._music.timer = setInterval(() => this._tickMusic(), this.TICK_MS);
      this._tickMusic();
      return true;
    } catch (e) { return false; }
  },

  stopMusic() {
    try {
      const m = this._music; if (!m) return;
      this._music = null;
      clearInterval(m.timer);
      const ctx = this.ctx;
      if (!ctx) return;
      // fade, then tear down: stopping a drone at full gain is a loud click
      const g = this.musicBus.gain;
      g.cancelScheduledValues(ctx.currentTime);
      g.setValueAtTime(Math.max(0.0001, g.value), ctx.currentTime);
      g.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.2);
      for (const d of m.drone) { try { d.o.stop(ctx.currentTime + 1.4); } catch (e) {} }
    } catch (e) {}
  },

  musicPlaying() { return !!this._music; },

  /* One wake of the scheduler: write every slot that falls inside the
     lookahead window, then leave. Deterministic-ish but never repeating —
     the melody is a random WALK over the scale (small steps, so it sounds
     like a line rather than a scatter), and every fourth slot is a rest,
     because silence is most of what makes a bed restful. */
  _tickMusic() {
    try {
      const m = this._music, ctx = this.ctx;
      if (!m || !ctx) return;
      if (ctx.state === 'suspended') return;         // tab in the background; pick up on return
      const until = ctx.currentTime + this.LOOKAHEAD;
      let guard = 0;
      while (m.next < until && guard++ < 16) {
        const at = m.next;
        m.i++;
        // a slow breath over the pad: the filter opens and closes across
        // about a minute and a half, which is the only "arrangement" here
        m.phase += this.STEP / 90;
        const open = 300 + 150 * (0.5 + 0.5 * Math.sin(m.phase * Math.PI * 2));
        for (const d of m.drone) {
          try { d.f.frequency.setTargetAtTime(open, at, 3); } catch (e) {}
        }
        if (m.i % 4 !== 3) {                          // three notes, then a rest
          const step = (Math.random() * 3 | 0) - 1;   // -1, 0, +1 — a walk, not a jump
          m.slot = Math.max(0, Math.min(this.SCALE.length - 1, (m.slot == null ? 4 : m.slot) + step));
          const hz = this.SCALE[m.slot];
          // the voice: a soft sine with a long attack and a longer tail, and
          // a fifth above it at a third the level for body
          this._note({ at, hz, dur: 2.6, type: 'sine', gain: 0.085, atk: 0.55, bus: this.musicBus, lp: 2200 });
          this._note({ at: at + 0.09, hz: hz * 1.5, dur: 2.0, type: 'sine', gain: 0.028, atk: 0.6, bus: this.musicBus, lp: 1800 });
        }
        m.next += this.STEP;
      }
    } catch (e) {}
  },

  /* ---------------- wiring ---------------- */

  /* Armed once from the page. The gesture listeners are what actually make
     audio possible at all under autoplay policy, and `visibilitychange` is
     what brings it back after iOS suspends the context in the background. */
  init() {
    try {
      const wake = () => this.unlock();
      for (const ev of ['pointerdown', 'touchstart', 'mousedown', 'keydown'])
        window.addEventListener(ev, wake, { passive: true });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') this.unlock();
        else if (this._music && this.ctx) { try { this.ctx.suspend(); } catch (e) {} }
      });
    } catch (e) {}
  },
};
window.Sound = Sound;
