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
      const go = () => { try { if (this.musicOn()) this.startMusic(); if (this.sfxOn()) this._sfxLoad(); } catch (e) {} };
      /* THE THEME IS STARTED INSIDE THE GESTURE: iOS lets a media element
         play only from a tap's own handler, and resume() below answers
         later. Started here at a whisper; startMusic brings it up. Once
         played from a tap the element may be paused and played again from
         a timer (the battle hands it back that way). */
      if (this.musicOn() && !this._music) {
        const th = this._themeEnsure();
        if (th && th.el.paused && this._battle.mode === 'off' && !this._themeHeld) {
          try { const p = th.el.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
        }
      }
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
    hit: 0.11, arrow: 0.16, miss: 0.30, die: 0.80,
    raid: 6.0,          // the alarm is a warning, not a siege soundtrack
    thunder: 1.2, impact: 2.0,   // the sky's two voices: one strike, one fall
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

  onWorldChange() {
    this._last = {}; this._live = 0;
    this._sfxLast = {}; this._dinDue = {}; this._heat = {}; this._ownAt = -1e9;
    try {
      if (this._gallop) { this._gallop.s.stop(); this._gallop = null; }
      if (this._battle.mode !== 'off') this._battleStop(1.5, false);
      if (this._themeHeld) { this._themeHeld = false; if (this._music && this._music.rec) this._themeIn(3); }
    } catch (e) {}
  },

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
    /* THE SKY'S TWO VOICES (the dry summer's strike, the falling star). Both
       are made of the one noise buffer at very different bands: a THUNDER is
       a bright crack with the strike, then a long low rumble rolling in after
       it; a STAR's IMPACT is a deep thud under a roar that tears down through
       the band, with the earth rattling back down for a second after. */
    thunder(t, v) {
      this._noise({ at: t, hz: 3200, to: 900, dur: 0.16, q: 0.6, gain: 0.26 * v });
      this._noise({ at: t, delay: 0.06, hz: 380, to: 70, dur: 1.9, q: 0.8, gain: 0.30 * v, atk: 0.08, filter: 'lowpass', rate: 0.5 });
      this._noise({ at: t, delay: 0.55, hz: 220, to: 60, dur: 1.4, q: 0.9, gain: 0.20 * v, atk: 0.2, filter: 'lowpass', rate: 0.4 });
    },
    impact(t, v) {
      this._note({ at: t, hz: 92, to: 34, dur: 0.9, type: 'sine', gain: 0.34 * v });
      this._noise({ at: t, hz: 1400, to: 120, dur: 1.1, q: 0.5, gain: 0.28 * v, filter: 'lowpass' });
      this._noise({ at: t, delay: 0.25, hz: 900, to: 300, dur: 0.9, q: 1.6, gain: 0.10 * v, rate: 1.6 });
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
      // THE RECORDED THEME when it can play; the generated bed below is its
      // stand-in (no Web Audio media path, or the file would not load)
      if (this._themeEnsure()) {
        this._music = { rec: true, timer: 0, drone: [] };
        this._themeIn(3);
        return true;
      }
      return this._startBed();
    } catch (e) { return false; }
  },
  _startBed() {
    try {
      const ctx = this.ctx;
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
      if (m.rec) { this._themeOut(1.2); this._battleStop(1.2); }
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

  /* ================= THE RECORDINGS (operator, 2026-10-29) =================
     The game's own theme and its battle music are RECORDED now, and so are
     the effects of its work and its wars (assets/music, assets/sfx). The
     bargain the rest of this file keeps still holds where it can: nothing is
     fetched until a gesture has unlocked the speaker (the boot never waits on
     a byte of audio), every file that fails stands down to the synthesised
     voice it replaced, and none of it rides in a save. */
  _url(p) { return p + '?v=' + ((typeof CFG !== 'undefined' && CFG.ART_V) || 1); },
  // ramp an AudioParam to a level over about `sec` seconds, from wherever it
  // is now — a jump on a sustained sound is a click
  _ramp(param, to, sec) {
    const t = this.ctx.currentTime;
    param.cancelScheduledValues(t);
    param.setValueAtTime(Math.max(0.0001, param.value), t);
    param.setTargetAtTime(Math.max(0.0001, to), t, Math.max(0.02, sec / 3));
  },
  // a real game is on the glass (never the title's demo world, never a shell screen)
  _inGame() {
    return typeof Screens !== 'undefined' && Screens.current === 'playing' && !Screens._demo &&
      typeof S !== 'undefined' && S && S.units && !S.over;
  },

  /* ---- THE THEME: the title's tune, and the town's ----
     A MEDIA ELEMENT routed through the music bus, not a decoded buffer: 160
     seconds of stereo decoded is ~60MB of memory a phone does not have, and
     an element streams. Routed through Web Audio because iOS ignores an
     element's own volume, and the dial must work there too. It LOOPS as the
     file does, PAUSES while the battle has the floor (and picks up where it
     left off), and a file that will not load hands over to the generated bed. */
  THEME_SRC: 'assets/music/theme.mp3',
  THEME_GAIN: 1.0,            // loudness-matched to the battle's beat (both near -14 LUFS)
  _theme: null,               // { el, src, g } — module state, never in a save
  _themeFailed: false,
  _themeHeld: false,          // the run ended mid-battle: quiet until the world changes
  _themeEnsure() {
    if (this._theme) return this._theme;
    if (this._themeFailed) return null;
    try {
      const ctx = this.ac();
      if (!ctx || !ctx.createMediaElementSource || typeof Audio === 'undefined') { this._themeFailed = true; return null; }
      const el = new Audio();
      el.loop = true; el.preload = 'auto';
      el.addEventListener('error', () => {
        this._themeFailed = true;
        // the recording will not play: the generated bed takes its place
        if (this._music && this._music.rec) { this._music = null; this._startBed(); }
      });
      el.src = this._url(this.THEME_SRC);
      const src = ctx.createMediaElementSource(el);
      const g = ctx.createGain(); g.gain.value = 0.0001;
      src.connect(g).connect(this.musicBus);
      this._theme = { el, src, g };
      return this._theme;
    } catch (e) { this._themeFailed = true; return null; }
  },
  _themeIn(sec) {
    const th = this._theme;
    if (!th || this._themeHeld || (this._battle && this._battle.mode !== 'off')) return;
    try { clearTimeout(th.pauseT); const p = th.el.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
    this._ramp(th.g.gain, this.THEME_GAIN, sec);
  },
  _themeOut(sec) {
    const th = this._theme; if (!th || !this.ctx) return;
    this._ramp(th.g.gain, 0, sec);
    clearTimeout(th.pauseT);
    th.pauseT = setTimeout(() => { try { if (th.g.gain.value < 0.01) th.el.pause(); } catch (e) {} }, sec * 1000 + 300);
  },

  /* ---- THE BATTLE: it builds on the march and beats in the fight ----
     The operator's brief: it comes in when the PLAYER attacks (never when
     the player is attacked); its quiet intro builds while the army marches
     on the rival's town — within twice the hall's own ring — and its beat
     plays through the fight; when the fight is over, won or lost, it fades
     back to the theme, or ends outright when the game does.
     The file is 30s: a quiet build to the first big hit (introEnd), three
     ~3.5s phrases of the beat (loopLen), then a fade. Only the beat loops.
     Its tempo drifts a hair, so a loop cut on the grid would stutter: the
     loop's last `xfade` seconds are blended (equal power) into the bars
     just BEFORE its first hit, so its end runs straight into its beginning
     — baked once into its own buffer (_bakeLoop). 30s decoded is ~11MB, so
     the battle is a buffer, fetched once a real game is under way. */
  BATTLE_SRC: 'assets/music/battle.mp3',
  BATTLE: {
    introEnd: 13.80,      // the first big hit — where the beat begins
    loopLen: 10.47,       // three phrases of the beat
    xfade: 0.25,          // the baked seam
    gain: 1.0,
    beatR: 1.5,           // the beat: an army within 1.5x the rival hall's ring, or a fight
    introR: 4.0,          // the intro may begin this far out (it is timed, below)…
    introEta: 10,         // …once the army is within this many seconds of the beat ring
    jump: 0.5,            // a fight that starts mid-intro crossfades into the beat this fast
    fadeIn: 1.2,          // a fight that starts cold: the beat comes in quickly
    hold: 8,              // seconds of quiet before the battle is over
    fadeOut: 3.5,
  },
  _bat: null,                 // { buf, loop } once decoded
  _batLoading: false, _batFailed: false,
  _battle: { mode: 'off' },   // 'off' | 'on' — and its sources while on
  _battleLoad() {
    if (this._bat || this._batLoading || this._batFailed) return;
    const ctx = this.ac(); if (!ctx || typeof fetch === 'undefined') return;
    this._batLoading = true;
    fetch(this._url(this.BATTLE_SRC))
      .then(r => r.ok ? r.arrayBuffer() : Promise.reject(r.status))
      .then(ab => new Promise((res, rej) => { const p = ctx.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); }))
      .then(buf => { this._bat = { buf, loop: this._bakeLoop(buf) }; })
      .catch(() => { this._batFailed = true; })
      .then(() => { this._batLoading = false; });
  },
  _bakeLoop(buf) {
    const B = this.BATTLE, sr = buf.sampleRate;
    const a = Math.round(B.introEnd * sr), L = Math.round(B.loopLen * sr), X = Math.round(B.xfade * sr);
    const out = this.ctx.createBuffer(buf.numberOfChannels, L, sr);
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const src = buf.getChannelData(c), dst = out.getChannelData(c);
      dst.set(src.subarray(a, a + L));
      for (let i = 0; i < X; i++) {
        const k = (i / X) * Math.PI / 2, j = L - X + i;
        dst[j] = src[a + j] * Math.cos(k) + src[a - X + i] * Math.sin(k);
      }
    }
    return out;
  },
  _battleSrc(buf, loop) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf; s.loop = !!loop;
    s.connect(this._battle.g);
    return s;
  },
  // begin: from the quiet intro (marching), or straight into the beat (a fight)
  _battleStart(beat, eta) {
    const ctx = this.ctx, B = this.BATTLE, bt = this._battle;
    const g = ctx.createGain(); g.gain.value = 0.0001; g.connect(this.musicBus);
    bt.mode = 'on'; bt.g = g; bt.t0 = ctx.currentTime;
    if (beat) {
      bt.loopSrc = this._battleSrc(this._bat.loop, true);
      bt.loopSrc.start(ctx.currentTime);
      bt.beatAt = ctx.currentTime;
      this._ramp(g.gain, B.gain, B.fadeIn);
    } else {
      // the intro is quiet by its own nature: it comes in at full gain and builds
      const from = Math.max(0, Math.min(B.introEnd - 2, B.introEnd - (isFinite(eta) ? eta : B.introEnd)));
      bt.intro = this._battleSrc(this._bat.buf, false);
      bt.intro.start(ctx.currentTime, from, B.introEnd - from + 0.05);
      bt.loopSrc = this._battleSrc(this._bat.loop, true);
      bt.loopSrc.start(ctx.currentTime + B.introEnd - from);
      bt.beatAt = ctx.currentTime + B.introEnd - from;
      this._ramp(g.gain, B.gain, 0.6);
    }
    this._themeOut(beat ? 1.5 : 2.5);
  },
  // the fight began while the intro was still building: into the beat now
  _battleJump() {
    const ctx = this.ctx, B = this.BATTLE, bt = this._battle, now = ctx.currentTime;
    if (!bt.intro || now >= bt.beatAt - B.jump) return;
    const old = bt.g, oldSrcs = [bt.intro, bt.loopSrc];
    this._ramp(old.gain, 0, B.jump);
    for (const s of oldSrcs) { try { s.stop(now + B.jump + 0.1); } catch (e) {} }
    const g = ctx.createGain(); g.gain.value = 0.0001; g.connect(this.musicBus);
    bt.g = g; bt.intro = null;
    bt.loopSrc = this._battleSrc(this._bat.loop, true);
    bt.loopSrc.start(now);
    bt.beatAt = now;
    this._ramp(g.gain, B.gain, B.jump);
  },
  // over: fade the battle away, and the theme back — unless the game is over
  _battleStop(sec, gameOver) {
    const bt = this._battle;
    if (bt.mode === 'off' || !this.ctx) return;
    const now = this.ctx.currentTime;
    this._ramp(bt.g.gain, 0, sec);
    for (const s of [bt.intro, bt.loopSrc]) if (s) { try { s.stop(now + sec + 0.3); } catch (e) {} }
    this._battle = { mode: 'off' };
    if (gameOver) this._themeHeld = true;
    else if (this._music && this._music.rec) setTimeout(() => this._themeIn(4), 1000);
  },
  /* THE READ: is the player on the march, and is the player FIGHTING. Asked
     of the player's own army (soldiers and a raised levy) and fog-honest —
     the rival's hall counts only once the player has found it, or the music
     would find it for them. A fight is an engagement with anything hostile
     but the wilds, AWAY from home (beyond twice the player's own ring, at
     least ten tiles) or at the rival's door: a fight in your own town is
     being attacked, which is not this music's to answer. */
  /* THE MARCH IS TIMED, NOT RINGED. An army walks ~2.2 tiles a second, so
     the operator's 1.5-2x band is about one second of marching — the intro
     would never be heard. So the build is laid against the march itself:
     the intro begins once the leading marcher is within introEta seconds
     of the beat ring (never past introR), and STARTS PARTWAY IN — at the
     point that puts its first big hit on the moment the army arrives. A
     fight that comes sooner jumps to the beat, as it should. */
  warRead() {
    const out = { approach: 0, fight: false, eta: Infinity };
    try {
      const B = this.BATTLE, myTc = Bld.tcOf('P'), foeTc = Bld.tcOf('A');
      const home = myTc ? { x: Bld.cx(myTc), y: Bld.cy(myTc), r: Math.max(10, 2 * Bld.tcRadius(myTc)) } : null;
      const foe = foeTc && S.map.explored[MapGen.idx(foeTc.x, foeTc.y)]
        ? { x: Bld.cx(foeTc), y: Bld.cy(foeTc), r: Bld.tcRadius(foeTc) } : null;
      for (const u of S.units) {
        if (u.owner !== 'P' || !(Units.isMilitary(u) || Units.isLevied(u))) continue;
        const tu = u.tUnit ? Units.get(u.tUnit) : null;
        const tb = !tu && u.tBld ? Bld.get(u.tBld) : null;
        const engaged = (tu && tu.owner !== 'W' && tu.owner !== 'P') || (tb && tb.owner !== 'P');
        const df = foe ? Math.hypot(u.x - foe.x, u.y - foe.y) / foe.r : Infinity;
        if (engaged && (!home || Math.hypot(u.x - home.x, u.y - home.y) > home.r || df <= 2 * B.beatR)) out.fight = true;
        if (df > B.introR || !(engaged || Units.moving(u) || (u.task && /^attack/.test(u.task.type)))) continue;
        if (df <= B.beatR) { out.approach = 2; continue; }
        // heading IN, not walking past: the path's end is nearer the hall than the marcher
        const end = u.path && u.path.length ? u.path[u.path.length - 1] : null;
        if (end && Math.hypot(end.x + 0.5 - foe.x, end.y + 0.5 - foe.y) >= Math.hypot(u.x - foe.x, u.y - foe.y)) continue;
        const eta = (df - B.beatR) * foe.r / Math.max(0.5, (CFG.UNITS[u.kind] && CFG.UNITS[u.kind].speed) || 2);
        if (eta <= B.introEta) { out.approach = Math.max(out.approach, 1); out.eta = Math.min(out.eta, eta); }
      }
    } catch (e) {}
    return out;
  },
  _battleTick() {
    if (!this.ctx || !this._music || !this._music.rec) return;
    const bt = this._battle;
    if (!this._inGame()) {
      // the run is over: the battle ENDS, and the theme waits for the next world
      if (bt.mode !== 'off') this._battleStop(typeof S !== 'undefined' && S && S.over ? 2 : 1.5, !!(typeof S !== 'undefined' && S && S.over));
      return;
    }
    if (!this._bat) { this._battleLoad(); return; }      // fetched once a game is under way
    const r = this.warRead(), now = this.ctx.currentTime;
    if (r.fight || r.approach) bt.hot = now;
    if (bt.mode === 'off') {
      if (r.fight || r.approach === 2) this._battleStart(true);
      else if (r.approach === 1) this._battleStart(false, r.eta);
    } else {
      if (r.fight || r.approach === 2) this._battleJump();
      if (now - (bt.hot || now) > this.BATTLE.hold) this._battleStop(this.BATTLE.fadeOut, false);
    }
  },

  /* ================= THE EFFECTS, BY WHAT THE CAMERA SEES =================
     A dozen farms, camps and quarries are in view at once, and every one of
     them would be a voice. What the big RTS games do (Supreme Commander
     played a fraction of its cues and tied their level to the zoom;
     PlatinumGames gate events in game code before the mixer caps the
     voices), and what this does:
       1. NOTHING OFF CAMERA IS HEARD. An emitter outside the view is culled
          before it sounds (and anything not the player's must stand on
          ground the player can see — a sound is not a scout).
       2. THE MIDDLE OF THE VIEW IS LOUD, THE EDGES ARE QUIET. Full level in
          the centre third, falling to EDGE at the screen's edge; panned a
          little toward its side. Zoomed out, the work drops further (ZOOM).
       3. THE WORK IS A DIN, NOT A VOICE PER HAND. Each trade (chop, chip,
          gold, rake, hammer) is SAMPLED: one stroke every DIN seconds for one
          hand, quicker with more hands but only as their square root, from
          a hand chosen by how central it stands — never more than WORK_MAX
          strokes at once, never two within WORK_GAP.
       4. BATTLE MAY LAYER, A LITTLE MUTED, AND OUR WEAPONS LEAD. Every blow
          has a per-kind cooldown and cap; the weapon our army is mostly
          using is the one at full level (the others step back), and the
          ENEMY's weapons are heard only faintly while ours are — at their own
          level when they are the only fight on screen (an undefended town).
       5. EVERY STROKE IS A LITTLE DIFFERENT: pitch and level are jittered so
          a repeated file never reads as a loop.
     The levels are decibels, by ear, in SFX: `lufs` is the file's measured
     loudness (ffmpeg ebur128), `to` where it should sit; the gain is the
     difference. */
  SFX_DIR: 'assets/sfx/',
  SFX: {
    chop:      { lufs: -23.6, to: -35.5, synth: 'chop' },
    chip:      { lufs: -26.4, to: -35.5, synth: 'mine' },
    gold:      { lufs: -24.8, to: -35.5, synth: 'mine' },
    rake:      { lufs: -26.8, to: -36.5, synth: 'farm' },
    hammer:    { lufs: -29.2, to: -35.0, synth: 'build' },
    sword:     { lufs: -21.1, to: -29.5, cd: 0.30, max: 2, synth: 'hit' },
    arrows:    { lufs: -21.0, to: -30.5, cd: 0.70, max: 2, synth: 'arrow' },
    trebuchet: { lufs: -17.6, to: -28.5, cd: 1.20, max: 1 },
    boulder:   { lufs: -23.6, to: -28.5, cd: 0.90, max: 2 },
    ship:      { lufs: -22.1, to: -29.5, cd: 1.10, max: 1 },
    gallop:    { lufs: -28.8, to: -34.0 },
    complete:  { lufs: -19.4, to: -29.0, synth: 'done' },
    select:    { lufs: -28.3, to: -32.0, cd: 0.12 },
    horn:      { lufs: -12.3, to: -22.0, cd: 30, synth: 'raid' },
  },
  // seconds between strokes for ONE hand at the centre of the view
  DIN: { chop: 4.0, chip: 4.5, gold: 5.0, rake: 6.0, hammer: 3.5 },
  WORK_MAX: 2, WORK_GAP: 0.7,
  WAR_MAX: 4, WAR_MUTE: 0.8,  // battle layers, a little muted
  FOE_UNDER: 0.3, FOE_ALONE: 0.85, OWN_HOLD: 2.5,
  OFF_MODE: 0.55,             // a weapon that is not the army's main one steps back
  CENTRE: 0.35, EDGE: 0.12, ZOOM: 0.45,
  _buf: {}, _sfxLoading: false,
  _sfxLoad() {
    if (this._sfxLoading || typeof fetch === 'undefined') return;
    const ctx = this.ac(); if (!ctx) return;
    this._sfxLoading = true;
    for (const name of Object.keys(this.SFX)) {
      fetch(this._url(this.SFX_DIR + name + '.mp3'))
        .then(r => r.ok ? r.arrayBuffer() : Promise.reject(r.status))
        .then(ab => new Promise((res, rej) => { const p = ctx.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); }))
        .then(buf => { this._buf[name] = buf; })
        .catch(() => {});   // a missing file keeps its synthesised voice (or silence)
    }
  },
  _sfxGain(name) { const s = this.SFX[name]; return Math.pow(10, (s.to - s.lufs) / 20); },
  /* Where an emitter sits in the view: null when it is off camera, else its
     level (1 in the middle, EDGE at the rim) and its pan. The visible band
     is the screen less the bars, the same band R.onScreen measures. */
  place(x, y) {
    if (typeof R === 'undefined' || !R.cam || !R.cv) return null;
    const TL = CFG.TILE, z = R.cam.z;
    const sx = (x * TL - R.cam.x) * z, sy = (y * TL - R.cam.y) * z;
    const top = R.topReserve || 0, W = R.viewW(), H = R.viewH() - (R.bottomReserve || 0);
    const hw = W / 2, hh = Math.max(1, (H - top) / 2);
    const nx = (sx - hw) / hw, ny = (sy - top - hh) / hh;
    if (Math.abs(nx) > 1.04 || Math.abs(ny) > 1.04) return null;
    const r = Math.min(1, Math.max(Math.abs(nx), Math.abs(ny)));
    const k = r <= this.CENTRE ? 0 : (r - this.CENTRE) / (1 - this.CENTRE);
    const g = this.EDGE + (1 - this.EDGE) * Math.pow(1 - k, 2);
    const dz = R.defaultZoom ? R.defaultZoom() : 1.5;
    return { g, pan: Math.max(-0.5, Math.min(0.5, nx * 0.5)), zoom: Math.max(this.ZOOM, Math.min(1, z / dz)) };
  },
  _sample(name, o) {
    const buf = this._buf[name], ctx = this.ctx;
    if (!buf || !ctx) return null;
    const s = ctx.createBufferSource();
    s.buffer = buf;
    if (o.loop) { s.loop = true; s.loopStart = 0.03; s.loopEnd = Math.max(0.1, buf.duration - 0.03); }
    s.playbackRate.value = o.rate || 1;
    const g = ctx.createGain(); g.gain.value = Math.max(0.0001, o.gain);
    s.connect(g);
    let out = g;
    if (o.pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = o.pan; g.connect(p); out = p; }
    out.connect(this.sfxBus);
    s.start(ctx.currentTime);
    return { s, g };
  },
  // the mixer's own dice: never Math.random, so a seeded test's stream is
  // never moved by a sound (and never G.rand, which is the run's)
  _seed: 0x2545f491,
  _rnd() { this._seed = (Math.imul(this._seed, 1664525) + 1013904223) | 0; return (this._seed >>> 0) / 4294967296; },
  _jit() { return { rate: 0.95 + this._rnd() * 0.1, lvl: 0.86 + this._rnd() * 0.14 }; },
  _sfxLast: {}, _sfxLive: {}, _workLive: 0, _workLast: -1e9, _warLive: 0,
  _track(name, v, bucket) {
    this._sfxLive[name] = (this._sfxLive[name] || 0) + 1;
    if (bucket) this[bucket]++;
    v.s.onended = () => {
      this._sfxLive[name] = Math.max(0, (this._sfxLive[name] || 1) - 1);
      if (bucket) this[bucket] = Math.max(0, this[bucket] - 1);
    };
  },

  /* A BLOW, A SHOT, A LAUNCH, AN IMPACT. `owner` is whose weapon it is.
     Answers whether it sounded (the contract asks). */
  _heat: {}, _heatT: 0, _ownAt: -1e9,
  at(kind, x, y, owner) {
    try {
      if (!this.sfxOn() || !this._inGame() || S.paused) return false;
      const spec = this.SFX[kind]; if (!spec) return false;
      // never MAKE a context here: a blow before any gesture is silent, and
      // touches nothing (no context, no dice — seeded tests stay seeded)
      const ctx = this.ctx; if (!ctx || ctx.state !== 'running') return false;
      const p = this.place(x, y); if (!p) return false;                   // off camera: not heard
      if (owner !== 'P' && !(typeof G !== 'undefined' && G.visibleAt && G.visibleAt(Math.floor(x), Math.floor(y)))) return false;
      const now = ctx.currentTime, own = owner === 'P';
      // the army's main weapon: a heat per kind, decaying over ~3s
      const dt = now - this._heatT; this._heatT = now;
      for (const k in this._heat) this._heat[k] *= Math.exp(-dt / 3);
      let lvl = this.WAR_MUTE, cd = spec.cd || 0.3;
      if (own) {
        this._ownAt = now;
        this._heat[kind] = (this._heat[kind] || 0) + 1;
        let top = null; for (const k in this._heat) if (!top || this._heat[k] > this._heat[top]) top = k;
        if (top && top !== kind && this._heat[top] > 2 * this._heat[kind]) { lvl *= this.OFF_MODE; cd *= 1.6; }
      } else if (now - this._ownAt < this.OWN_HOLD) { lvl *= this.FOE_UNDER; cd *= 2; }   // ours are fighting: theirs faintly
      else lvl *= this.FOE_ALONE;                                                        // theirs alone: an undefended town
      const last = this._sfxLast[kind];
      if (last != null && now - last < cd) return false;
      if ((this._sfxLive[kind] || 0) >= (spec.max || 1) || this._warLive >= this.WAR_MAX) return false;
      this._sfxLast[kind] = now;
      const j = this._jit(), gain = this._sfxGain(kind) * lvl * p.g * Math.max(0.7, p.zoom) * j.lvl;
      const v = this._sample(kind, { gain, pan: p.pan, rate: j.rate });
      if (v) { this._track(kind, v, '_warLive'); return true; }
      return spec.synth ? this.play(spec.synth, { gain: lvl * p.g }) : false;
    } catch (e) { return false; }
  },
  /* THE PLAYER'S OWN NEWS: a selection, a building finished, the horn. Not
     culled by the camera (it is the player's own act), but a finished
     building off camera is said softly. */
  ui(kind, x, y) {
    try {
      if (!this.sfxOn()) return false;
      const spec = this.SFX[kind]; if (!spec) return false;
      const ctx = this.ctx; if (!ctx || ctx.state !== 'running') return false;
      const now = ctx.currentTime, last = this._sfxLast[kind];
      if (spec.cd && last != null && now - last < spec.cd) return false;
      let lvl = 1;
      if (x != null) { const p = this.place(x, y); lvl = p ? Math.max(0.6, p.g) : 0.35; }
      this._sfxLast[kind] = now;
      const v = this._sample(kind, { gain: this._sfxGain(kind) * lvl, rate: 0.98 + this._rnd() * 0.04 });
      if (v) { this._track(kind, v); return true; }
      if (spec.synth) { delete this._last[spec.synth]; return this.play(spec.synth, { gain: lvl }); }
      return false;
    } catch (e) { return false; }
  },
  // which trade a working villager is plying, read off the pose the renderer
  // draws — what is heard is what is drawn
  workKind(u) {
    if (u.owner !== 'P' || !Units.isVillager(u) || Units.isLevied(u)) return null;
    const pose = R.unitPose(u), t = u.task;
    if (!t) return null;
    if (pose === 'build') return 'hammer';
    if (pose === 'farm') return 'rake';
    if (pose === 'mine') {
      if (t.type === 'work') { const b = Bld.get(t.id); return b && b.key === 'mine' ? 'gold' : 'chip'; }
      return 'chip';
    }
    if (pose === 'gather') {
      if (t.type === 'gather' && t.res === 'wood') return 'chop';
      if (t.type === 'work') { const b = Bld.get(t.id); return b && b.key === 'lumber' ? 'chop' : null; }
    }
    return null;
  },
  _dinDue: {},
  _dinTick() {
    const ctx = this.ctx, now = ctx.currentTime, by = {};
    for (const u of S.units) {
      const k = this.workKind(u); if (!k) continue;
      const p = this.place(u.x, u.y); if (!p) continue;
      (by[k] || (by[k] = [])).push(p);
    }
    for (const k of Object.keys(this.DIN)) {
      const list = by[k];
      if (!list) { delete this._dinDue[k]; continue; }
      const due = this._dinDue[k];
      if (due == null) { this._dinDue[k] = now + this._rnd() * this.DIN[k]; continue; }   // a fresh trade starts at a random beat
      if (now < due) continue;
      this._dinDue[k] = now + (this.DIN[k] / Math.sqrt(list.length)) * (0.75 + this._rnd() * 0.5);
      if (this._workLive >= this.WORK_MAX || now - this._workLast < this.WORK_GAP) continue;
      // the hand nearest the middle is the likeliest heard
      let sum = 0; for (const p of list) sum += p.g * p.g;
      let pick = this._rnd() * sum, p = list[0];
      for (const q of list) { pick -= q.g * q.g; if (pick <= 0) { p = q; break; } }
      const j = this._jit(), gain = this._sfxGain(k) * p.g * p.zoom * j.lvl;
      const v = this._sample(k, { gain, pan: p.pan, rate: j.rate });
      if (v) { this._track(k, v, '_workLive'); this._workLast = now; }
      else if (this.SFX[k].synth) { this.play(this.SFX[k].synth, { gain: p.g * p.zoom }); this._workLast = now; }
    }
  },
  /* THE HOOVES: one loop for the riders in view, ours first — level by the
     most central rider and how many there are, faded in and out. */
  _gallop: null,
  _gallopTick() {
    let best = null, n = 0;
    const foeOk = this.ctx.currentTime - this._ownAt >= this.OWN_HOLD;
    for (const pass of ['P', 'foe']) {
      for (const u of S.units) {
        if (u.kind !== 'rider' && u.kind !== 'horsearcher' && u.kind !== 'lancer') continue;
        if (pass === 'P' ? u.owner !== 'P' : (u.owner === 'P' || !foeOk)) continue;
        if (!Units.moving(u)) continue;
        if (u.owner !== 'P' && !G.visibleAt(Math.floor(u.x), Math.floor(u.y))) continue;
        const p = this.place(u.x, u.y); if (!p) continue;
        n++; if (!best || p.g > best.g) best = p;
      }
      if (n) break;
    }
    const want = best ? this._sfxGain('gallop') * best.g * Math.max(0.6, best.zoom) * Math.min(1, 0.6 + 0.2 * Math.log2(n)) : 0;
    const gl = this._gallop;
    if (want > 0.0005) {
      if (!gl) { const v = this._sample('gallop', { gain: 0.0001, loop: true }); if (v) { this._gallop = v; this._ramp(v.g.gain, want, 0.4); } }
      else { this._ramp(gl.g.gain, want, 0.4); gl.quiet = 0; }
    } else if (gl) {
      this._ramp(gl.g.gain, 0, 0.5);
      if ((gl.quiet = (gl.quiet || 0) + 1) > 6) { try { gl.s.stop(this.ctx.currentTime + 0.6); } catch (e) {} this._gallop = null; }
    }
  },
  // the world's ear: four times a second while a real game is on the glass
  _worldTick() {
    try {
      if (!this.ctx || this.ctx.state !== 'running') return;
      this._battleTick();
      if (!this.sfxOn() || !this._inGame() || S.paused) {
        if (this._gallop) { this._ramp(this._gallop.g.gain, 0, 0.3); try { this._gallop.s.stop(this.ctx.currentTime + 0.4); } catch (e) {} this._gallop = null; }
        return;
      }
      this._dinTick();
      this._gallopTick();
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
        if (document.visibilityState === 'visible') {
          this.unlock();
          if (this._music && this._music.rec && this._theme && this._battle.mode === 'off') this._themeIn(1);
        } else if (this._music && this.ctx) {
          try { this.ctx.suspend(); } catch (e) {}
          try { if (this._theme) this._theme.el.pause(); } catch (e) {}   // a hidden tab does not run the tune on
        }
      });
      setInterval(() => this._worldTick(), 250);
    } catch (e) {}
  },
};
window.Sound = Sound;
