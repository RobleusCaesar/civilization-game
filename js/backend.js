"use strict";
/* Backend — the ONLY module that talks to Supabase. No other file may touch
   the Supabase client, fetch our REST endpoints, or read auth state.

   Identity: Supabase anonymous auth. First visit calls signInAnonymously();
   the session persists in localStorage, so the same device resumes the same
   identity. The recovery token (exportIdentity/importIdentity) is the escape
   hatch for moving devices. See BACKEND.md for the full contract.

   Every public method resolves to a typed result — { ok:true, data } or
   { ok:false, error:{ code, message } } — and NEVER throws into game code.

   Test seam: set window.__NEO_BACKEND_MOCK = { auth, rest } before init()
   and Backend runs against it instead of the network (see smoke suites). */

const Backend = {
  client: null,        // supabase-js client (auth only)
  mock: null,          // test transport
  uid: null,
  session: null,
  configured: false,
  online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
  activeSlot: null,    // the slot autosaves write to (null = not cloud-bound yet)
  autosaveDays: 2,     // cadence in in-game days (settings can change it)
  _lastAutosaveDay: 0,
  _busy: false,

  TIMEOUT_MS: 8000,
  RETRIES: 3,

  /* ---------------- status ---------------- */
  emit() {
    try {
      window.dispatchEvent(new CustomEvent('backend-status', {
        detail: { online: this.online, configured: this.configured, uid: this.uid },
      }));
    } catch (e) { /* headless quirk — status is advisory */ }
  },
  isReady() { return this.configured && !!this.uid; },

  /* ---------------- boot ---------------- */
  async init() {
    try { return await this._init(); }
    catch (e) {   // nothing in boot may ever throw into game code
      this.emit();
      return this._err('network', (e && e.message) || 'Backend boot failed');
    }
  },
  async _init() {
    this.mock = (typeof window !== 'undefined' && window.__NEO_BACKEND_MOCK) || null;
    // supabase-js can leak a detached fetch rejection when the network is
    // unreachable — that is just "offline" to us, not a crash
    if (!this._rejGuard) {
      this._rejGuard = true;
      window.addEventListener('unhandledrejection', e => {
        const m = String((e.reason && e.reason.message) || e.reason || '');
        if (/fetch|network|load failed/i.test(m)) { e.preventDefault(); this.online = false; this.emit(); }
      });
    }
    this.configured = this.mock ? true :
      (typeof SUPA_CFG !== 'undefined' && SUPA_CFG.url && SUPA_CFG.anonKey &&
       !SUPA_CFG.url.includes('PASTE_') && !SUPA_CFG.anonKey.includes('PASTE_'));
    window.addEventListener('online', () => { this.online = true; this.emit(); });
    window.addEventListener('offline', () => { this.online = false; this.emit(); });
    try { this.activeSlot = +(localStorage.getItem('neo-active-slot') || 0) || null; } catch (e) {}
    try { this.autosaveDays = +(localStorage.getItem('neo-autosave-days') || 2); } catch (e) {}
    if (!this.configured) { this.emit(); return this._err('not_configured', 'Cloud saves are not configured'); }

    if (!this.mock) {
      this.client = window.supabase.createClient(SUPA_CFG.url, SUPA_CFG.anonKey);
    }
    const auth = this.mock ? this.mock.auth : this.client.auth;
    let sessionRes = await this._guard(() => auth.getSession());
    let session = sessionRes.ok && sessionRes.data && sessionRes.data.data
      ? sessionRes.data.data.session : null;
    if (!session) {
      const signRes = await this._retry(() => auth.signInAnonymously());
      if (!signRes.ok) { this.emit(); return signRes; }
      session = signRes.data && signRes.data.data ? signRes.data.data.session : null;
      if (!session) { this.emit(); return this._err('auth_failed', 'Anonymous sign-in returned no session'); }
    }
    this.session = session;
    this.uid = session.user && session.user.id;
    const prof = await this.ensureProfile();
    this.emit();
    return prof.ok ? { ok: true, data: { uid: this.uid } } : prof;
  },

  /* ---------------- identity ---------------- */
  // deterministic friendly handle from the anonymous id — saves feel owned
  villageName(uid) {
    const ADJ = ['Amber', 'Windy', 'Mossy', 'Stony', 'Elder', 'Golden', 'Quiet', 'Wild',
      'Foggy', 'Sunny', 'Reed', 'Oaken', 'Ashen', 'Bright', 'Deep', 'High'];
    const NOUN = ['Hollow', 'Ford', 'Ridge', 'Glen', 'Meadow', 'Shore', 'Camp', 'Vale',
      'Creek', 'Barrow', 'Field', 'Grove', 'Marsh', 'Bluff', 'Rise', 'Haven'];
    let h = 2166136261;
    const s = String(uid || 'wanderer');
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    h >>>= 0;
    return ADJ[h % ADJ.length] + ' ' + NOUN[(h >>> 8) % NOUN.length];
  },

  async getProfile() {
    if (!this.isReady()) return this._err('not_ready', 'Not signed in');
    const r = await this._rest('GET', '/profiles?id=eq.' + this.uid + '&select=*');
    if (!r.ok) return r;
    return { ok: true, data: r.data[0] || null };
  },

  async ensureProfile() {
    if (!this.uid) return this._err('not_ready', 'Not signed in');
    return this._rest('POST', '/profiles?on_conflict=id', [{ id: this.uid }],
      { Prefer: 'resolution=ignore-duplicates,return=minimal' });
  },

  async setChiefName(name) {
    if (!this.isReady()) return this._err('not_ready', 'Not signed in');
    return this._rest('PATCH', '/profiles?id=eq.' + this.uid,
      { chief_name: String(name || '').slice(0, 40) }, { Prefer: 'return=minimal' });
  },

  // recovery token: the refresh token IS the identity — one string moves it
  exportIdentity() {
    if (!this.session || !this.session.refresh_token)
      return this._err('not_ready', 'No identity to export yet');
    return { ok: true, data: 'NEO1.' + btoa(JSON.stringify({ rt: this.session.refresh_token })) };
  },

  async importIdentity(token) {
    if (!this.configured) return this._err('not_configured', 'Cloud saves are not configured');
    let rt;
    try {
      if (!String(token).startsWith('NEO1.')) throw 0;
      rt = JSON.parse(atob(String(token).slice(5))).rt;
      if (!rt) throw 0;
    } catch (e) { return this._err('bad_token', 'That does not look like a recovery token'); }
    const auth = this.mock ? this.mock.auth : this.client.auth;
    const r = await this._retry(() => auth.refreshSession({ refresh_token: rt }));
    if (!r.ok) return r;
    const session = r.data && r.data.data ? r.data.data.session : null;
    if (!session) return this._err('bad_token', 'Recovery token was not accepted');
    this.session = session;
    this.uid = session.user && session.user.id;
    await this.ensureProfile();
    this.emit();
    return { ok: true, data: { uid: this.uid } };
  },

  /* ---------------- save slots ---------------- */
  async listSaves() {
    if (!this.isReady()) return this._err('not_ready', 'Not signed in');
    const cols = 'slot,name,game_version,day,map_seed,landform,playtime_seconds,thumbnail,updated_at';
    const r = await this._rest('GET', '/saves?user_id=eq.' + this.uid + '&select=' + cols + '&order=slot.asc');
    return r.ok ? { ok: true, data: r.data } : r;
  },

  async saveSlot(slot, name, stateObj, meta) {
    if (!this.isReady()) return this._err('not_ready', 'Not signed in');
    meta = meta || {};
    const row = {
      user_id: this.uid, slot,
      name: String(name || 'Village').slice(0, 60),
      game_version: String(meta.version || (typeof CFG !== 'undefined' && CFG.SAVE_VERSION) || 1),
      day: meta.day || 1,
      map_seed: meta.seed || null,
      landform: meta.landform || null,
      playtime_seconds: Math.round(meta.playtime || 0),
      thumbnail: meta.thumbnail || null,
      state: stateObj,
    };
    return this._rest('POST', '/saves?on_conflict=user_id,slot', [row],
      { Prefer: 'resolution=merge-duplicates,return=minimal' });
  },

  async loadSlot(slot) {
    if (!this.isReady()) return this._err('not_ready', 'Not signed in');
    const r = await this._rest('GET', '/saves?user_id=eq.' + this.uid + '&slot=eq.' + slot + '&select=*');
    if (!r.ok) return r;
    if (!r.data[0]) return this._err('empty_slot', 'That slot is empty');
    return { ok: true, data: r.data[0] };
  },

  async deleteSlot(slot) {
    if (!this.isReady()) return this._err('not_ready', 'Not signed in');
    return this._rest('DELETE', '/saves?user_id=eq.' + this.uid + '&slot=eq.' + slot, null,
      { Prefer: 'return=minimal' });
  },

  async renameSlot(slot, name) {
    if (!this.isReady()) return this._err('not_ready', 'Not signed in');
    return this._rest('PATCH', '/saves?user_id=eq.' + this.uid + '&slot=eq.' + slot,
      { name: String(name || 'Village').slice(0, 60) }, { Prefer: 'return=minimal' });
  },

  markActiveSlot(slot) {
    this.activeSlot = slot || null;
    try {
      if (slot) localStorage.setItem('neo-active-slot', String(slot));
      else localStorage.removeItem('neo-active-slot');
    } catch (e) {}
  },

  /* ---------------- autosave + the emergency crash net ---------------- */
  // Called by the game every N in-game days and on tab-hide. ALWAYS drops the
  // local emergency snapshot first (survives crash/offline); pushes to the
  // active cloud slot when one is bound and the backend is reachable.
  async autosaveNow(reason) {
    if (!window.S || S.over) return this._err('no_game', 'No running game');
    const json = G.saveJSON();
    this.snapshotLocal(json);
    if (!this.isReady() || !this.activeSlot) return this._err('no_slot', 'No cloud slot bound');
    if (this._busy) return this._err('busy', 'Autosave already in flight');
    this._busy = true;
    try {
      const meta = {
        day: S.day, seed: S.seed, landform: S.map.landform,
        playtime: S.playtime || 0, thumbnail: R.thumb ? R.thumb() : null,
        version: CFG.SAVE_VERSION,
      };
      const r = await this.saveSlot(this.activeSlot, this.activeName || 'Village', JSON.parse(json), meta);
      if (r.ok) this._lastAutosaveDay = S.day;
      return r;
    } finally { this._busy = false; }
  },

  snapshotLocal(json) {
    try {
      localStorage.setItem('neo-emergency', JSON.stringify({
        at: Date.now(), day: window.S ? S.day : 0, slot: this.activeSlot, json,
      }));
    } catch (e) { /* storage full/blocked — the cloud path still runs */ }
  },

  readLocalSnapshot() {
    try {
      const raw = localStorage.getItem('neo-emergency');
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  },
  clearLocalSnapshot() { try { localStorage.removeItem('neo-emergency'); } catch (e) {} },

  /* ---------------- transport: retry, timeout, typed errors ---------------- */
  _err(code, message) { return { ok: false, error: { code, message } }; },

  async _guard(fn) {
    try { return { ok: true, data: await fn() }; }
    catch (e) { return this._err('network', (e && e.message) || 'Network failure'); }
  },

  // up to RETRIES attempts with exponential backoff on transport failures
  async _retry(fn) {
    let last = null;
    for (let a = 0; a < this.RETRIES; a++) {
      const r = await this._guard(fn);
      if (r.ok) {
        const err = r.data && r.data.error;   // supabase-js style { data, error }
        if (!err) return r;
        last = this._err(err.code || 'supabase', err.message || String(err));
        if (!this._transient(err)) return last;
      } else last = r;
      await new Promise(res => setTimeout(res, 350 * Math.pow(2, a)));
    }
    return last || this._err('network', 'Request failed');
  },

  _transient(err) {
    const s = err && (err.status || err.code);
    return !s || s === 'network' || (typeof s === 'number' && s >= 500) || s === 429;
  },

  // PostgREST over plain fetch — small, controllable, easy to mock
  async _rest(method, path, body, headers) {
    if (this.mock) return this._retry(() => this.mock.rest(method, path, body, headers))
      .then(r => r.ok ? { ok: true, data: r.data } : r);
    let last = null;
    for (let a = 0; a < this.RETRIES; a++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), this.TIMEOUT_MS);
      try {
        const res = await fetch(SUPA_CFG.url + '/rest/v1' + path, {
          method,
          signal: ctrl.signal,
          // apikey identifies the project; Authorization carries the user's
          // JWT. New-format sb_publishable_ keys are not JWTs, so with no
          // session we send apikey alone (legacy anon-JWT keys also accept
          // that) — in practice every call here runs signed-in anyway.
          headers: Object.assign(
            { apikey: SUPA_CFG.anonKey, 'Content-Type': 'application/json' },
            this.session ? { Authorization: 'Bearer ' + this.session.access_token } : {},
            headers || {}),
          body: body == null ? undefined : JSON.stringify(body),
        });
        clearTimeout(timer);
        if (res.status === 401 && a === 0 && this.client) {
          // stale access token — refresh once, then retry
          const rr = await this._guard(() => this.client.auth.refreshSession());
          if (rr.ok && rr.data && rr.data.data && rr.data.data.session)
            this.session = rr.data.data.session;
          continue;
        }
        if (!res.ok && res.status >= 500) { last = this._err(res.status, 'Server error'); }
        else if (!res.ok) {
          let msg = 'Request failed (' + res.status + ')';
          try { const j = await res.json(); msg = j.message || j.error_description || msg; } catch (e) {}
          return this._err(res.status, msg);
        } else {
          const text = await res.text();
          this.online = true;
          return { ok: true, data: text ? JSON.parse(text) : null };
        }
      } catch (e) {
        clearTimeout(timer);
        last = this._err('network', e && e.name === 'AbortError' ? 'Request timed out' : 'Network failure');
        this.online = navigator.onLine !== false;
        this.emit();
      }
      await new Promise(res => setTimeout(res, 350 * Math.pow(2, a)));
    }
    return last || this._err('network', 'Request failed');
  },
};

// classic-script global: guards elsewhere test window.Backend
window.Backend = Backend;
