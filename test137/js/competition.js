"use strict";
/* COMPETITION — the prize draw, in one file.

   The whole feature lives here: the end-screen button, the eligibility
   gates, the feedback panel, the styles, and the one server call. REMOVAL
   IS THREE STEPS: delete this file, delete its <script> tag in index.html,
   delete the one Competition.offer line in Screens.showEnd. (Fourth, listed
   apart because it is cosmetic: the marked COMPETITION panel block in
   analytics.html.) Nothing else in the game knows this exists.

   THE KILL SWITCH is `on` below. false = nothing renders anywhere, eligible
   or not. It ships false; flipping it true is the launch.

   WHAT THE SERVER ENFORCES (supabase/migrations/0004_competition.sql —
   nothing here is trusted): up to 5 entries per email, one per DISTINCT
   finished game (the telemetry run id), duplicates and over-cap submissions
   answer success and store only the feedback, and no client key can read
   the entry table by any path. Score and time are client-side numbers —
   friction, not enforcement, accepted at this prize size; the stored
   context (win/loss, score, minutes, map, day) is for reading fraud by eye
   before a draw. */

const Competition = {
  /* ---- the dials ---- */
  on: true,                // THE KILL SWITCH. The window below decides the rest.
  /* THE WINDOW. Opening and closing are DATES, not a switch somebody has to
     remember to throw: before OPENS_AT and after CLOSES_AT nothing renders,
     eligible or not. Both are enforced again server-side (the
     competition_window table, migration 0004) — a wrong device clock can
     neither open the draw early nor keep it open late.
     America/Denver runs on MDT (UTC-6) through 1 November, so 7am Denver on
     both these dates is -06:00. Change these two lines and the matching
     table row together. */
  OPENS_AT:  '2026-09-10T07:00:00-06:00',   // Thu 10 Sep, 7am Denver
  CLOSES_AT: '2026-09-17T07:00:00-06:00',   // Thu 17 Sep, 7am Denver — SEVEN days
  MIN_SECONDS: 600,        // 10 real minutes of unpaused play (S.playtime)
  /* THE SCORE GATE, AND WHY IT SCALES WITH DIFFICULTY (operator item 1).
     500 is confirmed, and it is a MODERATE number: CFG.SCORE.mult is
     calm 0.5 / moderate 1.0 / hard 1.75, so gating the FINAL total would
     ask a calm player for double the work of a moderate one and nearly
     four times a hard one — backwards, since calm is where a new player
     starts. Measured on the real model, an honest 12-minute calm loss
     ("a few huts, a little scouting") totals 349 and would have been
     turned away, while the same effort on hard totals 1,222 and sails in.
     The bar is therefore the SAME EFFORT on every difficulty: the run's
     pre-multiplier subtotal must reach MIN_SCORE. Expressed to the player
     as the number they can actually see on their own end screen —
     MIN_SCORE x their multiplier, so 250 on calm, 500 on moderate, 875 on
     hard — which is the same sentence, just readable. A near-idle run
     (subtotal ~310) still fails on every difficulty. */
  MIN_SCORE: 500,          // pre-multiplier. Set GATE_PRE_MULTIPLIER false to gate the final total instead.
  GATE_PRE_MULTIPLIER: true,
  PRIZE_LINE: 'Win $50. One entry per finished game, up to five — the drawing closes Thu 17 Sep.',
  CHOICES: [
    ['too_hard',         'Too hard'],
    ['too_slow',         'Too slow'],
    ['confusing',        'Confusing to learn'],
    ['not_enough_to_do', 'Not enough to do'],
    ['more_content',     'Needs more content'],
    ['visuals',          'Visuals need work'],
    ['good',             "Nothing — it's good"],
  ],

  _state: null,

  /* the one game-facing call: Screens.showEnd(win) hands the ended run in */
  /* open right now? Both ends are dates; a malformed one fails CLOSED, which
     is the safe direction for a promotion that must not outlive its prize. */
  isOpen() {
    const now = Date.now();
    const a = Date.parse(this.OPENS_AT), b = Date.parse(this.CLOSES_AT);
    if (!isFinite(a) || !isFinite(b)) return false;
    return now >= a && now < b;
  },

  offer(win) {
    for (const el of document.querySelectorAll('.compRoot')) el.remove();
    if (!this.on || !this.isOpen() || !window.S || (window.Screens && Screens._demo)) return;
    const scene = document.getElementById(win ? 'victoryScene' : 'defeatScene');
    if (!scene) return;

    const sc = (window.Score && Score.compute) ? Score.compute(!!win) : { total: 0, subtotal: 0 };
    const score = sc.total || 0;                       // the arcade score, stored as-is
    // typeof, not window.: CFG is a script-level const, so window.CFG is
    // undefined — the same trap G and Bld carry. Reading it through window
    // silently returned 1 and told a calm player they needed 500 when the
    // gate actually asked 250 of them.
    const mult = (typeof CFG !== 'undefined' && CFG.SCORE && CFG.SCORE.mult && CFG.SCORE.mult[S.mode]) || 1;
    // what the gate measures, and the same thing said in the player's own numbers
    const gateHave = this.GATE_PRE_MULTIPLIER ? (sc.subtotal || 0) : score;
    const gateNeed = this.MIN_SCORE;
    const shownNeed = Math.round(this.GATE_PRE_MULTIPLIER ? this.MIN_SCORE * mult : this.MIN_SCORE);
    const shownHave = score;
    const secs = Math.max(0, Math.round(S.playtime || 0));
    const sessionId = (window.Backend && Backend.lastRunId) ||
      ('s' + String(S.seed || '') + '-d' + (S.day || 0) + '-' + (win ? 'w' : 'l'));
    this._state = {
      win: !!win, score, secs, sessionId,
      size: S.sizeKey || '', landform: (S.map && S.map.landform) || '', day: S.day || 0,
      rating: 0, choice: null,
    };

    this._styles();
    const root = document.createElement('div');
    root.className = 'compRoot';

    const eligible = secs >= this.MIN_SECONDS && gateHave >= gateNeed;
    if (!eligible) {
      /* below a gate: no button, nothing rendered but one quiet line naming
         what was missed */
      const need = [];
      if (secs < this.MIN_SECONDS) need.push(Math.ceil(this.MIN_SECONDS / 60) + '+ minutes played (this run: ' + Math.max(1, Math.round(secs / 60)) + 'm)');
      if (gateHave < gateNeed) need.push('a score of ' + shownNeed.toLocaleString() + '+ (this run: ' + shownHave.toLocaleString() + ')');
      root.innerHTML = '<p class="compQuiet">Prize draw: needs ' + need.join(' and ') + '.</p>';
    } else if (this._entered(sessionId)) {
      root.innerHTML = '<p class="compQuiet compDone">✓ This game is in the draw.</p>';
    } else {
      const b = document.createElement('button');
      b.className = 'dbtn compBtn';
      b.innerHTML = '<span class="dbBody"><b>' + this.PRIZE_LINE.toUpperCase() +
        '</b><small>One entry per finished game — up to 5 per email</small></span><span class="dbArrow">&#8594;</span>';
      b.onclick = () => this._panel();
      root.appendChild(b);
    }
    const firstBtn = scene.querySelector('.dbtn:not(.compBtn)');
    if (firstBtn) scene.insertBefore(root, firstBtn); else scene.appendChild(root);
  },

  /* ---- the panel: feedback first, then the email ---- */
  _panel() {
    const st = this._state; if (!st) return;
    const ov = document.createElement('div');
    ov.className = 'compRoot compOverlay';
    ov.innerHTML =
      '<div class="compCard">' +
      '<h2>' + this.PRIZE_LINE + '</h2>' +
      '<p class="compSub">Two taps of feedback, then your email. One entry per finished game, up to 5 per email.</p>' +
      '<div class="compQ">How much did you enjoy this game?</div>' +
      '<div class="compStars">' + [1, 2, 3, 4, 5].map(n => '<button class="compStar" data-n="' + n + '" aria-label="' + n + ' of 5">&#9733;</button>').join('') + '</div>' +
      '<div class="compQ">What would most improve it?</div>' +
      '<div class="compChips">' + this.CHOICES.map(c => '<button class="compChip" data-k="' + c[0] + '">' + c[1] + '</button>').join('') + '</div>' +
      '<textarea class="compText" maxlength="500" rows="2" placeholder="Anything else? (optional)"></textarea>' +
      '<input class="compEmail" type="email" autocomplete="email" placeholder="your@email.com">' +
      '<div class="compRow"><button class="compCancel">Not now</button>' +
      '<button class="compSubmit" disabled>Enter the draw</button></div>' +
      '<div class="compErr"></div>' +
      '</div>';
    document.body.appendChild(ov);

    const $ = sel => ov.querySelector(sel);
    const submit = $('.compSubmit'), email = $('.compEmail'), err = $('.compErr');
    const emailOk = () => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value.trim());
    const gate = () => { submit.disabled = !(st.rating && st.choice && emailOk()); };

    for (const b of ov.querySelectorAll('.compStar'))
      b.onclick = () => {
        st.rating = +b.dataset.n;
        for (const s of ov.querySelectorAll('.compStar')) s.classList.toggle('lit', +s.dataset.n <= st.rating);
        gate();
      };
    for (const b of ov.querySelectorAll('.compChip'))
      b.onclick = () => {
        st.choice = b.dataset.k;
        for (const c of ov.querySelectorAll('.compChip')) c.classList.toggle('lit', c === b);
        gate();
      };
    email.oninput = gate;
    $('.compCancel').onclick = () => ov.remove();
    ov.onclick = e => { if (e.target === ov) ov.remove(); };

    submit.onclick = async () => {
      submit.disabled = true; submit.textContent = 'Entering…'; err.textContent = '';
      const r = (window.Backend && Backend.rpc)
        ? await Backend.rpc('enter_competition', {
            p_email: email.value.trim(), p_session: st.sessionId,
            p_rating: st.rating, p_choice: st.choice,
            p_text: ($('.compText').value || '').slice(0, 500) || null,
            p_win: st.win, p_score: st.score, p_seconds: st.secs,
            p_size: st.size, p_landform: st.landform, p_day: st.day,
          })
        : { ok: false };
      /* the server answers {ok:true} for created, duplicate and over-cap
         alike — by design it never says which, and neither do we */
      if (r.ok && r.data && r.data.ok) {
        this._remember(st.sessionId);
        /* THE INVITATION (operator item 3): driving replays is the point of
           the draw, so the confirmation asks for another run rather than
           merely confirming. STATIC TEXT ONLY — it never says how many
           entries they have, never implies whether this one counted, and
           never hints that the address was already known. Everyone sees
           these same words, which is what keeps the uniform response
           uniform. */
        ov.querySelector('.compCard').innerHTML =
          '<h2>You&#8217;re in.</h2>' +
          '<p class="compSub">Thanks — the feedback goes straight into making the game better.</p>' +
          '<p class="compAgain">Finish another game and it earns another entry, up to five in all. ' +
          'More games, more chances.</p>' +
          '<div class="compRow"><button class="compCancel">Play again</button></div>';
        ov.querySelector('.compCancel').onclick = () => { ov.remove(); this.offer(st.win); };
      } else {
        submit.disabled = false; submit.textContent = 'Enter the draw';
        err.textContent = 'Couldn&#8217;t reach the draw — check your connection and try again.';
      }
    };
  },

  /* which finished games this device already put in — UX only (the server
     is the enforcement); keys capped so the list can't grow forever */
  _entered(id) {
    try { return (JSON.parse(localStorage.getItem('neo-comp-entered') || '[]')).includes(id); }
    catch (e) { return false; }
  },
  _remember(id) {
    try {
      const l = JSON.parse(localStorage.getItem('neo-comp-entered') || '[]');
      if (!l.includes(id)) l.push(id);
      localStorage.setItem('neo-comp-entered', JSON.stringify(l.slice(-30)));
    } catch (e) { /* private mode — the server still dedupes */ }
  },

  _styles() {
    if (document.getElementById('compStyles')) return;
    const s = document.createElement('style');
    s.id = 'compStyles';
    s.textContent = `
      .compQuiet{color:#8d8168;font-size:12px;margin:2px 0 6px;text-align:center}
      .compQuiet.compDone{color:#9fb36a}
      .compBtn b{letter-spacing:.8px}
      .compOverlay{position:fixed;inset:0;z-index:300;background:rgba(8,6,3,.72);
        display:flex;align-items:center;justify-content:center;padding:14px}
      .compCard{background:#1e1a11;border:1px solid #3a3125;border-radius:12px;
        max-width:400px;width:100%;padding:18px;color:#e8dcc0;
        font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
        max-height:88vh;overflow-y:auto}
      .compCard h2{margin:0 0 4px;font-size:18px}
      .compSub{color:#a2957a;font-size:12.5px;margin:0 0 12px}
      .compQ{font-size:11px;text-transform:uppercase;letter-spacing:.9px;color:#8d8168;margin:10px 0 6px}
      .compStars{display:flex;gap:6px}
      .compStar{font-size:26px;line-height:1;background:none;border:0;color:#4a4234;cursor:pointer;padding:4px}
      .compStar.lit{color:#e8c15a}
      .compChips{display:flex;flex-wrap:wrap;gap:6px}
      .compChip{background:#262114;border:1px solid #3a3125;color:#cfc2a4;border-radius:16px;
        padding:7px 11px;font-size:12.5px;cursor:pointer}
      .compChip.lit{background:#e8c15a;border-color:#e8c15a;color:#241d10;font-weight:600}
      .compText,.compEmail{width:100%;box-sizing:border-box;margin-top:10px;background:#262114;
        border:1px solid #3a3125;border-radius:8px;color:#e8dcc0;padding:9px 10px;font:inherit}
      .compRow{display:flex;gap:8px;margin-top:12px;justify-content:flex-end}
      .compCancel{background:#262114;border:1px solid #3a3125;color:#cfc2a4;border-radius:8px;padding:9px 14px;font:inherit;cursor:pointer}
      .compSubmit{background:#e8c15a;border:0;color:#241d10;border-radius:8px;padding:9px 16px;font:inherit;font-weight:700;cursor:pointer}
      .compSubmit:disabled{opacity:.45;cursor:default}
      .compAgain{background:#262114;border:1px solid #3a3125;border-radius:8px;
        padding:10px 12px;margin:12px 0 0;color:#e8c15a;font-size:13px;line-height:1.5}
      .compErr{color:#c2603f;font-size:12.5px;min-height:16px;margin-top:8px}`;
    document.head.appendChild(s);
  },
};

// script-level const is NOT a window property (the documented G/Bld trap) — export explicitly, like every module here
window.Competition = Competition;
