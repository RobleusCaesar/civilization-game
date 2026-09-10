# BACKEND.md — Clanfire Cloud Saves

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

## Arcade leaderboard

`/supabase/migrations/0002_leaderboard.sql` adds `profiles.arcade_name`
(≤ 7 chars) and a `leaderboard` table (name, score, mode, day, seed,
version). RLS: **select for everyone** (it is a global board), **insert only
as yourself**, and no update/delete at all — scores are history. The client
is the score authority (this is a fully client-side game; the board is for
friendly competition, not anti-cheat). `Backend.topScores(n)` reads the top
N; `Backend.submitScore(name, entry)` inserts one victory row and stamps the
arcade name onto the profile. Name validation (length, charset, profanity)
lives in `Score.cleanName` and runs before submission.

## Analytics — private, aggregate-only

`/supabase/migrations/0003_reset_leaderboard_and_analytics.sql` does two
things in one operator action: it **wipes the leaderboard** (0002 gave that
table no delete policy on purpose, so a reset can only happen in the SQL
editor) and it adds the analytics path.

### What is collected

One `telemetry` row per event, written by `Backend._emit` and never awaited
by game code:

| kind | when | carries |
|---|---|---|
| `run_start` | a founded run is entered (after the draft) | mode, landform, size, device, kept card, tutorial on/off, seed |
| `run_end` | `G.end` — win, loss or struck banner | outcome, cause, day, seconds, town level, peak tribe, score, and a props bag (buildings, units, kills, walls, upgrades, explored %, wonder key, relic found) |
| `session` | the tab hides or unloads | seconds on site, device |

A `run_start` with no matching `run_end` **is** an abandoned run — that is
how the dashboard measures drop-off.

The identity is the same anonymous auth uid the saves already use. No name,
no message text, no location, no third party; the row goes to our own
Supabase table and nowhere else. `Backend.telemetryOn = false` switches the
whole thing off at runtime.

The demo world behind the title also calls `G.newGame`, and it must never be
counted: `G._freshRun` (transient, never saved) is set by `newGame` and read
once by `Screens._enterNow`, which is also why **loading a save is not a new
run**.

### How it is read

- The `telemetry` table has RLS on and **no select policy at all**, so the
  shipped publishable key cannot read one row of it.
- The only read path is `analytics_summary(p_token, …filters)`, a
  `security definer` function returning **aggregates only** — counts and
  averages, never a row. A stolen passphrase still cannot expose one
  player's history.
- The passphrase never reaches the wire: `/analytics.html` sends
  `sha256('clanfire-analytics-v1:' || passphrase)` and the database compares
  a hash of *that* against `analytics_config.token_hash`.

Set it once, in the SQL editor:

```sql
select public.set_analytics_token('a long passphrase');
```

Then open `/analytics.html` and sign in with the passphrase itself. Filters
(date range, difficulty, landform, device, build version) are passed to the
same function, so filtering also happens in the database.

**What this is not:** GitHub Pages has no server, so this is not a login and
there is no rate limiting beyond Supabase's own. The page is `noindex`, and
the security boundary is the aggregate-only function plus a passphrase you
choose. Use a long one.

## The prize-draw competition

`js/competition.js` + `/supabase/migrations/0004_competition.sql`. The whole
client feature lives in the one file behind one kill switch
(`Competition.on`, ships `false`); removal is delete the file, its
`<script>` tag, and the one `Competition.offer` line in `Screens.showEnd`
(fourth, cosmetic: the marked COMPETITION panel block in analytics.html).

**THE WINDOW.** Opening and closing are dates, not a switch anyone has to
remember to throw: `Competition.OPENS_AT` / `CLOSES_AT` for the UI, and the
`competition_window` row for the truth. The server checks its own row before
writing anything, so a wrong device clock can neither open the draw early nor
keep it open late, and a missing row fails CLOSED. Moving a date means both
places — the table (one `update`) and the two constants.

**Eligibility** (client-side friction, not enforcement — accepted at this
prize size): a finished run, win or loss, with `S.playtime ≥ MIN_SECONDS`
and a score gate that is **the same effort on every difficulty**.

That last part is the one non-obvious rule. `CFG.SCORE.mult` is
calm 0.5 / moderate 1.0 / hard 1.75, so gating the FINAL total would ask a
calm player for double the work of a moderate one — backwards, since calm is
where a new player starts. Measured on the real model, an honest 12-minute
calm loss ("a few huts, a little scouting") totals 349 and would have been
turned away, while the identical effort on hard totals 1,222 and sails in.
So the gate reads the run's **pre-multiplier subtotal** against
`MIN_SCORE` (`GATE_PRE_MULTIPLIER`), and the quiet line quotes
`MIN_SCORE × that mode's multiplier` — 250 calm, 500 moderate, 875 hard —
which is the same bar said in the number the player can actually see on
their own end screen. A near-idle run (subtotal ~310) still fails on every
difficulty.

Below a gate: one quiet line naming what was missed. The demo world and
loaded games are excluded the same way telemetry excludes them.

**What the server enforces** (`enter_competition`, SECURITY DEFINER, the
only write path — anon has NO direct privilege on either table):

- up to **5 entries per email**, one per **distinct finished game** — the
  entry's `game_session_id` is the telemetry run id, so entries
  cross-reference against `telemetry` rows;
- duplicates and over-cap submissions answer `{ok:true}`, create no entry,
  and still record the feedback (`counted=false`) — nothing ever reveals
  counts or whether an email exists;
- emails are normalized (`lower(trim())`) so case cannot dodge the cap; an
  advisory lock serializes same-email races.

**The email list is sealed.** `competition_entries` has RLS with no
policies and every privilege revoked; `competition_feedback` HAS NO EMAIL
COLUMN. `analytics_summary` returns entry COUNTS and email-free feedback
rows only — proven in the migration's harness by asserting no `@` appears
anywhere in its output. Entries are read exactly one way: the SQL editor,
when drawing a winner (a reference query ships in the migration).

**The confirmation invites another run** — driving replays is the point of
the draw. It is static text: it never states a count, never implies whether
this particular entry counted, and never hints that the address was already
known, because those are exactly the leaks the uniform response exists to
prevent.

**Drawing is weighted BY ENTRY, deliberately.** `order by random() limit 1`
over `competition_entries` picks a row, and five entries is five rows, so a
five-game player carries five chances. Drawing by person would need
`select distinct email` first; the migration says so where the query lives,
so it cannot be second-guessed later.

**A trap worth keeping** (found and closed here, present in 0003 as shipped):
Postgres grants EXECUTE on a new function to PUBLIC, and
`revoke ... from anon, authenticated` does **not** remove the PUBLIC grant
those roles inherit — measured, `has_function_privilege('anon', …)` still
answered true. Every function is now `revoke ... from public` first and
granted deliberately after. Check any new one the same way.

**Feedback**, required before the email, two taps: a 1-5 rating and one
improvement pick (`too_hard / too_slow / confusing / not_enough_to_do /
more_content / visuals / good`), plus an optional 500-char free text. The
dashboard's competition panel shows entries over time, the rating histogram,
the improvement breakdown, win/loss and score-band segments, and the free
texts.

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
