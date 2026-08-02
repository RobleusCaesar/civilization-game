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
node tests/bridge-resource-shore.mjs # a resource-shored bank is bridgeable; no silent failures; reinforcing takes days and a sapper
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
node tests/wall-tower-bond.mjs # L2 forts are half stone/half timber; an in-line tower joins the curtain
node tests/buildings-block.mjs # every building is solid ground except the worker plots
node tests/ore-finite.mjs      # felled woods and spent soil grow back; a quarried seam never does
node tests/fishery.mjs         # shore shoals are half-stocked, deep water three quarters; both return in 120 days
node tests/wild-life.mjs       # wolves stalk deer, herds bolt as one, birds scatter; banners fly in the tribe's dye
node tests/wonder.mjs          # the second way to win: one of ten 3×3 monuments, and the rival comes running
node tests/gold-mine.mjs       # gold seams are found, claimed, worked and held — and the seam outlives the mine
node tests/raider-camps.mjs    # barbarian camps are standing, tended, burnable ground — the wild country has owners
node tests/mortality.mjs       # a villager dies every so often, of something apt — and their post is left empty
node tests/drawbridge.mjs      # a Lv3 gate's bridge on chains: raised, the gate is a WALL — to its owner too
node tests/tc-upgrade.mjs      # the hall rises on the town's shoulders — 3 buildings at its own level
```

**Wall line** (`tests/wall-line.mjs`, details in `RIVAL_AI.md`): the rival's
perimeter line may only be MADE of `wall` and `gate` — it never counts an
ordinary building as a section of its ring. (Movement is a separate rule and
has changed: every building except the worker plots now blocks — see
**Buildings are solid** below. A *farm* in the ring is still a door; a house
no longer is.) Covers
`AI.plot` / `towerSpot` / `wallCenter` / `wallAudit` / `wallDetour` /
`wallRelocate` / `mendWallLine` / `maybeWalls` / `playerLanes` / `foeSoftDoors`,
`Bld.tileFree` / `canPlace` / `blockAt`, and `Path.passable`. `AI.WALL_R` is the
single source of truth for where the line runs — never hard-code the radius.
**A SHOOTING GALLERY IS NOT A BUILDING SITE** (`AI.inGallery` /
`galleryMask`, same test): a real day-146 game had the player park two
catapults on the far bank of a channel and shell the rival's shoreline tower —
the chief rebuilt it TWELVE times in seventeen days, because `towerSpot` scores
a site on what it COVERS and knew nothing about who could shoot it, and its own
"reinforce the flank the player keeps hitting" bias steered it back to the
shore every time. Ground the chief's own hands cannot walk to that an enemy CAN
stand on is a gun position; anything of ours within a throw of one is a
gallery. Not a read of hidden state — it is the lie of the land beside its own
town. The radius is DERIVED (`AI.galleryR` = `catapult.rng` + 1), never
hand-picked; the trebuchet reaches further and is deliberately NOT the bound,
because an 8-tile exclusion round every unreachable bank makes a narrow map
unbuildable. A tower is a hard REFUSAL (raising none today costs nothing —
`plot` returning null spends no resources); an ordinary building takes a
scoring penalty in `layout`, since a town backed against an unreachable bank
still has to be built somewhere. The mask is cached per day and per
`Bld._blockGen`. **`towerSpot` also gained `plot`'s own reachability rule** —
without it, tightening the clamps let the scan offer a shoreline across the
water that no villager could ever stand on to build.
**And we do not rebuild into our own ashes** (`AI.noteLoss` / `burnedGround`,
same test): the general backstop for whatever the gallery rule cannot measure
(a trebuchet outranging it, a warship's deck, a lane the reach flood happens to
include). Every destroyed rival building stamps its tile from `Bld.damage`, so
nothing has to remember to call it; `LOST_N` (2) losses in a 3×3 and the ground
is refused for `LOST_DAYS` (70), after which the front has moved and it is
ordinary ground again. `ai.lostAt` rides in the save.
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
**And a span is built ACROSS the water, never along it** (same test): the work
site used to draw one fixed pattern of slats whatever way the crossing ran, so
a north-south bridge went up as a raft of planks floating sideways on the
channel. The active-sapper overlay now reads `Terraform.bridgeCrossing` — the
same call that decides `br.dir` when the deck lands — and builds the way a real
one does: two stringers thrown bank to bank, then the decking planked over them
from the near shore out as the work proceeds.
**Reinforcing a span is a BUILD, not a purchase** (same test): levels 2 and 3
used to be instant — pay, and the timber crossing was a stone arch the same
frame. They now work like every other upgrade in the game.
`Bld.orderBridgeUpgrade` takes the stone up front and stands WORKS on the
bridge for `CFG.BRIDGE.levels[lv].time` days (2 then 3, the Watchtower's stone
tiers), and a SAPPER has to be at them the whole time — the same hands that
raised the level-1 crossing (`'bridgeup'`, a fifth terraform job; the nearest
idle sapper is dispatched automatically, `Units.nearestIdleSapper`, exactly as
a laid building site pulls the nearest idle villager, and tapping the works
with any sapper selected puts it on the job — no tool to arm, since the bridge
already says what the work is). **The clock lives on the BRIDGE**
(`br.upgrading`/`upTotal`/`upTo`, in every save, `loadJSON` backfills), never
on the sapper's task: progress therefore survives the sapper being cut down at
the waterline, and a second sapper genuinely halves the work — the same
convention builders use. It counts DAYS, not the seconds every other terraform
job runs on. The span stays crossable throughout; this is a re-facing, not a
rebuild. Two render notes: the bridge loop draws the works itself (pale
dressed blocks along the deck and straw lashings over the rails — anything in
the deck's own brown reads as a HOLE in the planking at 32px) plus the gold
build bar, and `'bridgeup'` needs its own branch in the active-sapper worksite
overlay or the generic TURNED-SOIL patch digs a pit of dark earth in the middle
of a plank deck.

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

**Nothing is worked in the BLACK** (`tests/sapper-fees.mjs`): the map's
outermost ring is its hard border — off-map void, impassable, unbuildable,
unfishable — and that rule had been spelled out BY HAND in five places
(`Path.passable`, `Bld.tileFree`, `Bld.dockSiteOk`, `Units.fishableTile`,
`MapGen.shoal`). The sapper's four tools were not among them, so a trench or a
mound could be queued out in the void: marks drawn on the black, for work no
hand could ever reach. **`MapGen.onBoard` is now the single declaration** and
every one of those callers asks it. The trap it closes: `MapGen.inB` is only
"inside the array" and INCLUDES the rim, so `inB` is never the right question
for "may this tile be used". The drag ghost is what actually lays a mark
(`UI.updateTerraGhost` → `Units.canTerraform` → the four predicates), so the
test measures it end to end — order refused, ghost marks nothing, queue holds
only the real tile — and pins that row 1 is still real, workable ground.

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
Banners render as pixel buttons (1/2/3 marks) on the
right rail under the minimap (`#armyBar`); tapping one selects the army.
**The camera only moves when the army is nowhere to be seen** — `R.onScreen`
tests each member's sprite box against the visible band, discounting what the
HUD covers (`topReserve` / `bottomReserve`), so one soldier half off the edge
still counts and the view is left alone; yanking it to re-centre on soldiers
the player is already looking at loses their place for nothing.
**The LAST OF AN ARMY can still strike its banner** (same test): a party
ground down to one soldier keeps its number, but a one-member group renders as
the UNIT panel (`renderPanel` collapses it) — which had no army button on it at
all, so tapping the banner gave a panel with no way to free the number. The
unit panel now carries Remove when that soldier IS the whole of a saved army
(`UI.armyOfUnit`, carried in `panelSig` so it appears and vanishes in place) —
and pointedly NOT for one member of a larger one, where disbanding the lot from
one man's panel would be a surprise.
**A banner whose roster mostly FLOATS flies a SHIP** (`UI.armyIsNaval` — most,
not all, so a scout tagging along with a fleet doesn't turn it back into an
army): `UI.ARMY_SHIP`, the same 21×28 footprint and dulled palette as
`ARMY_HELM`, square sail on its yard, masthead pennant, shielded gunwale, and
water under the keel. One banner per soldier — saving units into a
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

**A living world** (`tests/wild-life.mjs`): four things that make the map look
inhabited, plus the panel line that makes a unit's work legible.
**Predator and prey** — `Combat.hostileUnits` lets a wolf or bear hunt deer
and wild cattle: the ONLY case where two same-owner (`'W'`) units are
hostile, and deliberately ONE-WAY, since prey never fights back. In
`Combat.acquire` a wolf takes people first and, with none in reach, ranges
`aggro × 2.5` after game — so a pack is seen working the treeline long before
it threatens a village. **The herd bolts together** (`Units.grazeIdle`):
grazers keep company and PANIC SPREADS — the
animal that actually sees the threat spooks every herd-mate within `HERD_R`, so
the group scatters as one. Beasts and armed strangers frighten them;
villagers don't, or a herd would never settle near a town.
**And the herd BREATHES** (same test): real cattle and deer draw in close, fan
out over the feed and gather again — they never converge on a point and never
string out into a line. So every step is measured from the HERD'S CENTRE (never
the animal's own feet, which lets the lead animal walk away from its band and
off the map): each grazer keeps its own slowly-drifting BEARING and steps to a
radius swinging between `HERD_TIGHT` and `HERD_LOOSE` on one clock shared by
every animal on the map (`Units.herdClock`, advanced in `Units.update` so it
ticks under a test harness that drives units directly, not off `S.day`). The
oldest animal in company leads: it takes the leading edge `HERD_DRIFT` past the
ring and the centre is dragged after it — that, and only that, is what walks a
herd across a field. Company reaches further than panic does (`HERD_R * 1.8`)
because the ring's own width would otherwise drop the far side of the herd out
of its own band, and a separated animal walks back (`HERD_JOIN`) instead of
roaming for good. Grazers arrive as a BAND — `Units.spawnHerd` puts down 3–5
head at once and `CFG.PASSIVE_MAX` is the map's whole standing stock — because
a herd of one has nothing to breathe with.
**Four frames is the floor** (same test): every beast pose — `idle`, `walk`,
`fight` — is a 4+ frame cycle driven by a CONTINUOUS phase in `sprites.js`'s
`beast()` (legs travel through swing and stance, the barrel bobs twice a
stride, the head nods, the tail swishes, grazers put their heads down in the
grass and chew), never a two-still flip. Counts live in `BEAST_POSE` and the
playback rate per kind in `Sprites.animFps`, which `R.unitSprite` reads so a
longer cycle still reads as one stride; both can be raised without touching the
drawing code. **The sky reacts**
(`R.startle`): a fight breaking out (`R.noteFights` spots a unit gaining a
target it didn't have — one scatter per outbreak, not per blow) or a building
coming down throws flocks up and away and sends critters bolting for cover.
`R._fighting` is render-side only, so it never reaches a save. **Banners fly
and hearths smoke**: only the POLES are baked into building sprites — the
cloth is drawn every frame by `R.drawBanners` from `R.BANNER_AT` anchors, in
the tribe's own tunic dye (`Sprites.tunicCol`), so a purple village flies
purple rather than the blue the sprite set is built in; `R.drawHearthSmoke`
breathes a drifting column from homes and halls (`R.SMOKE_AT`). Neither
shows over a work site, and a building already ablaze skips the hearth smoke.
**The work tick is a GLANCE, not a readout** (`R.workFloat`, `R.WORK_FLOAT_S`):
the white `+wood` over a worker's head exists so you can read the village at
sight without selecting anybody. It used to roll for a float on every gather
step and every production step — about one every 4 seconds per worker, and
worse the faster the game ran — which wrote text over the whole town. Every
`+res` now goes through `R.workFloat`, throttled per UNIT to one tick every
`WORK_FLOAT_S` (20s, jittered off the unit id so a row of woodcutters never
pulses in lockstep): about a fifth of the old rate, so ten workers still write
something every couple of seconds somewhere while no single villager chatters.
REAL time, not game days — the same reasoning as the heal limit, since this is
a rule about what the eye can take. A MISSING entry means "due now", never
"last ticked at time zero", or the first tick of every worker is eaten for the
first 20 seconds of a session. The log is render-side only (`R._workFloatAt`,
cleared in `R.onNewGame`), never on the unit and never in a save.
**The live work line** (`Units.workReport` → `UI.workLine`, the `#pWork`
element patched in place by `refreshPanel`): what a unit is doing and what it
nets per day, computed from the SAME constants the gather/production code
applies — mode multiplier, origin cards, the station's terrain bonus, the
level-3 hall boost — so an upgraded Lumber Camp visibly pays more. A unit
still walking to its job reports no income, because it isn't earning any.

**Ore is finite** (`tests/ore-finite.mjs`): `CFG.REGROW_TO` is the single
source of truth for what worked-out land turns back into — `STUMPS→FOREST`
and `BARREN→FERTILE`, and NOTHING else. Living things recover at a lean
`REGROW_FRACTION` stock so wood and food can always be ground back; a
quarried seam (`PEBBLES`) never does, which makes STONE the one genuinely
finite resource on the map and leaves the late game leaning on the Trading
Post for it. `G.scheduleRevert` refuses to even put a non-regrowing tile on
the clock (ruins excepted — rubble fading to grass is cleanup, not
regrowth), so legacy saves carrying a pending ore entry simply drop it and
keep the scar. The rule is invisible for 120+ in-game days, so it can only
be caught by the test, never by playing.

**The fishery** (`tests/fishery.mjs`): fish renew on a CLOCK, not by terrain
regrowth — the water never changes, only what swims in it, so they sit
outside `REGROW_TO` entirely. Two rules. **The split** (`CFG.FISH_STOCK`): a
water tile TOUCHING LAND is a shore shoal and carries half the raw stock;
open deep water carries three quarters — so rowing out beats paddling at the
edge. Shallow uses the same "touches a non-water tile" rule the renderer
shades its shallows with (`MapGen.shallowWater`), so the lean water is the
water that LOOKS lean; it is applied at generation (map.js) and again on
every restock. A food-scarce map's ×0.5 on water still applies UNDER this,
so the split is measured on top of that lean — the test accounts for it.
**One boat per tile**: the fish task pins a boat ON its tile while it works,
so two boats sent to the same water sat hull-in-hull — you could not count
your fleet or pick one out to order. `Units.fisherAt` treats a tile as
claimed by the boat working it, one on its way, or any idle hull parked on
it; `canFish(x, y, except)` excludes claimed water (the claimant itself
passes, so re-ordering a boat to its own tile is a no-op); and `assignFish`
SLIDES to the nearest free shoal rather than refusing, so ordering a whole
fleet at one spot fans it out. Unfishable water still fails as before — the
slide is only for the claim. **The return** (`CFG.FISH_RETURN_DAYS`, 120): a tile fished to nothing by
either path (boat or shore line) goes on `S.map.fishBack` (idx → day, in
every save, `loadJSON` backfills) and `G.dayTick` restocks it at
`G.fishStockAt` — its own water's worth, not a flat number. Water a sapper
filled in just drops off the clock.

**Buildings are solid** (`tests/buildings-block.mjs`): a building is ground
you walk AROUND — for every owner. `Bld.solid(key)` is true for everything
except the WORKER PLOTS (`farm`, `lodge`, `lumber`, `quarry`, `mine`), and the
exception is not a taste call: their crews stand ON the plot (the `work` task
walks the villager onto `b.x/b.y` and holds it there), so a solid plot could
never be worked. The rule therefore keys off `needsWorker` — the exception
and its reason are the same fact, and the Hunter's Lodge is in the set for
exactly that mechanical reason (the Gold Mine joined it for free). `Bld.rebuildBlock` marks code **4** across
the WHOLE footprint (the 2×2 hall included) and `Path.passable` refuses it
owner-agnostically: you walk around your own hall, around the rival's, and so
do barbarians and wild animals (which needed no new code — they already move
through `Path.passable`). Consequences that have each already bitten:
`Bld.fortAt` (codes 1–3) is what the wall auto-tiling asks, so a house never
makes a curtain grow a stub toward it; a site is NOT solid while raising
(builders must reach the far side of a line) and `Bld.finish` steps anyone
off the footprint the day it completes, with the units.js ground-truth rescue
as the backstop; **"can I still get home?" checks must target the hall's
DOORSTEP** (`Units.homeSteps`), never its own tile, or they answer no forever
(this silently broke `assignTerraform`'s keep-a-way-home rule); docks never
block hulls (the water domain is decided before buildings); ash blocks
building but never movement. On the rival's side a hut can now cork a town
exactly as stone can, so `AI.plot` takes the wall line's own seal clamps
(behind a cheap pinch prefilter — a tile with 3+ open orthogonal neighbours
can always be walked around), `AI._reachA`/`corkedGround` reckon with every
own solid work rather than only wall/gate, `AI.cutTheCork` may raze a hut
when a hut is the cork (stone strongly preferred), and `AI.foeSoftDoors`
only counts walkable plots — planning a lane through a house would march the
host into a wall.

**Wall/tower materials & the bond** (`tests/wall-tower-bond.mjs`): two rules
about how a castle reads. **Materials** — every level-2 building steps to
"stone below, timber above", and forts now do too: `wallPal(2)` is a stone
curtain carrying a TIMBER WALL-WALK (planks down the middle third of every
arm, stone parapet showing on both flanks — the `timber` flag in
`drawWallMask`), and the level-2 Watchtower is a coursed stone base under a
timber upper storey divided by a corbelled string-course (a `tier === 2`
branch in the tower draw, NOT `bWall`, whose tier-2 dress is a mere two-row
footing). Both land near 50/50; L1 (palisade/wattle) and L3 (dressed stone,
gold crest) are deliberately untouched, and each tier must remain a visible
step. **The bond** — a tower raised IN a wall line joins it (corners,
T-junctions, mid-run), so the curtain reads unbroken like a real castle's
mural towers; a tower merely BEHIND or IN FRONT of a line must not.
`R.towerLinkMask` decides: link toward a neighbouring wall/gate when the run
continues on the tower's far side, or the tower sits mid-line, or that
neighbour is a lone stub with no run of its own. It reads walls and gates
ONLY (never other towers), so it can never recurse; `R.wallMaskAt` calls it
to reciprocate, and `R.drawTowerBond` draws the curtain's own mask art UNDER
the tower. Unfinished towers bond to nothing. The bond decides only where stubs are
DRAWN; whether anyone may walk there is `Bld.solid` (**Buildings are solid**,
below), and the two now agree — a bonded tower really does seal the line.
Keep them independent rules: an off-line tower blocks its own tile without
ever drawing a stub.
**The curtain through a gate IS the wall** (same test): each tier used to
hand-draw its own version of the band crossing the gate's tile, and they
drifted — the crenellation stopped dead at the gate and started again the far
side, the timber walk stepped a row as it crossed, and every gate wore a visible
seam on both flanks. `drawGate` now STAMPS the real wall sprite for a straight
run (`E|W` under a face, `N|S` under a flank) and builds the gate on top, so the
match is structural: change `drawWallMask` and all six gate drawings follow it
for free. **`Sprites.wallMask` is therefore built BEFORE the building loop** —
`B_DRAW.gate` reads it, and built after it would be `undefined`. No gate drawing
may redraw the band; the test measures the outermost COLUMN of the gate's tile
(the seam itself, where it butts the wall next door) as pixel-identical, and the
flank's northern strip as the wall plus exactly the shadow that reads as the
walk passing behind the block.

**Three gates, three ages** (same test): a gatehouse is the clearest read the
player has on how far the tribe has come, so the tiers are three DIFFERENT
STRUCTURES rather than one castle in three stones. **L1** (`gateFaceT1` /
`gateSideT1`) is a PALISADE GATE — two stout posts driven either side of a gap,
a lintel across them, a braced plank door hung between, rope lashings; no
turrets, no battlements, no portcullis, because nobody in a stockade has any of
those. Its only "iron" is `WD[0]`, the darkest wood, since real iron at this
size reads as masonry. **L2** (`gateFaceT2` / `gateSideT2`) is a STONE ARCHWAY
with a timber door in it — squared piers, a round arch of voussoirs, flat
coping, and the same planked wall-walk down the curtain that the L2 wall
carries (which is also what keeps it half-and-half rather than a slab of
masonry). Still not a castle: nothing rises out of the line, no machicolation,
no crenels. **L3** (`gateFaceT3`) is the original full gatehouse — flanking
turrets, machicolated gallery, portcullis, and the drawbridge, which is L3-only
and therefore untouched by any of this. All three still carry the curtain at
rows 10..21 and stand on the tile's front edge (row 30).
**The flank test measures TRANSPOSITION, not darkness** (same test): the old
check was "the face's passage is dark and the flank's is not", which only held
while every tier had an open archway — the L1 and L2 gateways are CLOSED with a
timber door and have no dark hole at all, so it failed on art that was perfectly
correct. The rule it stood for is measured directly now: the flank must be
nothing like the face turned on its side. L3 keeps a check that its passage
genuinely stands open; L1 and L2 get one that theirs is genuinely timber.

**The gatehouse, and where you are standing** (same test): this game draws
terrain from above but BUILDINGS FACE YOU — a tower is an elevation with a door
at its foot. A fortification obeys the same rule, so a gate has TWO DIFFERENT
DRAWINGS, not one drawing rotated. Across an **east-west** wall you are looking
straight at the castle (`drawGateFace`): the curtain runs the WHOLE WIDTH of
the tile at its own height with its own merlons, two turrets rise OUT of that
line (carrying down past it to the ground, as a mural tower does), and the gate
stretches BETWEEN them — machicolated gallery, round arch, portcullis backlit
from the passage beyond, timber threshold. Drawn the other way round — a
gatehouse block carrying turrets of its own, parked on the line — the turrets
read as standing IN FRONT of the wall instead of being part of it. Along a **north-south**
wall you see the gatehouse's FLANK (`drawGateSide`): the archway faces east and
west, AWAY from you, so there is no door to see — the curtain simply swells to
the width of a tower, crenellated and machicolated like everything else.
Transposing one into the other (which this file did for one commit) draws a
gateway seen from a viewpoint that cannot exist, and reads as a door lying on
its side. Both stand on the SAME ground line as the mural tower — the FRONT EDGE OF THE
TILE (fine row 30). Every fortification faces you, so its foot is the nearest
thing in its tile: stopped short, a tower reads as hovering above the walk that
runs past it, and a gate between two towers floats above its own neighbours; both are
drawn at high res like every other building (only `wall` is left in
`LORES_BLD`, whose 16-mask atlas must tile seamlessly); and the curtain meets
them at fine rows 10..21, exactly where `drawWallMask` puts its arms (5..10 of
16) — change one and you must change the other. At L2 the whole upper works
(crenels, machicolation gallery, hoarding) are TIMBER, which is what keeps the
gatehouse as half-and-half as the curtain it stands in. At L3 each tower flies
a standard in the tribe's dye (`R.BANNER_AT.gate` / `.gateV` — move a pole and
you must move its anchor).
**A vertical run is a wall too** (same test, `drawWallMask`): a
north-south run now carries MERLONS DOWN BOTH FLANKS (and flanking stakes at
L1). Looking along a wall you see its two parapets with the walk between them;
without them a vertical run was a plain strip with no castle in it, and every
tower and gatehouse standing in that line read as a building from a different
game.
**A tower has two selves** (same test): a tower with a wall built onto it is
not a building standing next to a wall — it is a THICKER, TALLER PIECE OF THE
WALL, same stone, no outline of its own, no door in its foot, the wall-walk
running into its flanks. That is what the free-standing Watchtower sprite can
never be: its outline, its drop shadow and its doorway are exactly what read as
"a separate building parked on the line". So a tower has a second drawing
(`drawTowerMural` → `Sprites.towerMural`), and `R.bldSprite` hands it back
whenever `R.towerLinkMask` says the tower is bonded into a line — mid-run,
corner or T alike. Alone in open ground it stays the Watchtower, because a lone
scout tower should still read as a building; a work SITE keeps the ordinary
sprite too, since what is being raised is the building, not the bond. It wears
`gateDress` like the curtain and the gatehouse (L1 timber, L2 stone under
timber upper works, L3 dressed stone, gold crest, beacon lit), is narrower than
the gatehouse (16 fine cells against 20) so the gate stays the biggest thing on
the wall, wider than the curtain (12) so it still reads as a tower, and stands
on the same ground line as both — the tile's front edge, so it is planted on
the ground rather than perched on the curtain that passes it.
**Where the walk meets it** (`R.drawTowerWalk`, `R.TOWER_WALK`): a curtain
running SOUTH out of a mural tower must join its flank at WALK HEIGHT, partway
up the shaft. The tower's body is drawn over the bond stub, so the southern arm
only reappeared below the tower's foot — and a wall leaving at the foot reads
as bolted onto the bottom of the tower. The south arm is now drawn AGAIN on top
of the tower, clipped to the curtain's own width and to everything below
`TOWER_WALK`; the gatehouse flank brings its own southern walk out at the same
height. North is the opposite case (it passes behind — see the seam), and
east/west already leave at the right height because the wall band crosses the
tower's middle.
**The seam** (`R.drawTowerBond`): a tower is an elevation, the curtain north of
it is drawn flat from above; butted together with nothing between, the wall
reads as running ONTO the tower's roof ("the top tower is sitting on top of the
wall"). A shadow line where the walk meets the tower's back reads instead as
the wall passing BEHIND it. Only the NORTH link needs it — a wall to the south
is nearer and is drawn over the tower anyway, since the building list is sorted
by footprint bottom edge.
**Which way a gate faces** (`R.gateVerticalAt`, same test): the way its LINE
runs — and the line is made of TOWERS as well as walls. The old wall-only test
read a tower/gate/tower gatehouse as neither axis and drew its east-west self
inside a north-south curtain: the "I tore down a wall, built a second gate,
and it never went back" bug. Bonded towers now count and the axes are SCORED
rather than compared as booleans, so one wall to the east cannot outvote two
towers north and south. Terrain deliberately does NOT vote: a curtain running
east-west to a lake shore has water north and south of its gate, and counting
it would face the gate exactly the wrong way.
**The owner pip** (`R.draw`): every building wears a 4px owner tag at its
top-left — but a fortification's tile is bare ground there (the curtain runs
down the MIDDLE), so the pip floated out on the grass beside the wall like a
UI glitch, one per section the whole length of the line. Walls and gates share
one faction-less atlas, so it cannot simply be dropped either — it is their
only owner cue. It now marks only the RIVAL's stonework, and sits ON it:
nobody else builds walls, so an unmarked curtain is yours by elimination, and
your own castle reads clean.

**Burning buildings & ash** (`tests/burn-down.mjs`): a damaged building shows
how far gone it is (`Bld.burnPhase`, keyed to hp — so the fire burns
until a villager's REPAIR puts it out, the persistent "needs mending"
signal): first third lost = SMALL fires on the roof and at the foot (sprite
untouched); badly hurt = BIG fires and the sprite scorched darker
(`R.darkOf`); the last `CFG.RUIN_AT` (0.9) of the hp bar = a
partially-DESTROYED look (`R.ruinOf` — crown
bitten out adaptively until the silhouette measurably shrinks, remains
charred, rafter stubs + embers) with the fires guttering small again.
**The ruined look waits deliberately late**: it is the LAST thing a building
shows before it falls, so it belongs to the final tenth, not the final third
— held at a third, a building spent most of a long fight already looking
ruined and the moment it actually came down read as nothing happening.
`CFG.RUIN_AT` is the single source of truth; never hard-code the fraction. The
flames are `misc/flameSmall/0..3` and `misc/flameBig/0..3` (four-frame
animated fire, opaque flame on transparent ground) drawn via
`Assets.drawSprite` in `R.drawBurn`. **A TOWER IS THE EXCEPTION** — stone
has almost nothing in it to burn, so `R.drawTowerCrumble` takes over for
`b.key === 'tower'`: SMALL fires only at every phase (never the big roof
blaze), and the real signal is masonry spalling off the shaft's EDGES and
falling clear of it (a grey stone dropping down a grey wall is invisible —
and real spalling sheds away from the face anyway), alternating sides, each
chip on its own falling cycle seeded from the building id so it is stable
per tower rather than jittering every frame, with dust where it tears loose
and where it lands, and a rubble heap at the foot that grows each third.
The sprite phases underneath (scorched → part-destroyed) are unchanged.
Work sites burn by the same rule —
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
**And a TOWER TOPPLES when it dies** (same test): burning is the long signal,
the COLLAPSE is the payoff for the minute of work it took to chew through a
stone shaft. `R.COLLAPSE` is a registry keyed by building key — putting a key
in it is the WHOLE extension point, and only `tower` is in it today (walls,
gates and every other building come down exactly as they always did). Frames
are CUT FROM THE BUILDING'S OWN SPRITE by `R.collapseSheet` — the block above
the break line sweeps ~90° about it and slides down so it finishes lying ON
the ground, the stump crumbles after it, masonry flies clear, dust rolls out
along the ground and hangs over the rubble — so every level, the rival's red
set and the mural tower's bonded self all collapse for free, cached per base
canvas in a WeakMap. A kind that wants HAND-DRAWN art instead just labels it
`misc/<key>Fall1..N` (`R.collapseArt`), the same convention as the build
stages; both are drawn over `R.COLLAPSE_PAD`'s roomier-than-the-tile canvas,
the single source of truth for that geometry. `R.startCollapse` fires from
`Bld.damage`'s destroy branch — BEFORE `removeToRuin`, because the animation
snapshots the building's sprite and a mural tower's sprite depends on wall
neighbours that are still standing — and NOT from `demolish`, which is a
teardown, not a kill. **Nor from a WORK SITE** (`b.construction > 0`): the
frames are cut from the building's own sprite and a site's sprite is the
FINISHED tower, so knocking down a half-raised shaft played its life story
backwards in one second — staked plot, scaffold, a whole finished tower, then
the whole thing falling over. A site just stops being a site and leaves its
rubble like every other unfinished building; an UPGRADING tower is a standing
tower in scaffolding and still comes down. The live one-shots sit on `R.collapses` and never in
`S` (same rule as `R._fighting`); the ash pile the tower leaves is held off
screen while its topple plays (`R.collapseAt`), or the ending is given away a
second early. **The GROUND is held back for the same reason**
(`R.startCollapse` snapshots the footprint out of the terrain cache,
`R.drawCollapseGround` stamps it straight after the terrain layer each frame):
`Bld.removeToRuin` lays rubble the instant the building dies and bakes it into
the cache, so the brown scar appeared UNDER a tower that was still standing.
The rubble is real in STATE throughout — only the picture waits — which is why
`startCollapse` must keep running BEFORE `removeToRuin`, and why the snapshot
rides on the one-shot rather than in `S`. Drawn after the units, so the dust rolls over whoever knocked it
down. Two traps this cost: `TL` is a per-function local everywhere in
render.js (a method that forgets `const TL = CFG.TILE` throws every frame),
and `Sprites` is a script-level `const`, so `window.Sprites` is undefined —
reference it directly.

**Boats on moats + Scuttle** (`tests/boats-moat-scuttle.mjs`): a MOAT is open
water to a HULL — the water-domain branch of `Path.passable` accepts it like
lake water, friend and foe alike (the tradeoff of digging one). It still
blocks land, bridges still carry land over it, ranged fire still crosses.
And every own hull carries a two-tap Scuttle (demolish's confirm pattern,
sharing `UI.confirmDemolish` — unit and building ids never collide): the ship
sinks, NOTHING is refunded, its place in the population is freed
(`Units.despawn` → `popUsed` drops). A transport with soldiers aboard refuses
to scuttle — unload first, never send the crew down with the ship.

**The Ancient Wonder** (`tests/wonder.mjs`): the SECOND way to win, and the
only one that isn't a war — raise the monument and the run is yours. **Ten**
monuments live in `CFG.WONDERS` with a drawing each in `Sprites.wonders`; ONE
is rolled per run by `G.rollWonder`, hashed off the SEED STRING and **never
off `S.rngState`** — a draw from the run's own RNG would shift every roll after
it and re-deal a seed's cards. `G.setWonder` then points the single `wonder`
building key at it (name, blurb, artwork via `Sprites.useWonder`), so the build
menu, the panel, `R.bldSprite`, the burn variants and the ash silhouette all
find it exactly where they find every other building's art, with no special
case. **3×3 — the only one in the game** (the hall is 2×2, everything else
1×1); 15,000 each of food/wood/stone plus 4,000 gold, and 45 days to raise,
over four times the level-3 hall. **Last in `UI.MENU_KEYS`**, because it is the
end of the game. **Calm alone SHOWS the button** (`CFG.MODES[m].wonderMenu`,
read by `UI.wonderOffered`) — the RULES work on every difficulty, nothing in
Bld/AI/G asks what mode you are in, so flipping the flag is the whole change
needed to offer it elsewhere. Its art is authored at **192px on a 96-cell
grid** (`tileW`), which is the same one-cell-per-screen-pixel density every
other building has, over nine times the area; megaliths wear the warm
weathered `rock` ramp and dressed masonry the cool `stone` ramp, and every
monument stands on the tile's front edge (`WGY`, fine row 84 of 96) like the
fortifications do. The **work site** gets two shared raising stages
(`misc/wonderBuild1/2` — every wonder is raised by the same masons) and then
the MONUMENT'S OWN ART under `misc/wonderScaffold` for the last third, so a
45-day build is not 45 days of looking at a building site.
**A wonder cannot be built in secret** (same test): `Bld.place` reveals it to
the other side the day the ground is broken and sets `S.ai.wonderAlarm`;
`AI.wonderWatch` → `stormTheWonder` then throws every soldier within
`CFG.WONDER.alarmR` at the works — before the day's spending, so the alarm can
never be crowded out by a spent macro-action budget — and `Combat.aiRaidSeek`
carries a top-priority branch that puts a raider on the works over any other
target once it is within reach (placed AFTER "engage what's in our face", so
the column still defends itself). A site starts at `Bld.siteStartHp` like any
other, so it CAN be broken: holding the ground is the price of the peaceful
victory. The rival may raise one too — never before `CFG.WONDER.aiDay` (350),
via `AI.maybeWonder`/`plotWonder`, which takes `AI.plot`'s reachability and
wall-line clamps across the whole 3×3 footprint.
**The marvel** (same test): finishing it does NOT snap to a score screen.
`G.wonderRaised` pauses the world, settles the camera on the monument and
holds the frame for `CFG.WONDER.marvelMs` (7s) with the monument's name across
the bottom (`R.drawMarvel`), and only then calls the run. The caption measures
`#topbar`/`#bottombar` itself — `R.topReserve`/`bottomReserve` are learned
lazily elsewhere and are still 0 in a fresh session, which draws the caption
underneath the build menu where nobody sees it. A finished wonder keeps a slow
golden radiance and drifting motes for the rest of the run (`R.drawWonderShine`).
`R.marvel` and `G._marvel` are render/flow state and NEVER reach a save (same
rule as `R._fighting`); `S.wonder` does, and legacy saves backfill it from
their own seed. The rival finishing one simply ends the run — no held frame,
the defeat scene has its own staging.
**Two traps this cost, both the same trap**: `G` and `Sprites` are script-level
`const`s, so `window.G` and `window.Sprites` are **undefined** — only `R`,
`Assets`, `Cards`, `Backend`, `Screens`, `Terraform`, `Score`, `Defeat` and
`VictoryArt` are actually put on `window`. A `window.G &&` guard silently
disables whatever it guards.

**The seam is CLAIMED, not built** (`tests/gold-mine.mjs`): the Gold Mine has
no button in the build menu (`CFG.BUILDINGS.mine.noMenu`, and `UI.buildMenu`
skips any `noMenu` key so the flag and `MENU_KEYS` cannot disagree). You walk a
villager out to a seam and the works go up around them for NOTHING — the price
is the journey and holding the ground. `Units.assignMine` sets a `'claim'`
task; the works are raised only when a hand actually ARRIVES
(`Bld.claimSeam`), because claiming on the order would let a tribe stake every
seam on the map from its own doorstep. On arrival the claim becomes an ordinary
`'work'` task, so production, the work line, the panel and the pick-swing pose
all see the same station every other plot is. Tapping a seam with a villager IS
the order (`UI.handleTap`, after the gather branch — a seam is in no `GATHER`
table so the two can never contend), and an unclaimed seam tapped with nothing
selected sends an idle hand, like a resource tile.
**And the LEVEL BELONGS TO THE SEAM** (same test): clear the hands off a mine,
put your own on it, and you inherit whatever it was raised to — an L3 shaft
somebody else paid sixteen days for. Ownership flips only when the holder has
NOBODY left on it (`Bld.mineHands` / `canClaimSeam`), so you cannot walk up and
take a manned mine; you take the ground first. Which is why **the works are not
a target at all**: `Bld.attackable(b)` is false for `mine`, both of combat's
target funnels (`Combat.nearestBuilding` / `nearestReachableBld`) skip it, the
`tBld` branch drops an unattackable target as a backstop, and `Bld.damage`
refuses. A raid that could raze the shaft would DESTROY the level rather than
win it, and "the level is agnostic to the team" would be a lie. The rival plays
by every one of these rules — `AI.maybeMine` sends a VILLAGER (fog-honest, never
before `CFG.GOLD_SEAMS.aiDay`), and `AI.plotMine` prefers an unclaimed or
newly-unmanned seam over one it already works.
**A transparent-floored terrain MUST be in `GROUND_GRAIN`** (same test): the
seam's sprite is authored on a clear floor like every other resource node, and
`R.drawTile` only paints grass under terrains in that set. Left out, the tile
falls to the plain `drawImage` branch and shows the BARE CACHE CANVAS, which
composites as black — a gold seam was a black tile with some gold in it.
`Sprites.blendCol` is the matching declaration of the floor each one stands on;
the two tables must agree. The seam itself is now drawn from the map's own rock
language (`boulderBody`, which takes a palette) in a pale QUARTZ ramp with gold
veins struck along the facet breaks, so it reads as a different KIND of rock
rather than a grey slab with dots on it.

**Gold mines & seams** (`tests/gold-mine.mjs`): gold is the one resource with
no ordinary tile to gather — it trickles out of the hall and the Trading Post
and nowhere else. **GOLD SEAMS** (`T.GOLDORE`) fix that without ever making it
free. They are laid down LAST in `MapGen.generate` (so nothing overwrites
them), scattered on open ground at least `CFG.GOLD_SEAMS.minFromTown` from
BOTH towns and only on land the player can actually walk to — a seam a
villager can't reach is a mine nobody can ever crew. `CFG.GOLD_SEAMS` scales
the count with the board (~4 medium, ~6 xlarge) and a relaxation pass
guarantees at least two, because a map with no seam is the feature switched
off. A seam is walkable and buildable but appears in NONE of the three
terraform whitelists (`DIGGABLE`/`CLEARABLE`/`MOUNDABLE_LAND`), so it can
never be trenched, cleared or paved away.
**The seam is for the mine and the mine is for a seam** (same test): the
`onTerrain` clamp in `Bld.canPlace` runs BOTH ways — a mine on ordinary grass
would be gold from nothing, and a hut on a seam would spend the map's rarest
tile on a hut. The mine is `freePlace` like the War Camp, because the
build-anchor rule ("near your town") would otherwise forbid every seam on the
map; being far from home is the whole risk of the richest income there is, and
it anchors nothing further (`_isOutpostSite`), so it stays a claim rather than
a beachhead.
**Worked like any station, and the best of them**: `needsWorker`, two hands,
gold PER HAND (4 → 9 → 16 at L1/L2/L3) — measured in worth, the richest income
on the board. Upgrades run on the STATION rule (`Bld.upgradeTime` doubles a
worker plot's time then quadruples it), so L2 is six days of work and L3
sixteen, and `dailyProduction` pays nothing while the works stand. Its crew
stands ON the plot like every other station, which is why `Bld.solid` (keyed
off `needsWorker`) leaves it walkable — the Gold Mine joined the worker-plot
set for free the day it was added, and `tests/buildings-block.mjs` pins that
the set is DERIVED and never hand-listed.
**What the miner is bringing up** (same test): a villager stationed at ANY
plot now floats `+<resource>` as it works — the same white vanishing text, the
same colour (`#d8e8b0`) and about the same cadence as the gather task has
always floated `+wood` for a woodcutter. So a miner reads `+gold` exactly the
way a farmhand reads `+food`, and gold gets no treatment of its own. (An
earlier pass hung a gold ICON over the miner's head; that was the wrong idea —
no other resource does that, and it made gold look special instead of normal.)
Production is still the once-a-day lump in `Bld.dailyProduction`; the float
only SAYS so. The pick-swing pose and the `Units.workReport` gold rate come
along with it. The mine's own
art puts the ADIT hard LEFT in the tile (x≈2): a villager sprite fills roughly
the middle third of its plot, so a mouth in the centre is a mouth nobody ever
sees, and the mouth is the one thing that says "mine". The bank behind it is
built from low-frequency sines only — a high-frequency term puts a tooth on
every column and the rise reads as battlements.
**And the seam OUTLIVES the mine** (same test): `Bld.removeToRuin` leaves
`T.GOLDORE` where every other building leaves rubble, so a razed mine hands
the ground back rather than destroying it — which is exactly what makes a seam
worth fighting over instead of worth burning. The ash still cools first, like
any burned building. The rival competes for them too (`AI.maybeMine` /
`plotMine`): fog-honest (only seams on `ai.seen`), only ones its own villagers
can stand at, and never before `CFG.GOLD_SEAMS.aiDay` (40) — a chief that
claimed the gold on day two would be racing before the player knew there was a
race. A player's mine is `needsWorker`, so `Combat.aiRaidSeek`'s economy branch
already targets it: holding one needs no new AI code, only soldiers.
**And a chief that can see no seam GOES LOOKING** (`AI.maybeProspect` /
`prospectTarget`, same test): the rival stops reading the map the day it finds
the player's hall — `searchTarget` only ever aims at THEM, and the scout
retirement pass stands every scout down the moment the hall is known. Seams lie
far from BOTH towns, so on a bad seed the chief reached day 160 having never
laid eyes on one, and `plotMine` can only pick a seam that is on `ai.seen`: the
richest income on the board was the player's by default. So with nothing
claimable in sight it sends ONE hand (a horse first, then a spare spear, then a
villager the fields can do without) out to open new country — paced like the
scout dispatches, `PROSPECT_LEGS` legs at most, never onto ground it can't walk
to and never into a war band's yard (`AI.campGround`). **The find is what ends
the errand**, not a timer. Two traps: the walker's stand-down must only drop the
WALK — `maybeMine` runs FIRST and will often put that very hand on the seam it
just found, being the one stood nearest it — and a walker carrying ANY other
order has been claimed by somebody else, which is emphatically not a cue to
overwrite it with another leg.
**A new `T.*` needs a minimap colour**: `R.drawMini`'s `COLORS` table is
INDEXED BY TERRAIN, so a new type without an entry paints holes where its
tiles stand.

**Barbarian camps** (`tests/raider-camps.mjs`): a camp used to be a PICTURE on
the ground — `T.CAMP` terrain, a wave muster point, and nothing you could ever
do about it. It is now a BUILDING (`raidercamp`) owned by `'R'`, standing on
that trampled ground, and the terrain sprite was stripped back to bare churned
earth because that is what is LEFT when the camp burns. Four rules.
**Tended, always**: `G.plantRaiderCamp` mans each camp the day the map is made
from the mode's `campGuard` band, and `G.tickRaiderCamps` (once a day from
`G.dayTick`) replaces a fallen tender after `CFG.RAIDER_CAMPS.remanDays`. The
camp REMEMBERS its own `quota`, rolled once, so a band you cut down comes back
the same size — clearing the band is an afternoon's work, taking the ground is
not.
**Milling, not marching**: tenders carry `u.campId`, and the branch at the top
of `Combat.raiderSeek` keeps them home — they wander inside `guardR`, fight
anything inside `chaseR` (and anything hacking at the camp itself, first), and
never set off across the map after a villager they glimpsed. That is what makes
a trip out to a far seam dangerous WITHOUT turning every camp into a permanent
invasion. **The stranded-'R' backstop in units.js must skip them** (`!u.campId`)
— it melts any land raider that stands still for 8 seconds, which is exactly
what a tender at its own fire does, and without the exemption every camp on the
map empties within a minute of the game starting.
**And the CHASE is leashed too** (`Combat.campLeash`, same test): keeping a
tender's ACQUISITION inside its ground was only half the rule. With a mark in
hand the chase ran on the generic 10-tile `u.anchor` leash in `Combat.update` —
twice the camp's own ground — and **everything a barbarian frightens runs
HOME**: a village's people flee to their hall (`Units.damage`), so the band
followed them there and stood outside somebody's town killing whoever came out,
day after day. Worse, the walk home re-anchors a unit wherever its path ENDS
(the `'move'` completion in units.js), so a tender dragged out once could be
dragged out again from there — a real ratchet, measured at 19 tiles from its
camp. Two fixes, both in the camp branch: the tender's `anchor` is re-stamped
on the fire every scan, and `campLeash` drops the quarry the moment either of
them leaves the camp's ground (`chaseR` + weapon + 1.5 for the runner,
`chaseR` + 1.5 for the tender) and walks it back. **This was the whole reason a
rival town would never get established** — a passive-player sim on the reported
day-219 seed had the chief lose 47 villagers by day 200 and end with 9
buildings and a level-1 hall; its income is paid per LIVING hand
(`Bld.dailyProduction`), so every kill is a permanent cut. Leashed, the same
seed reaches a level-3 hall and 54 buildings.
**A camp stands in the WILD COUNTRY** (same test): the clearance from a town is
DERIVED, not a taste number — a camp's tenders hold ground out to `chaseR` and a
town lays its buildings out to about seven tiles from its hall (`AI.plot`'s
`rMax`), so anything under the two added together puts a war band's yard on top
of somebody's lumber camp. `MapGen.generate` uses `chaseR + 7 + 4` and relaxes
in steps (…, 14, 10) if the board can't seat them all, so a small map still gets
its camps rather than none.
**And the chief does not WORK in a war band's yard** (`AI.campGround`, same
test): the other half of the bleed was the rival siting stations and claiming
gold seams inside a camp's ground and sending another hand the moment the last
was cut down — a conveyor, one villager every few days for the back half of a
run. `AI.plot`'s `free()` (non-fort keys only; walls sit on the seam and have
their own clamps) and `AI.plotMine` both refuse that ground. Fog-honest like
every other read the chief makes — only camps it has actually seen — and only
ones still STANDING, so burning the camp out hands the ground back.
**Burnable**: it has hp, so a war party can pull it down. `Bld.damage`'s `'R'`
branch logs it; the standing band goes loose the next time `raiderSeek` runs
(no camp, no post); `tickRaiderCamps` raises nothing there again; and the wave
muster filter in `Combat.spawnWave` only counts camps still standing, so
burning one takes that muster point off the board for good.
**And you can actually ORDER the attack** (same test): making a camp a building
was only half of "burnable" — the TAP has to issue the order, and it didn't.
Every foe-building tap in ui.js asked `owner === 'A'`, and a camp is owned by
`'R'`, so a war party stood beside one being told ABOUT it with no way to pull
it down. All three tap sites now go through `Bld.foeBld(b, owner)` — anything
not yours that can be hurt, the rival's works and a barbarian camp alike (and
never a gold mine, which `Bld.attackable` excludes). One predicate, so the
sites can never drift apart again.

**FIVE PEOPLES walk the wild country** (`CFG.TRIBES`, same test): barbarians
used to be ONE look, and drawn on the legacy 16-grid rig while every tribesman
in the game had moved to the 32-grid one — which is exactly why they read as
scruffy villagers rather than as something to be afraid of. There are five now,
each on the hi-res rig, each with MEN AND WOMEN, each with its own camp and its
own name in the log: **Wolfskins** (úlfheðnar in a wolf war-mask), **Flintfolk**
(Mesolithic, antler-crowned), **the Broken** (what is left of a third village,
still in its ragged garrison gear), **Woadkin** (Celts, hair limed white) and
**the Sea Folk** (Sherden/Peleset in the plumed crown — nine longboat crews in
ten are these). What makes a people read at 32px is the SILHOUETTE ABOVE THE
SHOULDERS and the shape in the hand — a muzzle and ears, a rack of antler, a
dented helm, a crown of limed spikes, a fan of plumes; colour only confirms what
the outline already said. Three traps this cost: a wolf pelt over a wolf-brown
body is one grey slab, so the body and the fur must be different materials; a
solid block of plumes or spikes is a HAT, so both leave gaps of sky between
them; and two bare posts are horns, so an antler rack has to sweep back, branch,
and be uneven between the two beams.
**A camp keeps its people for its whole life** (`G.plantRaiderCamp`, `b.tribe`
in every save): everything raised there wears that look, so the band at the
northern fire is the same band every time you come back — and burning that camp
out takes those people off the board. A band mustered AT a camp is its people;
one marching in off the map edge rolls its own. The rig is `Sprites.barbFor(key)
[kind][female ? 1 : 0]`, built lazily and cached like `militaryFor` (a map that
meets two of the five never pays for the other three), with `Sprites.camp[key]`
for the fires; an unknown key falls back to the Wolfskins rather than throwing.
`R.bldSprite` and `R.unitSprite` are the only two places that choose. The camp
panel names them (`UI.renderPanel`) and so do the war-band and burned-out log
lines — a note that only says "barbarians" tells you nothing about who is
coming. `loadJSON` deals a people to every camp and barbarian in a pre-peoples
save, hashed off the SAVE'S OWN SEED so loading twice deals the same peoples and
the run's roll sequence is never disturbed.

**The wilds EASE OFF a gutted town** (`G.barbEase`, same test): barbarians
SEASON a war — they must never decide it. A rival ground down to a hall and a
field of ash by war bands robs the player of the victory they spent two hundred
days working toward: you march up expecting the fight of the game and find an
empty village. So a tribe on its knees gets a breather — `Combat.maybeWave`
re-aims the band's temper at whoever is still standing (and musters NOTHING when
both are down), the wave clock stretches by `BARB_EASE.gapMult`, and
`Combat.raiderSeek` drops that owner off the target list so bands ALREADY in the
field stop hunting it too. Measured: a rival cut to one hut and one hand on day
100 is back to 9–17 buildings and a standing army by day 170.
The test is the town's STATE, never blame — nobody can attribute a burned farm
to a barbarian rather than a player — so it reads like a chief looking at a
smoking village and deciding there is nothing left worth taking. **Both halves
are gated on `minPeak`** (`S.peakTown`, in every save, `loadJSON` backfills):
the ease is for a town that got ESTABLISHED and then fell apart, never for a
three-villager opening — a hard first week is the player's to have. Owner-
agnostic, with one exception: a COLLAPSED player (`S.collapse`) is being ENDED,
not nursed. Camp tenders are untouched — they are defending their own ground,
not choosing a town to sack — and `Units.damage` retaliation still applies, so
a barbarian you strike always strikes back.

**Scaled both ways**: camp COUNT is the map's area factor × the mode's
`campMult` (calm 0.6 / moderate 1 / hard 1.5, floored at `RAIDER_CAMPS.min`),
and the band size comes from `campGuard` (calm 1–2, moderate 1–3, hard 2–3).
Two consequences of a camp being a real building: it is SOLID like every other
non-plot building, so `Combat.spawnWave`'s island-map wilderness flood must
seed from the open ground BESIDE a camp rather than the camp tile itself; and
the owner pip needed an `'R'` case (rust, not the rival's red) — a camp is
nobody's tribe.

**Mortality** (`tests/mortality.mjs`): every `CFG.MODES[m].deathEvery` days one
villager simply dies — Calm waits longest (34–52), Moderate is the stated band
(25–40), Hard shortest (18–28). It exists for ONE mechanical reason: a station
staffed on day forty and forgotten will sooner or later want a hand put back on
it, so the post is left EMPTY and re-staffing is the player's problem.
**Two deliberate limits.** It never takes the LAST villager (`pool.length < 2`
→ try again in two days) — a random roll must not end a run the player is still
playing — and it is PLAYER-SIDE ONLY: the rival hires its workforce back on a
timer of its own, so mortality there would be invisible bookkeeping that only
re-tunes its economy. `S.nextDeath` rides in every save; `0`/`null`/`undefined`
all mean "not rolled yet", so a pre-mortality save rolls a fresh gap on its next
tick instead of burying someone the instant it loads.
**The cause fits the work** (`CFG.DEATHS`, `G.deathCause`): keyed by what the
villager was DOING — the station they were stationed at (`farm`/`lumber`/
`quarry`/`mine`/`lodge`, so every `needsWorker` plot has its own set), the
resource they were gathering, whether they were building or line-fishing, with
`general` for anyone caught idling. 3–4 lines per kind of work and 15 general
ones; adding a station is one more key in the table and nothing else.
**The news is plain `G.log`, never `G.foeNote`** — foeNote is difficulty-gated
ENEMY intel, and a death in the village is the player's own news, told at every
difficulty.
**The news comes FIRST** (`CFG.MORTALITY.warnMs`, `G.tickMortality` →
`G.dyingTick`): the fall is a second and a half of animation somewhere in a
village the player may not be looking at, so announcing it in the same instant
means they read the line and look up at nothing. `tickMortality` now names the
victim, logs the line and marks them; `dyingTick` (driven from the frame loop)
takes them a beat later. The pending fall lives on `G._dying` and NEVER in a
save (same rule as `G._marvel`) — save inside that beat and the villager simply
lives, which is a kindness rather than a bug. Every `CFG.DEATHS` line is now a
WHOLE SENTENCE naming a villager's death ("A villager was crushed by the very
block they had just called a good one."), because the log prints it as-is
behind a skull: a line that only described the accident read as a mishap, not
a death.
**The fall** (`R.deathSheet` / `startDeath` / `drawDeaths`): six frames cut from
THAT VILLAGER'S OWN sprite, so the tunic dye and the man/woman variants come
free — a stagger, the tip about their heels (pivot at 82% of the sprite's
height, with a small sag so it isn't a rigid plank), flat on the ground with a
puff of dust, and gone by the last frame. Frames are the SAME canvas size as an
ordinary unit sprite, so they draw through the identical box at the identical
`SPRITE_LIFT` offset. `R.deaths` is render-side only and never reaches a save
(same rule as `R.collapses`).

**The drawbridge** (`tests/drawbridge.mjs`): the level-3 gatehouse hangs its
bridge on chains, and the panel carries ONE button whose label is the ACTION
rather than the state — "⬆ Raise the drawbridge" while the deck is down, "⬇
Lower the drawbridge" while it is up (`data-act="drawbridge"` →
`Bld.toggleDrawbridge`). **Raised, the gate is a WALL**: `Bld.rebuildBlock`
writes block code **1** for `b.raised`, the code that stops EVERYONE — its
owner included — instead of the 2/3 that passes its own tribe. That is what
makes the lever a decision and not a free upgrade: you shut your own door and
live with it. Only the third tier has the winch (`Bld.canDrawbridge`: finished,
`level >= 3`); L1 and L2 show no button at all, and `b.raised` rides in every
save (`loadJSON` backfills `false`, so a pre-drawbridge save's gates load open).
Shutting the gate on somebody standing in the passage steps them clear via
`Bld.stepOffFootprint` — the step-off `Bld.finish` already did for a footprint
that turns solid, now factored out and shared. `UI.panelSig` carries `b.raised`
so the label flips the moment the order lands.
**A drawbridge falls OUTWARD** (same test): never into the courtyard. Which way
that is cannot be read off the wall line, because a stronghold is only PARTLY
built — the cheap way to enclose ground is to run a wall between a lake and a
mountain and let the map do the rest. `Bld.gateOutside` therefore reads the
GROUND: flood the two sides the passage joins, with deep water, mountain,
trench, moat and the tribe's OWN finished walls/gates/towers as barriers (never
back through this gate), then take the side the HALL is on as the inside —
falling back to whichever side is ENCLOSED (the other ran to the map's edge or
past `GATE_FLOOD_CAP`), then to whichever holds more of the tribe's works, then
to the old default. The hall test is primary because it is the one that
survives a LEAKY ring, where both floods reach the wide world. Harvestable
ground — woods, crags, orchards — is deliberately NOT a barrier even though it
blocks movement: a woodcutter finishing a stand would otherwise turn a castle
inside out the day the last tree came down. Owner-agnostic, and CACHED against
`Bld._blockGen` (bumped in `rebuildBlock`), so two floods run only when the
walls actually change — build the block grid BEFORE reading the generation or
the cache is stamped with a number already stale.
**Which strip, and where it is drawn** (same test): a west-falling flank deck is
the east one MIRRORED about the tile's centre line (a picture-plane rotation, so
a mirror is exact); a north-falling FACE deck cannot be mirrored at all — flipped,
the raised frames would stand below the hinge — so it is authored
(`deckFaceAway`, `Sprites.drawbridge[2]`) and drawn UNDER the gate sprite, with
the curtain and gatehouse occluding its near end. It hinges on the gate tile's
TOP edge, because in a projection that draws terrain from above and buildings
facing you, the ground beyond the wall is the tile above; hung lower it lands on
the gatehouse's own crown and reads as a raft floating over the battlements. Its
visible length SHRINKS as it rises, which is exactly what you see from inside a
castle when the bridge comes up. `R.drawDrawbridge` takes a `front` flag and the
building loop calls it twice — once before the gate sprite, once after — so each
strip answers on the pass it belongs to.

**THE DECK IS A CROSSING** (same test): a drawbridge exists to span the ditch,
so lowered it makes the ONE TILE it reaches across WALKABLE — `Bld.drawbridgeSpan`
is that tile (one step along `gateOutside`, in the axis `R.gateVerticalAt`
gives), `Bld.rebuildDeck`/`deckAt` is the grid of them, and `Path.passable`
carries land over a moat or water tile that a deck lies on exactly as a built
bridge does. Raised, the crossing goes with it: the deck grid drops the tile
AND the gate's own tile turns to code 1, so a closed bailey is genuinely shut —
that is the whole ask, "the army floods out when it's down, nobody good or bad
passes when it's up". Deliberately **owner-agnostic**: anyone may walk a lowered
deck (what they still cannot do is pass the gate itself unless it is theirs,
code 2/3), which is what makes the lever a decision rather than a free wall.
The deck grid is built LAZILY against `_blockGen`, never inside `rebuildBlock`
— working out which way a gate faces needs the block grid to exist already
(`gateOutside` → `gateVerticalAt` → `fortAt`) and building it from inside the
rebuild would recurse — and `deckAt` must force `rebuildBlock` BEFORE comparing
generations, or it reads a stale deck while `_blockGen` is still the old number.

**The deck is its own little atlas** (`Sprites.drawbridge`, `deckFace` /
`deckSide` / `deckFaceAway` / `tileDB`): eight stills per orientation, frame 0
fully down and the last fully up — raising and lowering are the SAME strip read
one way or the other — drawn over the finished gate by `R.drawDrawbridge`.
**ONE TILE, BOTH WAYS**: the deck is a FULL TILE long (`DB_LEN` 30 fine cells of
a 32-cell tile), because a bridge that lands mid-moat crosses nothing. So the
canvases are TWO TILES in the fall direction, the second hanging off the side
the deck falls toward: the east-west face is 1 wide × 2 TALL (it lies south,
toward you), the north-south flank 2 WIDE × 1 (the passage runs east-west, so it
lies east). Two authored views, like the gatehouse itself — neither is the other
rotated. The same board stands up as lies down; nothing grows on landing.
**A bigger door needs a plainer gateway.** A full-tile deck stood upright fills
the whole archway, so `gateFaceT3`'s central block was widened (`A0/A1` 11..20,
`AT` 14) and its machicolated gallery over the passage dropped for a plain coped
head — the turrets keep theirs, so the gatehouse still reads as a gatehouse
while the raised deck has somewhere to be. The chains hang from winches at the
TURRET heads (row 6) rather than off the gallery that is no longer there.
**Do not "fix" the edge-on frames.** The face view uses the honest projection —
`yEnd = GND + LEN·cosθ·FORE − LEN·sinθ`, the ground reach at `FORE` 1 now that
the deck must cover a whole tile of ground — which walks the free end SMOOTHLY
across the hinge, through a two-row slab mid-swing that is exactly what a deck
pointing at the camera looks like. Taking a `max()` of the two terms to keep it
"visible" teleports the deck from one side of the hinge to the other in a single
frame. The away view's extent curve is `LEN·cos(θ)^1.6·0.94 + 1.5` rather than a
plain cosine: at this length a plain cosine rounds frames 0 and 1 to the same
pixels and the strip reads as a stutter.
**The swing is render state** (`R._dbA`, eased per gate id): never on the
building, never in a save — the same rule `R._fighting`, `R.collapses` and
`R.deaths` follow, and it is cleared in `R.onNewGame` so reused ids can't
inherit another run's deck angle. The tile seals the INSTANT the order is
given; the animation is only what the player sees. A gate first met already
shut (a loaded save) starts settled rather than slamming on sight.

**The hall rises on the town's shoulders** (`tests/tc-upgrade.mjs`): a Town
Center storey is no longer something you simply save up for. Its price went up
by half (Lv 2 now 300 wood / 225 stone / 45 gold, Lv 3 600 / 450 / 120), and it
must be EARNED: `Bld.tcSupport` counts FINISHED buildings at the hall's own
level and `Bld.canUpgrade` demands `Bld.TC_SUPPORT` (3) of them — three level-1
buildings for Lv 2, three level-2 buildings for Lv 3. One rule serves both
tiers because it keys off the hall's CURRENT level, so the hall is always a
step BEHIND the town rather than in front of it.
**It cannot deadlock**: an ordinary building may only reach Lv 2 once the hall
is Lv 2 (the `Needs Town Center Lv N` gate just above it), so the sequence is
town → hall → town → hall and always terminates.
**Walls and gates do not count.** They have no upgrade of their own — the whole
curtain is raised at once from the Town Center at a village-wide tier — so
counting them would let a line of cheap palisade sections buy the hall's next
storey, which is exactly the shortcut the rule exists to close. Work SITES
don't count either: a building that isn't finished isn't a building yet.
**Owner-agnostic** — the rival's chief builds a town before a hall on the same
terms, and its Town-Center macro-action simply scores something else while it
cannot (a 300-day sim puts the rival's L2/L3 roughly 15–100 days later, never
never-happening). The refusal carries a LIVE TALLY ("Needs 3 buildings at Lv 1
(have 2)"), so `UI.panelSig`'s `tc` branch has to include `Bld.tcSupport(b)` —
that number moves without `ok` flipping, and without it the panel sits on a
stale count.
