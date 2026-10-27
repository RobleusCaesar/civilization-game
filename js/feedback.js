"use strict";
/* FEEDBACK & SUPPORT (tests/settings.mjs) — the player's line to the
   developer: a bug, an idea, a crash report, anything else.

   ONE FORM, TWO COPIES, NEVER LOST.
   - The EMAIL goes to the operator's inbox through FormSubmit's AJAX
     endpoint (no account, no server of ours): POST JSON to
     https://formsubmit.co/ajax/<address>. The FIRST submission ever sends an
     activation email to that inbox, which must be clicked once; until then
     FormSubmit answers "needs activation" and delivers nothing, so the
     report stays in the outbox and goes again on the next load. After
     activation FormSubmit offers a random alias for the address: paste it
     into TO below — one line, and the real address stops appearing in the
     page source.
   - A COPY goes to Supabase through migration 0009's one door,
     submit_feedback, so nothing depends on one mail relay. Before 0009 is
     applied that door is a 404, which is fine and silent.
   - THE OUTBOX: a report is written to the device BEFORE anything is sent,
     and leaves only once the email went through and the copy was answered.
     Offline, blocked by a content filter, FormSubmit down: it waits, and the
     next load (or the browser coming back online) sends it. The player is
     told plainly which of those happened.

   THE SITE ALONE SENDS (the telemetry rule, Backend.telemetryAllowed): a page
   from disk, a developer's local server and ?dev= never send a report —
   except to the test mock, which is how the contract reads what WOULD be
   sent. Every network word goes through Backend (mailFeedback /
   storeFeedback), so that seam is the only one.

   THE ERROR RING. A small always-on recorder keeps the last ERR_MAX script
   errors (window 'error', 'unhandledrejection', and the frame loop's own
   recovered faults via G._safe) in memory and on the device, so a crash
   report carries what actually went wrong. It costs nothing until an error
   happens, it never sends anything by itself, and it writes the device at
   most once per ERR_SAVE_MS however fast errors arrive. */
const Feedback = {
  // ← THE ONE ADDRESS. After FormSubmit's activation, replace it with the
  //   random alias FormSubmit offers (e.g. 'a1b2c3d4e5…'), and nothing else.
  TO: 'rob@frostrivercapital.com',
  mailUrl() { return 'https://formsubmit.co/ajax/' + this.TO; },

  KINDS: [
    { k: 'bug', name: 'Bug', tech: true },
    { k: 'idea', name: 'Idea', tech: false },
    { k: 'crash', name: 'Crash report', tech: true },
    { k: 'other', name: 'Other', tech: false },
  ],
  kind(k) { return this.KINDS.find(x => x.k === k) || null; },

  MSG_MAX: 4000,
  EMAIL_MAX: 254,
  NAME_MAX: 60,

  /* ---------------- device storage (it can THROW — iOS "Block All Cookies") ---------------- */
  _mem: {},
  _get(k) { try { return localStorage.getItem(k); } catch (e) { return Object.prototype.hasOwnProperty.call(this._mem, k) ? this._mem[k] : null; } },
  _set(k, v) { try { localStorage.setItem(k, v); } catch (e) { this._mem[k] = v; } },
  _del(k) { try { localStorage.removeItem(k); } catch (e) {} delete this._mem[k]; },
  _json(k, d) { try { const v = JSON.parse(this._get(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } },

  /* ---------------- the error ring ---------------- */
  ERR_KEY: 'neo-errlog',
  ERR_MAX: 20,
  ERR_SAVE_MS: 2000,
  _errs: null,
  errors() {
    if (!this._errs) {
      const a = this._json(this.ERR_KEY, []);
      this._errs = Array.isArray(a) ? a.slice(-this.ERR_MAX) : [];
    }
    return this._errs;
  },
  // record one fault. Consecutive repeats of the same message fold into a
  // count, so a fault thrown every frame is one line, not twenty.
  noteError(msg, stack, where) {
    try {
      const list = this.errors();
      const m = String(msg || 'Error').slice(0, 300);
      const last = list[list.length - 1];
      if (last && last.msg === m) { last.n = (last.n || 1) + 1; last.t = new Date().toISOString(); }
      else {
        list.push({ t: new Date().toISOString(), msg: m, at: String(where || '').slice(0, 160),
          stack: String(stack || '').split('\n').slice(0, 4).join('\n').slice(0, 600), n: 1 });
        while (list.length > this.ERR_MAX) list.shift();
      }
      this._saveErrsSoon();
    } catch (e) { /* the recorder must never become the fault */ }
  },
  _errT: 0,
  _saveErrsSoon() {
    if (this._errT) return;
    this._errT = setTimeout(() => { this._errT = 0; this._set(this.ERR_KEY, JSON.stringify(this.errors())); }, this.ERR_SAVE_MS);
  },
  _short(file) {
    try { const u = new URL(file, location.href); return u.pathname.split('/').slice(-2).join('/'); }
    catch (e) { return String(file || ''); }
  },
  installRing() {
    if (this._ring) return;
    this._ring = true;
    try {
      window.addEventListener('error', e => {
        // only SCRIPT errors reach window without capture — a missing PNG
        // fires on its own element and never comes here
        const at = e.filename ? this._short(e.filename) + ':' + (e.lineno || 0) + ':' + (e.colno || 0) : '';
        this.noteError(e.message || (e.error && e.error.message) || 'Script error', e.error && e.error.stack, at);
      });
      window.addEventListener('unhandledrejection', e => {
        const r = e.reason;
        this.noteError('Unhandled: ' + ((r && r.message) || String(r)), r && r.stack, 'promise');
      });
    } catch (e) {}
  },

  /* ---------------- what a report carries ---------------- */
  // the code version: the shared ?v= on the game's own script tags
  build() {
    try {
      const s = document.querySelector('script[src*="js/config.js"]');
      const m = s && /[?&]v=(\d+)/.exec(s.getAttribute('src'));
      if (m) return +m[1];
    } catch (e) {}
    return (window.PATCH_NOTES && PATCH_NOTES[0] && PATCH_NOTES[0].build) || null;
  },
  details() {
    const d = { build: this.build() };
    try { d.page = location.host + location.pathname + (location.search || ''); } catch (e) {}
    try {
      d.browser = navigator.userAgent;
      d.language = navigator.language || '';
      d.online = navigator.onLine !== false;
      d.screen = screen.width + 'x' + screen.height + ' @' + (window.devicePixelRatio || 1) + 'x';
      d.window = window.innerWidth + 'x' + window.innerHeight;
      d.installed = !!(navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches));
    } catch (e) {}
    try {
      const demo = window.Screens && Screens._demo;
      if (window.S && S.map && !demo) {
        d.run = { mode: S.mode || null, day: S.day || 0, size: S.sizeKey || null,
          landform: S.map.landform || null, variant: S.map.variant || null,
          seed: S.seed != null ? String(S.seed) : null, over: !!S.over };
      } else d.run = null;
    } catch (e) {}
    try { d.cardTest = !!(window.Deck && Deck.devOn && Deck.devOn()); } catch (e) {}
    try { if (typeof G !== 'undefined' && G.lastFrameError) d.frameError = String(G.lastFrameError).slice(0, 600); } catch (e) {}
    d.errors = this.errors().slice(-this.ERR_MAX).map(x => Object.assign({}, x));
    return d;
  },
  // the details as the email shows them: one readable block
  detailsText(d) {
    if (!d) return '';
    const L = [];
    L.push('Build: ' + (d.build || '?'));
    if (d.page) L.push('Page: ' + d.page);
    if (d.browser) L.push('Browser: ' + d.browser);
    if (d.screen) L.push('Screen: ' + d.screen + ' · window ' + d.window + (d.installed ? ' · home-screen app' : ''));
    if (d.language) L.push('Language: ' + d.language + (d.online === false ? ' · offline' : ''));
    if (d.run) L.push('Run: ' + [d.run.mode, 'day ' + d.run.day, d.run.size, d.run.landform, d.run.variant, d.run.seed ? 'seed ' + d.run.seed : '', d.run.over ? 'finished' : '']
      .filter(Boolean).join(' · '));
    else L.push('Run: none in progress');
    if (d.cardTest) L.push('Card test link: on');
    if (d.frameError) L.push('Frame fault: ' + d.frameError.split('\n')[0]);
    if (d.errors && d.errors.length) {
      L.push('Recent errors (' + d.errors.length + '):');
      for (const e of d.errors) L.push('  ' + e.t + (e.n > 1 ? ' ×' + e.n : '') + ' — ' + e.msg + (e.at ? ' @ ' + e.at : ''));
    } else L.push('Recent errors: none');
    return L.join('\n');
  },

  /* ---------------- checks ---------------- */
  validEmail(s) {
    s = String(s || '').trim();
    return s.length >= 6 && s.length <= this.EMAIL_MAX && /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[A-Za-z]{2,}$/.test(s);
  },
  // the form's verdict BEFORE anything is queued: the reason in the player's words
  check(f) {
    f = f || {};
    if (!this.kind(f.kind)) return { ok: false, field: 'kind', why: 'Choose what kind of report this is.' };
    if (!String(f.email || '').trim()) return { ok: false, field: 'email', why: 'Your email is needed so we can reply.' };
    if (!this.validEmail(f.email)) return { ok: false, field: 'email', why: 'That email address doesn’t look right.' };
    const m = String(f.message || '').trim();
    if (m.length < 5) return { ok: false, field: 'message', why: 'Tell us a little more — a sentence or two is plenty.' };
    if (m.length > this.MSG_MAX) return { ok: false, field: 'message', why: 'That’s a bit long — please keep it under ' + this.MSG_MAX + ' characters.' };
    return { ok: true };
  },

  /* ---------------- the client's rate limit ---------------- */
  SENT_KEY: 'neo-feedback-sent',
  GAP_MS: 20000,           // one report per 20 seconds…
  PER_HOUR: 5,             // …and five an hour, whatever the outbox holds
  rateCheck(now) {
    now = now || Date.now();
    const sent = this._json(this.SENT_KEY, []).filter(t => now - t < 3600e3);
    if (sent.length && now - sent[sent.length - 1] < this.GAP_MS)
      return { ok: false, why: 'Thanks! Please wait a few seconds before sending another.', waitMs: this.GAP_MS - (now - sent[sent.length - 1]) };
    if (sent.length >= this.PER_HOUR)
      return { ok: false, why: 'That’s a lot of reports in one hour — please try again a little later.' };
    return { ok: true };
  },
  _noteSent(now) {
    now = now || Date.now();
    const sent = this._json(this.SENT_KEY, []).filter(t => now - t < 3600e3);
    sent.push(now);
    this._set(this.SENT_KEY, JSON.stringify(sent.slice(-20)));
  },

  /* ---------------- the outbox ---------------- */
  OUT_KEY: 'neo-feedback-outbox',
  OUT_MAX: 20,
  OUT_DAYS: 90,            // a report nobody could deliver in three months is let go
  outbox() { const a = this._json(this.OUT_KEY, []); return Array.isArray(a) ? a : []; },
  _saveOutbox(list) {
    if (list.length) this._set(this.OUT_KEY, JSON.stringify(list.slice(-this.OUT_MAX)));
    else this._del(this.OUT_KEY);
  },
  _id() { return 'fb-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8); },

  // the email's fields, exactly as FormSubmit wants them
  mailPayload(it) {
    const k = this.kind(it.kind) || this.KINDS[3];
    const p = {
      name: it.name || 'Clanfire player',
      email: it.email,
      _replyto: it.email,
      _subject: 'Clanfire — ' + k.name,
      _template: 'table',
      _captcha: 'false',
      kind: k.name,
      message: it.message,
      details: it.details ? this.detailsText(it.details) : 'Not attached',
    };
    return p;
  },
  // the Supabase copy: submit_feedback(p_kind, p_email, p_message, p_details)
  storeArgs(it) {
    const det = Object.assign({ ref: it.id, name: it.name || null, at: it.at }, it.details ? { report: it.details } : {});
    return { p_kind: it.kind, p_email: it.email, p_message: it.message, p_details: det };
  },

  /* SUBMIT: check, rate-limit, write to the outbox, then try to send. The
     answer is one of
       { state: 'refused', field, why }   nothing queued — fix the form
       { state: 'offsite', why }          this page can never send (not queued)
       { state: 'sent' }                  the email went through
       { state: 'saved', offline, why }   kept on the device, sent later */
  async submit(f) {
    const c = this.check(f);
    if (!c.ok) return { state: 'refused', field: c.field, why: c.why };
    if (!this.canSend()) return { state: 'offsite',
      why: 'This copy of the game can’t send reports — only the live game at clanfire.online can. Nothing was sent.' };
    const rl = this.rateCheck();
    if (!rl.ok) return { state: 'refused', field: 'rate', why: rl.why };
    const it = {
      id: this._id(), at: Date.now(), kind: f.kind,
      email: String(f.email).trim(), name: String(f.name || '').trim().slice(0, this.NAME_MAX),
      message: String(f.message).trim(),
      details: f.attach ? this.details() : null,
      mailed: false, stored: false, tries: 0,
    };
    const list = this.outbox();
    list.push(it);
    this._saveOutbox(list);
    this._noteSent(it.at);
    await this.flush();
    const left = this.outbox().find(x => x.id === it.id);
    if (!left || left.mailed) return { state: 'sent', id: it.id };
    const offline = navigator.onLine === false || left.lastWhy === 'network';
    return { state: 'saved', id: it.id, offline,
      why: offline ? 'Saved — we’ll send it when you’re back online.'
        : 'Saved on this device — it will be sent automatically the next time you open the game.' };
  },

  canSend() { return !!(window.Backend && (Backend.mock || (Backend.telemetryAllowed && Backend.telemetryAllowed()))); },

  /* FLUSH: walk the outbox in order; each report needs its email and its
     copy. An item leaves when both are done, or when it is OUT_DAYS old. A
     flush never overlaps another, and never throws. */
  _flushing: null,
  flush() {
    if (this._flushing) return this._flushing;
    this._flushing = this._flush().catch(() => {}).then(() => { this._flushing = null; });
    return this._flushing;
  },
  async _flush() {
    if (!this.canSend()) return;
    let list = this.outbox();
    if (!list.length) return;
    const now = Date.now();
    for (const it of list) {
      if (now - (it.at || now) > this.OUT_DAYS * 864e5) { it.drop = true; continue; }
      it.tries = (it.tries || 0) + 1;
      if (!it.mailed) {
        const r = await Backend.mailFeedback(this.mailUrl(), this.mailPayload(it));
        if (r && r.ok) { it.mailed = true; it.lastWhy = null; }
        else it.lastWhy = (r && r.error && r.error.code) || 'network';
      }
      if (!it.stored) {
        const r = await Backend.storeFeedback(this.storeArgs(it));
        const d = r && r.ok ? r.data : null;
        // answered, a duplicate, or a door that is not there yet (0009 not
        // applied: a 404) or refuses this shape for good — the copy is done
        // either way; not reached / not signed in / slow down — try again
        if (d && d.ok === true) it.stored = true;
        else if (d && d.ok === false && !/^(not_authenticated|slow_down)$/.test(String(d.reason || ''))) it.stored = true;
        else if (r && !r.ok && r.error && (r.error.code === 404 || r.error.code === 400 || r.error.code === 'not_configured')) it.stored = true;
      }
      if (it.mailed && it.stored) it.drop = true;
    }
    // re-read before writing: a submit may have queued during the awaits
    const fresh = this.outbox();
    const byId = {};
    for (const it of list) byId[it.id] = it;
    list = fresh.map(x => byId[x.id] || x).filter(x => !x.drop);
    this._saveOutbox(list);
  },

  /* the retry: the next load, and the browser coming back online. Costs one
     storage read when the outbox is empty — which is every device that never
     sent a report. */
  installRetry() {
    if (this._retry) return;
    this._retry = true;
    const later = (ms) => setTimeout(() => { if (this.outbox().length) this.flush(); }, ms);
    try {
      window.addEventListener('load', () => later(6000));
      window.addEventListener('online', () => later(1500));
    } catch (e) {}
  },
};
window.Feedback = Feedback;
Feedback.installRing();
Feedback.installRetry();
