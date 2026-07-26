# Clanfire — notes for Claude

Vanilla JS + Canvas 2D, classic scripts sharing globals (`CFG`/`T`, `S`/`G`, `UI`,
`Bld`, `Units`, `R`, …). No build step. Deploy = commit on the working branch,
fast-forward merge to `main`, push both; GitHub Pages serves `main`.

## Tap & selection contract — DO NOT re-break

Tap accuracy has regressed multiple times when nearby code changed. It is now
covered by a contract test. **Run it after touching any of:**

- `ui.js` — `handleTap`, `handleDoubleTap`, `snapNear`, `select`/`deselect`, unit hit-testing
- `units.js` — `assignGather`, `assignBuild`, `moveTo`, `setPath`
- `render.js` — `screenToWorld`, `screenToTile`, unit drawing offsets
- `config.js` — `TILE`, `SPRITE_LIFT`, `GATHER`

```
node tests/tap-audit.mjs      # exits non-zero on any regression
```

The invariants it enforces (details in the test file):

1. **Hit-tests aim at the drawn sprite, not the logical position.** Unit sprites
   render `CFG.SPRITE_LIFT` px above `u.y` — that constant is the single source
   of truth for BOTH render.js and the hit-tests in ui.js. Never hard-code the
   lift anywhere else.
2. **While a unit/party is selected, taps are orders first.** A bystander own
   unit only steals the selection when tapped dead-on (≤0.55 tiles from its
   visual center; tighter still on resource tiles). Transports stay boardable.
3. **Near-miss snapping** (`UI.snapNear`, ~0.4 tile forgiveness): slightly-off
   taps land on the intended resource / camp / build site / enemy building —
   but each snap is gated by what the current selection could actually DO
   there, so e.g. a walk order beside a healthy wall is never stolen.
4. **No silent failures.** An order that can't be carried out (e.g. no clear
   ground beside a resource) must toast a reason.
5. A stationed worker (or builder) wins taps on their own plot; the building
   takes the tap once nobody works it. Dead-on taps always reselect.

If a new feature genuinely needs different tap behaviour, update
`tests/tap-audit.mjs` in the same commit and say so in the commit message —
never leave the test failing or weaken a threshold without explaining why.

## Other checked-in contracts

Same deal — run the one that covers what you touched, and update it in the same
commit if the behaviour is meant to change.

```
node tests/combined-arms.mjs   # AI assault composition: feint vs one full attack
node tests/wall-line.mjs       # a building may NEVER be part of the AI wall line
node tests/siege-progress.mjs  # a siege round is scored on PENETRATION, not damage
node tests/trade-post.mjs      # any-resource exchange stays stingy in every direction
node tests/endgame-doom.mjs    # the no-way-back offer fires only when it is true
node tests/endgame-doom-ai.mjs # the rival finishes a spent town, fog-honestly
node tests/camp-crew.mjs       # a station's own hands raise its upgrade, then return
node tests/foe-notes.mjs       # enemy/raider intel toasts are gated by difficulty
```

**Wall line** (`tests/wall-line.mjs`, details in `RIVAL_AI.md`): only `wall` and
`gate` block movement — `Path.passable` ignores every other building. So a farm
or tower sitting in the rival's perimeter ring is a *door*, not a wall. Covers
`AI.plot` / `towerSpot` / `wallCenter` / `wallAudit` / `wallDetour` /
`wallRelocate` / `mendWallLine` / `maybeWalls` / `playerLanes` / `foeSoftDoors`,
`Bld.tileFree` / `canPlace` / `blockAt`, and `Path.passable`. `AI.WALL_R` is the
single source of truth for where the line runs — never hard-code the radius.
**The ring must never seal the town in** (`AI.townOut` / `wallWouldSeal` /
`openTheGate`): a sealed ring has no seams, so `read.homeGapCount` is 0 and the
wall utility never runs — which is why the check lives in `digAndProtect`.

**Siege progress** (`tests/siege-progress.mjs`, details in `RIVAL_AI.md`): walls
and gates are ordinary entries in `S.buildings`, so "a building was destroyed"
and "fortification HP fell 10%" are BOTH satisfied by razing one wall section.
Never score a siege round that way — the verdict is whether raiders got INSIDE
(`AI.INSIDE_R` of the player hall) or a town-core building burned. Covers
`AI.campaignLaunch` (round evaluation / `startRound`) / `campaignSelect` /
`campaignReady` / `notePenetration` / `_foeCoreCount` / `_noteStrat` /
`routeHolds`, and `Combat.aiRaidSeek`. A plan that isn't attacking must hand the
initiative back to ordinary raids — check the `owns` flag before adding any new
early return to `campaignLaunch`.

**Trading Post** (`tests/trade-post.mjs`): trades any resource for any other via
a two-step panel (need → pay). The three directions have three rates in
`CFG.TRADE` — `gold` (goods→gold, deliberately awful), `swap` (goods→goods, 2–4
paid per 1) and `buy` (gold→goods). `buy` is bounded by arithmetic, not taste:
`gold * buy` must stay under `1 / swap` or laundering through gold beats a direct
swap and the direct trade becomes pointless. **Raising `buy` requires lowering
`swap`.** Legacy saves hold caravans of the old `{res, gold}` shape —
`Bld.caravanHaul` must keep paying those out.

**No way back** (`tests/endgame-doom.mjs` + `-ai`): when the village provably
cannot feed itself (no villagers, food under a villager's price, no Trading
Post) `G.checkDoom` offers Resign / "I like to suffer", once per run. It does
not reason about whether a fishing boat might still be working — it MEASURES,
requiring the granary to also fail to rise for `DOOM_DAYS`. On the other side,
`AI.foeSpent` / `stormTheHall` put every warrior on the hall, drawn from sight
alone: eyes on the hall, no villager visible, and **never** a check against a
unit the chief cannot see. A hidden villager is deliberately not caught —
catching it would mean reading hidden state.

**Camp crew** (`tests/camp-crew.mjs`): lumber camps, quarries and lodges hold
two workers, and production is paused for the whole upgrade — so BOTH hands
down tools and build (every builder on site ticks the works, so two raise it in
half the time), and both go back to the seam. Coming back lives in
`Bld.finishUpgrade` → `Bld.resumeCrew`, not in the builder's own tick: with two
builders only one crosses the finish line, and which one got there first must
not decide who keeps their job.

**Foe notes** (`tests/foe-notes.mjs`): telegraphs of the rival's plans
(campaigns, war camps, marching hosts, harassment sorties) and barbarian
sightings all go through `G.foeNote`, gated by `CFG.MODES[mode].foeNoteChance`
— Calm always toasts (1), Moderate is a coin flip (0.5), Hard never does (0).
The event log always gets the full entry regardless of difficulty; only the
proactive toast is gated. **`G.foeNote` is never used for "X under attack!"**
— that alarm for the player's own buildings stays on plain `G.log` and fires
at every difficulty, because it's the only defensive alarm in the game. The
gate uses `G.rand()` (the seeded RNG), not `Math.random()`, so a seed's toast
sequence stays reproducible.
