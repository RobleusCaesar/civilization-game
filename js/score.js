"use strict";
/* Score — the arcade layer. Every run is tallied like a cabinet game:
   conquest, economy, tribe, exploration, speed — multiplied by difficulty.
   THE RULE (binding, see HANDOFF.md): every new gameplay feature added to
   this game must feed a line here, either through an existing S.stats
   counter or a new one (backfilled in loadJSON). No silent features.

   Tuning target: an average MODERATE victory lands in the 5,000–10,000
   band. Calm halves it; Hard nearly doubles it — the leaderboard is meant
   to belong to Hard players. */

const Score = {
  /* the full tally — returns { lines: [{icon,label,pts}], subtotal, mult,
     total, win } — pure function of the game state, no side effects */
  compute(win) {
    const st = S.stats || {};
    const C = CFG.SCORE;
    const lines = [];
    const add = (icon, label, pts) => { pts = Math.round(pts); if (pts) lines.push({ icon, label, pts }); };

    if (win) {
      add('🏆', 'Victory', C.victory);
      // the clock is the enemy: a swift conquest keeps its speed bonus
      add('⏳', `Swift conquest — day ${S.day}`, Math.max(0, C.speedBase - S.day * C.speedPerDay));
    }
    add('⚔️', `Foes slain × ${st.kills || 0}`, (st.kills || 0) * C.perKill);
    add('🔥', `Rival buildings razed × ${st.razed || 0}`, (st.razed || 0) * C.perRazed);
    add('🛖', `Buildings raised × ${st.built || 0}`, (st.built || 0) * C.perBuilt);
    add('🧱', `Fortifications × ${st.walls || 0}`, (st.walls || 0) * C.perWall);
    add('⬆️', `Upgrades finished × ${st.upgrades || 0}`, (st.upgrades || 0) * C.perUpgrade);
    add('🪖', `Units trained × ${st.trained || 0}`, (st.trained || 0) * C.perTrained);
    add('👥', `Greatest tribe — ${st.peakPop || 0} strong`, (st.peakPop || 0) * C.perPeakPop);
    add('🌾', `Resources gathered — ${Math.round(st.gathered || 0)}`, (st.gathered || 0) * C.perGathered);
    {
      let seen = 0;
      for (let i = 0; i < S.map.explored.length; i++) if (S.map.explored[i]) seen++;
      const pct = Math.round(100 * seen / S.map.explored.length);
      add('🗺', `Map explored — ${pct}%`, pct * C.perExploredPct);
    }
    if (st.krakenSlain) add('🐙', 'Drove off the kraken', C.kraken);
    if (st.dragonSeen) add('🐉', 'Saved by the black dragon', C.dragon);
    if (st.originBonus) add('⛺', 'Hard beginnings', st.originBonus);
    if (st.leanIn) add('🎲', 'Read the land — a canny Origin', C.leanIn);

    const subtotal = lines.reduce((a, l) => a + l.pts, 0);
    const mult = C.mult[S.mode] || 1;
    return {
      lines, subtotal, mult, win: !!win,
      total: Math.round(subtotal * mult),
    };
  },

  /* ---- arcade name: up to 7 characters, kept clean ----
     Normalizes leet-speak, then checks a blocklist: long slurs/profanity by
     substring, short ambiguous words only as the exact whole name. */
  NAME_RE: /^[A-Za-z0-9 _\-\.!]{1,7}$/,
  _SUB: ['fuck', 'shit', 'cunt', 'bitch', 'nigger', 'nigga', 'faggot', 'retard',
    'asshole', 'pussy', 'penis', 'vagina', 'whore', 'slut', 'wank', 'twat',
    'rapist', 'hitler', 'nazi', 'kike', 'spick', 'chink', 'dyke', 'tranny',
    'porn', 'jizz', 'boner', 'dildo', 'queef', 'gook', 'beaner'],
  _EXACT: ['ass', 'fag', 'cum', 'tit', 'tits', 'sex', 'dick', 'cock', 'rape',
    'anus', 'anal', 'homo', 'nig', 'jew', 'kkk', 'boob', 'boobs', 'arse',
    'crap', 'piss', 'hoe', 'thot', 'simp'],
  cleanName(raw) {
    const name = String(raw || '').trim();
    if (!name) return { ok: false, why: 'Enter a name (up to 7 characters)' };
    if (!this.NAME_RE.test(name)) return { ok: false, why: 'Letters, numbers and . _ - ! only (max 7)' };
    const leet = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 6: 'g', 7: 't', 8: 'b', '@': 'a', '$': 's', '!': 'i' };
    const norm = name.toLowerCase().replace(/[013456780@$!]/g, ch => leet[ch] || ch)
      .replace(/[^a-z]/g, '');
    for (const w of this._SUB) if (norm.includes(w)) return { ok: false, why: 'Pick a different name' };
    for (const w of this._EXACT) if (norm === w) return { ok: false, why: 'Pick a different name' };
    return { ok: true, name };
  },

  /* THE NAME A WIN GOES UP UNDER WHEN THE CHIEF NEVER GAVE ONE. Every victory
     belongs on the board (operator ruling, 2026-09-11) — a player who taps
     REPLAY past the name box still won. The stand-in is their village's own
     word, the one the save chip already calls them by ("Amber Hollow" →
     HOLLOW), padded to the board's 7 characters with digits from the same
     identity so two Hollows can be told apart: HOLLOW4, RIDGE42, FORD123.
     Deterministic, and never remembered as their name (Backend.submitScore
     remember:false), so the next victory asks again. */
  fallbackName(uid) {
    const village = (window.Backend && Backend.villageName) ? Backend.villageName(uid) : 'Chief';
    const word = village.split(' ').pop().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6) || 'CHIEF';
    let h = 5381;
    const s = String(uid || '');
    for (let i = 0; i < s.length; i++) h = (Math.imul(h, 33) + s.charCodeAt(i)) >>> 0;
    return (word + String(h % 1000).padStart(3, '0')).slice(0, 7);
  },
};

// classic-script global
window.Score = Score;
