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
node tests/barb-sense.mjs      # barbarians attack any land unit, leave when stuck, land smart
node tests/rival-crossing.mjs  # AI reaches its own works, eats before hoarding, bridges around towers
node tests/finished-run-continue.mjs # a win never clobbers a save slot; Continue retires the whole run
node tests/drag-move.mjs       # drag-to-move: press ON the selection + drag = order, never a reselect
node tests/chase-commit.mjs    # a hunter commits to its detour; no unit wedged in reshaped ground
node tests/defend-hold.mjs     # Defend holds at the DEFENSES: tight ring, tower lanes, behind walls
node tests/work-order.mjs      # wall/trench lines never box the worker in — far side of a choke first
node tests/sapper-fees.mjs     # sapper services bill per tile, dearer by tier, exactly once, never into debt
node tests/army-groups.mjs     # dense 2-per-tile formations; three saved armies on right-rail banners
node tests/boats-moat-scuttle.mjs # a moat is open water to hulls; Scuttle sinks a boat, frees its pop, refunds nothing
node tests/army-strategies.mjs # the three assault doctrines (Siege/Chaos/Strike) — for the player AND the rival
node tests/build-stages.mjs    # work sites show 3 staged looks at 1/3 intervals; upgrades own their labels
node tests/burn-down.mjs       # damaged buildings burn in thirds; a razed one leaves 5 days of unbuildable ash
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
**And the ring is not the whole truth** (POCKET CORK, same test): `townOut`
only checks Chebyshev-R escape from the hall, so a town backed into a terrain
pocket BIGGER than its ring reads "open" while a wall line plugging the
pocket's one pass has sealed the army off the map — a real day-208 game corked
its only pass with a straight 8-section line, no gate anywhere. Ground truth
is `AI.corkedGround` (flood the army's ground as-is vs pretending own walls
open; ≥24 tiles hidden behind own stone = corked — and a wall SITE under
construction counts as solid in the strict flood, or two half-built sections
of the closing line would vouch for each other). Cure: `AI.cutTheCork`, run
daily from `maybeWalls` BEFORE its wood gate (cutting is free; a broke sealed
town still frees its army). Prevention: the cork check joins `wallWouldSeal`
in the placement clamps (maybeWalls budget loop, mendWallLine breach-close);
gates stay exempt — a gate opens for its owner.

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
reproducible. The same design's other half (same test): the BASE rank of each
military hall — defender / archer / rider / catapult — costs **no gold**,
so massing rough cheap troops stays a real late-game alternative to elite
quality; every upgraded rank (axeman→elite, longbow→marksman, horse archer→
lancer, ballista→trebuchet) still bills gold. Also here (same test): the
trebuchet's spotters see farther than it throws (`vision: 9` vs `rng: 8` —
per-unit `vision` overrides `CFG.UNIT_VISION` in `G.updateVisibility` and
`AI.assess`) — an engine never shells ground it can't watch.

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

**Barbarian sense** (`tests/barb-sense.mjs`): three rules that keep bands from
glitching or acting dumb. **Prey**: `Combat.raiderSeek`'s second tier is ANY
hostile land unit (`!isNaval`), not just villagers — sappers and scouts are
fair game. **Leave**: a band with nothing reachable commits to an exit march
(`u.leaving`); while it stands, the per-frame seek is skipped (only foes within
2.5 tiles get engaged), because `canReach`'s side effect (it sets `u.path` to a
best-effort route toward whatever it probed) otherwise stomps the exit route
every frame and reads as "already walking" — the bug that left bands pacing the
shoreline forever. No road off the board at all → melt away on the spot; a
units.js backstop also melts any 'R' land unit idle (no target, no path) for 8
straight seconds. **Sea**: a barbarian transport that can't land its warriors
`sailOff`s for the rim and despawns, cargo and all — it never parks with a full
hold; and the landing site comes from `Combat.pickLanding`, which scores every
beach along the sail (nearest soft building wins; +8 inside a finished
tower's/war camp's range, +2.5 per wall/gate within 3 tiles) so longboats
beach at the soft underbelly instead of the fortified gate the shortest sail
happened to end at.

**Rival crossing** (`tests/rival-crossing.mjs`): why a 400-day game ended with
the rival's whole army idle at its own gate, never bridging or landing. Three
compounding wedges. **Ghost site**: `AI.plot` had no reachability check, so
the Sappers' Camp was plotted in a sealed pocket its villagers could never
stand at — construction stayed at day-zero forever, `have.sapper` read as
owned so no second camp was tried, and with sapper tier stuck at 0 every
bridge (MUDLARK, stall-breaching) was silently disabled. Prevention: plot
candidates (and towerSpot picks) must sit in/beside `aiLandReach`;
walls/gates exempt (they sit ON the seam). Cure: the daily build-crew block
verifies the hand can STAND at the works — three days unreachable and an
unstarted site is abandoned (refunded) for re-siting; an upgrade just waits.
**Famine**: the same save sat at 0 food for months on 15k wood — the Trading
Post only ever bought gold. A chief under 250 food now sends the caravan for
FOOD first. **Killzone breach**: probeAssault's breach scorer ignored the
player's towers, so the 55hp sapper bridged into tower fire and died every
time; each candidate now pays ~10 tiles of detour per KNOWN tower covering it
(fog-honest — read from `ai.knownB` only). Together: that save goes from "26
soldiers parked forever" to a six-bridge road over the bay and 20-strong
parties attacking, within ~60 days. **Pointless breach** (a day-212 save): the
scorer also never asked whether a cut OPENS anything, so MUDLARK bridged a
one-tile inlet whose both banks were the same shore — walkable around, aimed
at a lake the corps could never cross. `AI._breachOpens` now gates every
sapper-employment site (breach scorer, stall-breacher, offensive line walk):
a cut counts only if it borders passable ground the army can't already reach,
or the lane can genuinely continue tile by tile — each further water tile
must be REALLY spannable (bridgeCrossing's land-on-opposite-sides rule, the
lane's own opened tiles counting as landings like built bridges do) or
clearable/reclaimable at tier. Open water fails: a mid-lake deck has water on
both far sides, and always will.

**Finished run & Continue** (`tests/finished-run-continue.mjs`): winning (or
losing) must never eat a manual save, and must actually retire Continue.
`Backend.finalizeRun` used to stamp the final (won) state into the ACTIVE
cloud slot — whatever slot the player last saved to — so a snapshot taken two
minutes before the win was replaced by the game-over state. It now never
touches slot state: it clears the crash net, unbinds the slot, and records
the run's seed on a local ledger (`Backend.noteFinishedSeed`/`finishedSeeds`,
deduped, capped at 50) plus the finish MOMENT (`neo-finished-at`, read via
`Backend.lastFinishAt`). The title's Continue treats a finished run as told
in ALL its snapshots — a live row whose `map_seed` is on the ledger (or
matches any row stamped `over`, for legacy saves) is passed over — AND the
finish is a hard line in time: nothing saved BEFORE it continues, not even an
unfinished other run from last week ("my game is over, New Game is my only
option"). A save written after the finish revives the button. The slots
themselves stay fully loadable from the Load screen — savescumming is the
player's right; Continue just doesn't walk back into a told story.

**Drag-to-move** (`tests/drag-move.mjs`): the second movement gesture, born of
the crowded-tile problem — with several units stacked, tapping a destination
near them lands on a bystander and (by the tap contract's own design) steals
the selection. A press that starts ON the current selection (any member of a
group; 0.6-tile hit window on the visual sprite center, same `SPRITE_LIFT`
math as taps) and drags past the 8px threshold becomes an ORDER, not a camera
pan: `UI.moveDragArm` → `UI.moveDrag` (a marching-dash gold tether + pulsing
destination ring, drawn in render.js) → `UI.commitMoveDrag` on release. The
release NEVER re-selects. Semantics are movement-first but honour intent:
enemy under the finger → attack, own transport → board, enemy building /
bridge → attack/sever, villager onto a resource → gather (dispatch deselects,
as taps do), explored ground → walk (green `UI.moveFlash` confirm pulse),
unexplored → refused. Sub-threshold presses fall through to the ordinary tap
byte-for-byte (tap-audit still rules); drags starting OFF the selection still
pan; wall/terraform line-drags keep right of way at pointerdown.

**Chase commit & ground rescue** (`tests/chase-commit.mjs`): the "attacker
stuck in the trees" glitch. The close-range straight steer (`d < 3` in
Combat's tUnit chase) fired whenever ANY micro-step toward the prey was
momentarily clear — yanking the unit off its freshly planned detour AND
nulling the path, so the next half-second repath planned the same detour
again: a perfect trap orbit at a concave treeline corner, swinging at
nobody. While a chase path is underway the steer now only takes over for the
final LUNGE (one clear step from striking range, reach + 0.5); open-field
chases are untouched (no obstacle → no path → the steer runs every frame as
before). The unreachable-prey abandon now covers 'A' as well as 'R' — the
rival's soldiers drop a lock they can't path to (player orders exempt). And
units.js carries a GROUND-TRUTH RESCUE: the world reshapes under standing
feet (stumps regrow to forest, channels flood to moats), so any land unit ON
a tile that now blocks it slides to the nearest open tile — orders intact, a
mid-march path re-planned from the new footing.

**Defend hold** (`tests/defend-hold.mjs`): Defend means the DEFENSES, not the
landscape. `Units.holdRadius` used to stretch the watch to natural barriers
(forest/water/mountain, up to `maxNatural` 14) — "the island is the fort" —
which on a tree-ringed map sent guards to hold at a treeline thirteen tiles
out, past every tower's support, where they died piecemeal. The bound is now
built from what the player raised: a FIXED per-class TC ring as base
(`CFG.GUARD.holdByClass` — barracks blades 5, bows 4, workshop engines 3; no
level scaling), with a per-class trail allowance while engaged
(`chaseByClass` — 2/1/0 tiles past the bound, then reined home; a foe that
leaves the defended ground entirely releases the lock, `Units.guardClass` /
`guardCenter.chase`). Engines are ALWAYS awake — aggro 0 keeps a
catapult/trebuchet/ballista from wandering, but standing watch (stance or no
stance) it opens fire by itself on anything inside its own weapon range, and
an unordered engine never crawls after a runner — pursuit is its escort's
job. A weaponless hull (siege tower) acquires nothing. On top of the base
ring: a
finished own tower/war camp extends the watch only along threat lanes that
genuinely pass under its arrows (along-ray distance + 70% of range, and the
battery must sit within range+1 of the ray); the own wall line is a hard
CEILING (first own finished wall/gate on the ray, walked at half-tiles) —
guards hold INSIDE and wait for the breach, and when the section falls the
ceiling lifts and the garrison meets what comes through. Enemy walls cap
nothing; unfinished towers extend nothing; naval guards keep the dock
radius. Owner-agnostic — the rival's garrison plays by the same rules. The
player who wants soldiers further out turns Defend off; that is the toggle's
meaning. (`guardCenter` now carries `owner`; `_isDefBarrier` is gone.)
**The Defend button belongs to the defended ground** (same test): a soldier
out past its bounds (hold + chase + slack, `Units.inDefendBounds`) is
attacking, not defending — the button disappears (Stop replaces it; group
panels only offer Defend to members on defended ground, and turning it on
never yanks the far half of a mixed party home). A unit already IN the
stance keeps Stand Down wherever it is. Eligibility is in `panelSig`, so the
button follows the party's feet.
**Back to your post** (same test): a defending unit remembers where it STOOD
when a fight began (`u.guardPost`, stamped at acquisition in `Combat.acquire`)
and resolves back to that exact spot after the kill or an abandoned chase —
`Units.returnToGuard` prefers the post over the generic ring point, and the
post is forgotten on arrival. The subtle half: death cleanup (`Units.damage` /
`despawn` / the plague fall) clears every attacker's `tUnit` directly, so the
combat branch's "target gone → return" NEVER fires on a kill — each cleanup
site sends defending hunters home itself, or they idle at the kill site.

**Work order** (`tests/work-order.mjs`): a line of walls or trenches must never
box the worker in, or box it out of its own remaining work — "if I do spot 2
first, I won't be able to reach spot 1, so spot 1 comes first."
`Units.pickWorkOrder` takes the NEAREST job whose completion still leaves every
other pending job workable (flood-fill from where the worker will stand, the
finished tile treated as solid) — in open ground that IS plain nearest-first
(no pointless trek); across a choke the pick falls past the cut to the far
side, then the line closes homeward. Wired into `UI.commitWallDrag` (which end
the builder starts at), the build-task continuation in units.js (which section
a freed builder walks to next — candidates within 6, but the whole line within
24 is protected), and `Units.startNextTerraform` (which queued dig a sapper
takes next). Two companions: `assignTerraform` digs standing on the side that
still connects to the town (KEEP A WAY HOME — never from the pocket between
two of its own cuts); and only all-`dig` queues are reordered — bridge/clear/
mound chains keep strict FIFO because their order MEANS something (AI breach
lanes chain landings; mounds are sorted shore-first). The load-bearing change
underneath: **a wall/gate section under construction is not solid** —
`Bld.rebuildBlock` skips it, so builders (and everyone else) walk through the
gap until the day it finishes; `Bld.finish` then invalidates `_block` and
steps anyone standing on the tile off it, ties broken toward home. Without
this, a placed line across a choke sealed its own far sections the moment it
was laid, and NO order could build it. Seal-PLANNING still treats sites as
solid (intent counts, or two half-built gaps would approve each other's
closing stone): `AI.townOut` and `Terraform.digWouldSeal` (via
`Path.reachFrom(spots, wallSitesSolid)`) both refuse based on what the line
will be, not what it is today.

**Sapper fees** (`tests/sapper-fees.mjs`): every terraform job bills PER TILE
from `CFG.TERRAFORM` (`digCost`/`bridgeCost`/`clearCost`/`moundCost`), dearer
with the tier that unlocks it (T1 dig 10 food → T3 mound 35 stone + 10 wood),
and **no fee contains gold** — a gold-poor tribe (the rival included) must
still field its engineers. The fee is checked before the work lands and paid
only when it does (units.js terraform completion): a failed job charges
nothing, a broke tribe skips the tile with a toast — never debt, never free
work. Bridges bill `bridgeCost` and nothing else — `CFG.BRIDGE.levels` prices
are upgrades only. The rival pays from `S.ai.res` (same code path). The drag
ghost (`UI.updateTerraGhost`) spends a running budget like the wall ghost, so
a half-affordable line queues half the line; single taps refuse up front with
the price in the toast; the panel tools show the per-tile fee.

**Army groups** (`tests/army-groups.mjs`): two features in one contract.
**Dense ranks** — `Units.formationMove` packs TWO units of the same kind onto
a tile (kinds never mixed on a tile; melee front, ranged behind unchanged),
so a war party lands as a block half the old footprint. **Saved armies** —
the group panel's Save banks the selection to the lowest free banner of
three (`UI.saveArmy` → `S.armies`, slot → unit ids, in every save file;
`loadJSON` backfills `{}`); Remove frees a number without renumbering the
rest, and the NEXT save fills the gap; a banner whose last soldier falls
vanishes on its own (`UI.tickArmies`, ~1s heartbeat from `UI.init`).
Banners render as pixel centurion-helmet buttons (1/2/3 helmets) on the
right rail under the minimap (`#armyBar`); tapping one centers the camera
on the army and selects it. One banner per soldier — saving units into a
new army pulls them out of any old one.

**Army strategies** (`tests/army-strategies.mjs`): three assault doctrines on
the group panel (`u.strat`, toggled by the `gstrat` buttons; tap the lit one
to stand it down; Halt and Defend clear it). **Strike** — ABSOLUTE focus: the
whole army hits the one chosen object; the tBld fight-back/mending-hand
switches are off, `Units.damage` retaliation is off, `acquire()` skips them,
and when the target falls they hold their ground and wait (assault autonomy
off — `u.assault` false on strike orders). **Chaos** (`Combat.chaosSeek`) —
attack anything within `CHAOS_R`, in order: civilians → soldiers → economy →
military halls → towers → walls → the rest. **Siege**
(`Units.siegeOrder` / `Combat.siegeGuard`) — the army splits by role: engines
(bows stand in when there are none) bombard the tapped building; the foot
line posts BETWEEN guns and target and stands its ground (`u.siegePost`);
bows/horses post behind the line; guards engage only what comes within
`SIEGE_PROTECT` of their post and walk back after (the siege leash in
`Combat.update`, plus `Units.resolveAfterFight` from the death-cleanup
sites). THE RIVAL fights under the same flags: `AI._assaultStance` at
campaign launch (engines → siege; WARHORN/MUDLARK → strike; else chaos —
which is the raid brain's normal behavior), strike columns skip every
opportunistic detour in `aiRaidSeek`, siege escorts hold beside the column's
guns, and the stance stands down when the raid ends.

**Build stages** (`tests/build-stages.mjs`): a work site moves through THREE
looks at exact 1/3 intervals of its build time (`Bld.stageOf`) — ground
broken (`misc/construction1` / `Big1`), the raising (the classic work-site
art), then the TARGET BUILDING'S OWN SPRITE wrapped in the `misc/scaffold`
(`scaffoldBig`) overlay — before the finished sprite appears. **Stage 2 must
draw the TARGET level** (`R.bldSprite(b, tgt)`, the `lv` override): during an
upgrade `b.level` is still the OLD level — it only increments in
`Bld.finishUpgrade` — so drawing `b.level` there put the pre-upgrade building
(the TC's level-1 camp) on screen AFTER stage 1 had already raised the new
hall's frame, and the sequence ran backwards. Upgrades render
the same three stages under their OWN labels (`misc/upgrade1`, `upgrade2`,
`upgradeScaffold`, `upgradeBig1`, `upgradeBig2`, `upgradeBig2_3`,
`upgradeScaffoldBig`) — the SAME canvases today (the test pins the aliasing),
so upgrade art can diverge per level later without touching the plumbing.
Wall/gate first raisings keep their translucent oriented-ghost look.
**EVERY 1×1 building now raises its own way** (same test): each has bespoke
`misc/<key>Build1/2/3` stage art at 128px on a 64-cell fine grid — render.js
routes any `b.key` with a `<key>Build1` sprite to its own three stages (the
ui.js panel icon follows), so the generic three looks above now serve only
the 2×2 hall. The house-family sequence follows real medieval build order
(staked plot + framed SILL BEAMS on footing stones → the roofless FOUR-WALL
box: wattle bays between studs under a lit wall plate, pale open floor with
ceiling joists → walls done and THATCH going on from the eaves up over a
dark rafter void), while the open yards (lumber/range/siege/sapper/trade),
the tent (warcamp), the waterworks (dock: piles driven → stringers → deck)
and the groundworks (farm: paring → ploughing → sowing; quarry: stripping →
first bench → deep cut) each tell their own trade's story, every stage
carrying the building's identity props. Upgrades alias under
`misc/<key>Up1..3` labels and may diverge per level later.
**The Watchtower has BESPOKE stage art** (same test): the first building with
its own three-sprite raising — `misc/towerBuild1/2/3` at DOUBLE resolution
(128px on a 64-cell fine grid, vs the finished tower's 32-grid), drawn from
real medieval practice: the staked plot with its foundation trench and first
plinth course; the shaft in a putlog scaffold (beams socketed into the wall)
under a rope windlass; the crown works — half-planked lookout platform,
railing, gin-pole hoist. render.js routes `b.key === 'tower'` to these for
ALL three stages (no generic look, no scaffold overlay; ui.js panel icon
follows). Tower upgrade art DIVERGES on purpose — that's what the separate
labels are for: `towerUp2/3` climb in coursed masonry with dressed quoins
(the stone tiers an upgrade builds toward) while `towerBuild2/3` climb in
wattle-and-daub matching the level-1 tower; `towerUp1` aliases `towerBuild1`.

**Burning buildings & ash** (`tests/burn-down.mjs`): a damaged building shows
its destruction in THIRDS (`Bld.burnPhase`, keyed to hp — so the fire burns
until a villager's REPAIR puts it out, the persistent "needs mending"
signal): first third lost = SMALL fires on the roof and at the foot (sprite
untouched); second third = BIG fires and the sprite scorched darker
(`R.darkOf`); final third = a partially-DESTROYED look (`R.ruinOf` — crown
bitten out adaptively until the silhouette measurably shrinks, remains
charred, rafter stubs + embers) with the fires guttering small again. The
flames are `misc/flameSmall/0..3` and `misc/flameBig/0..3` (four-frame
animated fire, opaque flame on transparent ground) drawn via
`Assets.drawSprite` in `R.drawBurn`; work sites burn by the same rule —
but a site is fragile BY DESIGN (it starts at `Bld.siteStartHp`, the single
source of truth shared with `place()`), so burn on a site is measured
against what it was GIVEN, never against finished hp: an untouched
construction site must NEVER show fire.
Variants cache per base canvas in a WeakMap, so building levels, the rival's
red set and wall/gate auto-tile masks all get scorched/ruined selves for
free — but beware `destination-out` with a translucent fillStyle: it only
thins alpha, it does not erase (the eraser must be full-alpha `#000`). A
DESTROYED building leaves an ASH PILE (`S.ashes`: `{x,y,sz,key,lv,day}`,
in every save, `loadJSON` backfills) rendered by `R.ashOf` — generated from
the building's own sprite silhouette (column mass → heap profile), so each
building's ash is unique. Ash blocks BUILDING on the footprint (`Bld.tileFree`
/ `canPlace` → "Ashes still smoulder here") but never movement, for
`CFG.ASH_DAYS` (5), then cools away in `G.dayTick`. Walls/gates are exempt —
a breached line must stay instantly mendable (`AI.mendWallLine` and player
repairs depend on it) — and a broken dock washes into open water as before.

**Boats on moats + Scuttle** (`tests/boats-moat-scuttle.mjs`): a MOAT is open
water to a HULL — the water-domain branch of `Path.passable` accepts it like
lake water, friend and foe alike (the tradeoff of digging one). It still
blocks land, bridges still carry land over it, ranged fire still crosses.
And every own hull carries a two-tap Scuttle (demolish's confirm pattern,
sharing `UI.confirmDemolish` — unit and building ids never collide): the ship
sinks, NOTHING is refunded, its place in the population is freed
(`Units.despawn` → `popUsed` drops). A transport with soldiers aboard refuses
to scuttle — unload first, never send the crew down with the ship.
