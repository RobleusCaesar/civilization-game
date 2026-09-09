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
  on: false,               // THE KILL SWITCH. Ship-ready; flip to launch.
  MIN_SECONDS: 600,        // 10 real minutes of unpaused play (S.playtime)
  /* E1 (operator confirms before launch): 2,000 was the opening number, and
     the score model says it is effectively a WINS-ONLY gate — victory alone
     banks 1,500-3,900 before any economy, while an honest 10-20 minute LOSS
     tallies roughly 400-1,800 (and calm HALVES it). 500 passes any real
     attempt on any mode and still fails an AFK run (~100). One number, one
     line, awaiting the word. */
  MIN_SCORE: 500,
  PRIZE_LINE: 'Enter the prize draw',        // ← the operator's prize copy goes here
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
  offer(win) {
    for (const el of document.querySelectorAll('.compRoot')) el.remove();
    if (!this.on || !window.S || (window.Screens && Screens._demo)) return;
    const scene = document.getElementById(win ? 'victoryScene' : 'defeatScene');
    if (!scene) return;

    const score = (window.Score && Score.compute) ? (Score.compute(!!win).total || 0) : 0;
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

    const eligible = secs >= this.MIN_SECONDS && score >= this.MIN_SCORE;
    if (!eligible) {
      /* below a gate: no button, nothing rendered but one quiet line naming
         what was missed */
      const need = [];
      if (secs < this.MIN_SECONDS) need.push(Math.ceil(this.MIN_SECONDS / 60) + '+ minutes played (this run: ' + Math.max(1, Math.round(secs / 60)) + 'm)');
      if (score < this.MIN_SCORE) need.push('a score of ' + this.MIN_SCORE.toLocaleString() + '+ (this run: ' + score.toLocaleString() + ')');
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
        ov.querySelector('.compCard').innerHTML =
          '<h2>You&#8217;re in.</h2><p class="compSub">Thanks — the feedback goes straight into making the game better.</p>' +
          '<div class="compRow"><button class="compCancel">Close</button></div>';
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
      .compErr{color:#c2603f;font-size:12.5px;min-height:16px;margin-top:8px}`;
    document.head.appendChild(s);
  },
};

// script-level const is NOT a window property (the documented G/Bld trap) — export explicitly, like every module here
window.Competition = Competition;
