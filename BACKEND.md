# BACKEND.md — Neolithic Cloud Saves

How the game talks to Supabase. **Rule zero: `js/backend.js` is the only file
that may touch the Supabase client, our REST endpoints, or auth state.** Game
code calls `Backend.*` and receives typed results — never raw exceptions.

## Architecture at a glance

```
 Browser                                Supabase project
┌──────────────────────────┐          ┌─────────────────────────┐
│ game code (G/UI/Screens) │          │ Auth (anonymous users)  │
│        │ typed results   │  HTTPS   │  auth.users             │
│        ▼                 │ ───────► ├─────────────────────────┤
│ js/backend.js            │          │ Postgres + RLS          │
│  · supabase-js (auth)    │          │  public.profiles        │
│  · plain fetch (REST)    │          │  public.saves (5 slots) │
│  · retry / timeout       │          └─────────────────────────┘
│  · localStorage crash net│
└──────────────────────────┘
```

- `js/vendor/supabase.js` — vendored supabase-js v2 UMD (plus its lazy
  `591.supabase.js` chunk, only fetched if realtime were ever used). No CDN
  at runtime; the site stays self-contained.
- `js/config.supabase.js` — project URL + anon key. With placeholder values
  the backend reports `not_configured` and the game runs happily without
  cloud saves (file export/import and the local crash net still work).

## Schema

```
profiles                          saves
─────────                         ─────
id uuid PK = auth.uid() ─────────┐user_id uuid FK → profiles
chief_name text                  │slot smallint 1–5   ┐ unique
created_at timestamptz           │name text           ┘ (user_id, slot)
                                  game_version text
                                  day int · map_seed text · landform text
                                  playtime_seconds int
                                  thumbnail text (small base64 minimap PNG)
                                  state jsonb  (the full game state S)
                                  created_at / updated_at (trigger-maintained)
```

Migration lives in `/supabase/migrations/0001_init.sql`. Apply it by pasting
the whole file into the Supabase **SQL editor** (or `supabase db push`).

### Row Level Security — the actual security boundary

The anon key ships in the client on purpose; it only grants the ability to
*be* an anonymous user. Every table has RLS enabled with four policies
(`select` / `insert` / `update` / `delete`), each scoped to
`auth.uid() = id` (profiles) or `auth.uid() = user_id` (saves):

- a browser can only ever read or write rows belonging to the identity it is
  signed in as;
- there is no cross-player read path at all — leaderboards etc. would need
  new, deliberately-written policies;
- `insert` policies use `with check` so a client cannot forge rows for
  another `user_id`.

## Identity model

- **First visit:** `supabase.auth.signInAnonymously()`. Supabase persists the
  session in localStorage; the same device/browser resumes the same identity
  forever. Zero login UX.
- **Village name:** a deterministic adjective–noun handle derived from the
  uid (`Backend.villageName`) so saves feel owned; an optional
  "name your chief" field writes `profiles.chief_name`.
- **Known limitation (also in README):** clearing site data (Safari
  "Remove Website Data") deletes the session → that identity and its cloud
  saves become unreachable.
- **Recovery token — the escape hatch:** `Backend.exportIdentity()` returns
  one string (`NEO1.<base64 of the refresh token>`). On another device,
  `Backend.importIdentity(token)` redeems it via the refresh-token grant and
  adopts the identity. Treat the token like a password. Note refresh tokens
  rotate: export a fresh token after moving, and the *old* string may no
  longer be valid.

## Save lifecycle

- **Slots:** five per player (`slot` 1–5), each carrying name, day, seed,
  landform, playtime, thumbnail (72×72 minimap data-URL) and the full
  `state` JSON.
- **Autosave:** every 2 in-game days (`Backend.autosaveDays`, configurable in
  Settings, 0 = off) and on `visibilitychange → hidden`. Autosave writes to
  the **active slot** — the slot the current run was saved to or loaded
  from (`Backend.markActiveSlot`). A brand-new unsaved run has no active
  slot; only the crash net runs until the player saves once.
- **Crash net (not an offline mode):** every autosave attempt first writes a
  full snapshot to `localStorage['neo-emergency']` — synchronously, before
  any network. After a crash/refresh/drop, the title screen compares the
  snapshot against the cloud slot's `updated_at` and offers to restore +
  sync it. `Backend.readLocalSnapshot()` / `clearLocalSnapshot()`.
- **Versioning:** saves embed `v` (= `CFG.SAVE_VERSION`) and the row stores
  `game_version`. On load, anything older flows through `G.loadJSON`'s
  field-backfill migration (every legacy field gets a default — this has
  been the migration path since the first save-compat change). Loading a
  save *newer* than the engine refuses cleanly.
- **File export/import** (Settings → Export save) remains as the manual
  backup path, unchanged.

## Error-handling contract

Every public method resolves (never rejects) to:

```js
{ ok: true, data: ... }
{ ok: false, error: { code, message } }   // codes: not_configured, not_ready,
                                          // network, busy, empty_slot,
                                          // bad_token, auth_failed, <http status>
```

- **Retry:** transport failures and 5xx retry up to 3 attempts with
  exponential backoff (350ms · 2ⁿ).
- **Timeout:** every REST call aborts at 8s.
- **401 handling:** one silent token refresh, then the request is retried.
- **Status events:** `window` receives `backend-status` CustomEvents
  (`{ online, configured, uid }`) on init and on connectivity changes; the
  shell renders these as a cloud indicator.

## Pointing at a different Supabase project

1. Create a project → Authentication → Sign In / Up → enable **anonymous
   sign-ins**.
2. Run `/supabase/migrations/0001_init.sql` in the SQL editor.
3. Put the project URL and anon (public) key into `js/config.supabase.js`.
4. Ship. No other file changes.

## Testing

The suites never touch the network: setting `window.__NEO_BACKEND_MOCK =
{ auth, rest }` before `Backend.init()` swaps the whole transport for an
in-page fake (see `smoke37` for the reference mock: an in-memory table pair
with upsert/select/delete semantics and a fake anonymous session).
