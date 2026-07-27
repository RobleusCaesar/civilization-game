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
node tests/tower-archer-miss.mjs # Lv1 towers miss 1/3, base archers miss 1/4
node tests/sapper-deselect-heal.mjs # sapper dispatch deselects; sapper heals at the TC
node tests/heal-limit.mjs      # at most 3 heals/unit per rolling 60s real-time window
node tests/bridge-resource-shore.mjs # a resource-shored bank is bridgeable; no silent bridge failures
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

**Tower/archer miss chance** (`tests/tower-archer-miss.mjs`): a level-1
Watchtower (and the War Camp, which fires like one — no upgrade path of its
own) misses 1 shot in 3; a base Archer misses 1 in 4, against both units and
buildings. A deliberate early-game nerf so upgrading actually matters — Lv2/Lv3
towers, longbow and marksman are all untouched, and it's owner-agnostic (same
combat.js code path fires for the rival's towers/archers, no `owner === 'P'`
branch anywhere in the check). A miss shows `'Miss!'` via the same `R.float`
path as a damage number, in place of it — no damage is dealt, no HP is lost.
Rolls `G.rand()`, not `Math.random()`, so a seed's hit/miss sequence stays
reproducible.

**Sapper deselect & heal** (`tests/sapper-deselect-heal.mjs`): a sapper given a
real terraform task (bridge tap, or a drag-chain dig/clear/mound) deselects
just like a villager sent to gather/build/station — both now go through
`UI.dispatchedWorker` (renamed from `dispatchedVillager`). The catch:
`Units.queueTerraform`'s return count is tiles QUEUED, not tiles the sapper
actually reaches — a queued tile with no passable neighbour fails silently
inside `Units.startNextTerraform`, so `commitTerraDrag` checks the sapper's
real task/queue state afterward rather than trusting that count, or it would
deselect on a silent failure with no way for the player to notice. Sappers
also heal at the Town Center now — they're a land unit like any other and
`Bld.healZoneFor` always treated them that way; the only gap was a missing
`CFG.HEAL_FOOD.sapper` entry, which alone gated the whole heal UI off. Its
price (30) matches its food line item at training, the same convention as
villager/defender/archer.

**Heal limit** (`tests/heal-limit.mjs`): closes the "stand in the Town Center
ring and spam Heal through a live fight" exploit — a unit topped off between
every blow never effectively dies. At most `CFG.HEAL_LIMIT_N` (3) heals per
unit inside any rolling `CFG.HEAL_LIMIT_MS` (60s) window, tracked in real
wall-clock time (`performance.now()`, not `S.day`/`S.dayT`) because the
exploit is real-time click-spamming, not anything tied to the in-game
calendar. The log (`UI.healLog`/`UI._healLog`) is UI-local, same precedent as
`UI._toastAt` — never on the unit or in `S`, so it's never in a save file —
and is cleared in both `G.newGame` and `G.loadJSON` so a fresh/loaded game's
reused low unit ids can't inherit a stale cooldown. `.cant` is opacity only
and never blocks the click, so `UI.healThrottled` is re-checked inside the
click handler itself, before the zone/afford checks — it's the branch that
actually matters mid-fight, where zone/afford are usually already fine.

**Bridge over a resource shore** (`tests/bridge-resource-shore.mjs`): a bridge
must SPAN water — land on both opposite sides — but `Terraform.bridgeCrossing`'s
`land()` check used `Path.passable`, which a standing resource (forest/hills/
fertile) fails exactly like water does. So a water tile with a tree- or
rock-lined far shore had NO valid span and could never be bridged, even though
mounding the same water right next to a resource works fine — a real player-
facing dead end reported as "there was a bridge there, maybe it got destroyed."
`land()` now also accepts `Terraform.CLEARABLE` terrain as a landing side; the
far bank still blocks movement until a sapper clears it (tier 3, the existing
`clear` job, untouched) — build the span, then clear the landing with the same
sapper. A second bug compounded the symptom: the terraform task's mid-work
revalidation checked only `Terraform.bridgeable` (still water?), not
`bridgeCrossing` (still a valid SPAN?) — so an invalidated crossing let the
sapper animate for the *full* build timer and then `Bld.buildBridge` failed
silently at the end: no bridge, no toast, no log line, which is exactly what a
player would misremember later as a bridge that vanished. Revalidation now
calls `bridgeCrossing` (and re-checks `Bld.bridgeAt`), so an invalidated span
drops the job promptly like any other skipped tile, and a completion-time
failure (defensively still possible) now toasts a reason instead of finishing
in silence.
