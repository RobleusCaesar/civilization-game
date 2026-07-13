# Clanfire — The Rival AI (how the computer plays its village)

A code-accurate overview of the rival tribe's brain. The AI is the `AI` object
in **`js/ai.js`**; its tactical combat (raid execution, the villager last
stand) lives in **`js/combat.js`**. The rival is bound by the **same fog of war
as the player**: it knows only what it has seen. Each day it refreshes its own
vision from its buildings and units, *remembers* the player structures it has
laid eyes on (with staleness), and reasons from that partial picture — not from
the true board. It cannot read your treasury, count an army across the map, or
march on a town it has never found. To learn more, it must **scout**.

The AI is built as **five layers over the base village systems**. It thinks
**once per in-game day** in `AI.daily()` (called from `G.dayTick()`); its
construction and training progress tick in *frame time* via `Bld.update`, and
its units move and fight in `Units.update` / `Combat.update`, exactly like the
player's.

---

## Layer 1 — Perception, under fog of war (`AI.assess()` → `S.ai.read`)

Each day the chief first refreshes what it can **see** (`updateVision()`): a
vision grid lit by its own buildings' sight radius and its units' `UNIT_VISION`.
It marks that ground **explored** (`S.ai.seen`) and updates its **memory of
player buildings** (`S.ai.knownB`) — anything currently in sight is recorded
with the day it was seen; a remembered building it now sees is *gone* (razed) is
forgotten. From that partial picture it writes a compact **world-read** the rest
of the brain reasons about (perception decoupled from action). The read
includes:

- **The player's home** — `knownTC`: the remembered location of the player's town center, or `null` if it hasn't been found yet. Almost every offensive decision keys off this: no known hall, no attack.
- **Power** — its own vs the player's **visible** military only (units it can see this moment), the ratio, and the power **trend**. An army hidden in the fog doesn't count against it.
- **Player army disposition** — how much of the *seen* force is **home** vs **away**, and the resulting **vulnerability window** (`foeVuln`, valid only once `knownTC` exists: the home guard is thin, or two-plus soft targets sit exposed).
- **Player defenses** — wall/tower strength around the *remembered* hall, and the **weakest flank** (least-defended approach over 8 directions), computed from the walls and towers it has actually seen.
- **Economic exposure** — remembered undefended workplaces and **visible** isolated, unescorted gatherers (`exposed[]`) — prime raid targets it can actually point at.
- **Composition** — cavalry / archer / melee / siege counts among the units it can see, with `foeCavHeavy` / `foeArchHeavy` / `foeSiegeSeen` flags for counter-building.
- **Enemy economy — an ESTIMATE, not a reading** (`foeEcon`): it values the player buildings it *remembers* (`VIS_EST`) and adds them up. It never touches the player's treasury. A fat, hidden war chest is invisible to it.
- **Immediate threat** — enemy force strength on its own hall right now (`threat` / `underThreat`). It always sees its own ground.
- **Terrain geometry — chokepoints & lanes.** Now that forest/rock/orchard ground blocks movement, terrain *is* tactics. `AI.perimeterGaps(cx,cy,R)` finds the open **seams** on a town's perimeter ring — the contiguous runs of passable ring tiles an attacker must come through (impassable terrain walls the rest), sorted widest-first with a facing direction. The read carries the rival's OWN seams (`homeGapCount` / `homeGapWidest` / `homeExposed`) so it knows which gaps to close; `AI.playerLanes()` does the same for the **remembered player town**, ranking the approach lanes **least-defended first** (remembered towers/walls on the seam + memory of where past raids were beaten back).

Toggle `window.DEBUG_AI = true` for an on-screen overlay dumping the read (and posture) each day.

---

## Layer 2 — Strategic posture (`AI.choosePosture()` → `S.ai.posture`)

The Origin Card stays the tribe's **personality**; posture is its **current
plan**, chosen each day from the read and allowed to shift as the game turns.
Six postures:

| Posture | When | What it does |
|---|---|---|
| **EXPAND** | safe + behind on economy | boom economy, token guard |
| **CONSOLIDATE** | default / preparing | build army + defenses toward a target |
| **PRESSURE** | tempo edge / soft targets exist | harass exposed economy, retreat |
| **PUSH** | clearly ahead, or a real opening | mass a force and commit to end it |
| **DEFEND** | behind / under threat | rally, wall the flank, turtle |
| **REBUILD** | after a sacking | recover |

Each persona has a **game-plan** (`AI.PLANS`): a preferred posture *arc* that
plays its identity well, and an aggression appetite —

- **Warlord** CONSOLIDATE → PRESSURE → PUSH (early military win)
- **Homesteader** long EXPAND → late PUSH (economic win)
- **Horselord** perpetual PRESSURE (harass, win by attrition)
- **Mason** DEFEND/turtle → CONSOLIDATE → late PUSH
- **Mariner** CONSOLIDATE → PRESSURE (control water first)
- **Forager** EXPAND → CONSOLIDATE → power-spike PUSH

The **read overrides the arc** when the board demands: a real vulnerability
window flips it to PUSH/PRESSURE (take the opening); being clearly ahead ends
it; being behind or under threat digs in to DEFEND; a sacking triggers REBUILD.
**Hysteresis** (minimum dwell times per posture, with emergencies exempt) makes
the chief **commit** to a plan instead of flip-flopping.

**You cannot attack what you have not found.** If the player's town is unknown
(`knownTC === null`), any attack posture falls back to **CONSOLIDATE** — the
chief keeps massing while its **scouts go looking** (see the scouting behavior
in `daily()`: when it hasn't found the player, or its memory has gone stale, it
sends a spare rider — else a villager — toward the far unknown or the last place
it saw them, without stripping its home guard). Only once it has laid eyes on
your hall does it commit to a march.

---

## Layer 3 — Utility-scored actions (`AI.bestBuild` / `digAndProtect` / `trainForces`)

The old brain ran ~10 construction rules in a **fixed order**, each firing on a
hard threshold — which read as mechanical. Now each day the chief **enumerates
candidate actions** (income buildings, military halls, towers, walls, dock,
houses, TC upgrade, building upgrades, growth) and **scores every one** as a
function of *posture × read × persona × resources × timing*, then spends the day
on the best affordable one. Because utilities are **continuous**, behavior
shifts smoothly instead of on cliff edges.

- The old **safety nets** aren't pre-empting steps anymore — they're just very
  high-utility candidates that **compose**: starving in a resource, or lacking
  an army hall, scores above everything and fires on any day (`digAndProtect`).
  A town always builds an **army hall before it fortifies**, digging out the
  blocking resource first.
- **Training** (`trainForces`) is **posture- and counter-weighted**: the army
  target scales with difficulty *and* posture (EXPAND keeps a token guard, PUSH
  masses for the kill), and the mix re-weights toward hard counters the read
  calls for — massed spears/archers vs a cavalry player, cavalry vs an archer
  player, fast units vs siege — and it builds the matching counter-hall.
- **Techs to siege to crack a turtle.** When the player **walls up**
  (`read.foeWall` high), *any* persona will build a siege workshop (once TC 3) and
  keep a **wall-breaker** (catapult, or a trebuchet at workshop L3) on hand — so a
  PUSH batters the wall with engines while the rest pour through the gap, instead
  of stalling on stone. A capable rival reaches for the tool the matchup needs.
- **Terraforms its defence (Sappers).** A turtling/threatened or wall-persona chief
  builds a **Sappers' Camp**, trains sappers, and `AI.terraform()` digs a
  **defensive moat/trench layer** around its town — flooding a channel into a moat
  where the perimeter touches water (layering *outside* its walls), trenching the
  threatened flank where it doesn't. Gated by posture/persona and **scaled by the
  creativity dial** (Hard moats readily and cleverly; Calm sparingly), and always
  run through the reachability clamp so it never seals itself in. *Follow-ups (see
  HANDOFF.md): offensive Tier-3 breaching / Tier-2 bridging for surprise lanes, and
  targeting the player's exposed sappers and bridges as high-value objectives.*
- **Coverage-aware towers — cover, don't cluster.** `AI.towerSpot()` scores every
  candidate tile by the **marginal new coverage** it adds over the towers already
  standing: guarding an otherwise-uncovered approach seam scores high, merely
  duplicating an existing tower's range is penalised, and a **pure-duplicate tower
  is rejected outright**. Towers therefore spread to cover the town's whole
  frontage instead of piling onto the single widest seam (the old, readable tell).
  Placement is biased toward the player-facing frontage and, via Layer-5 memory,
  the **flank the player keeps attacking from**.
- **Real fortification — plug the seams, and invest.** `maybeWalls` closes the
  **open seams** on the perimeter (`perimeterGaps`), sealing the **shortest seams
  first** (a narrow gap is cheap to close completely and removes a whole route),
  **gating the widest** as the sortie lane, and **reinforcing the attacked flank**
  first (`mem.hitFlank`). Its per-call budget and the `bestBuild` wall utility both
  **scale with threat and posture** — a wall-persona or a threatened/turtling chief
  fortifies heavily and early; a safe chief doesn't burn wood ringing open ground
  against nobody. This is what makes Mason-type turtling smart *and* keeps the
  offence funded when there's no threat to wall against.

---

## Layer 4 — Tactical combat (`AI.chooseRaidObj` + `Combat.aiRaidSeek`)

Rival raid parties fight **as one toward an objective** the chief picks at
launch, instead of dribbling at whatever's nearest:

- **PRESSURE** targets the juiciest **soft target** — an isolated, unescorted
  villager or an undefended workplace — because burning economy cripples the
  player far more than dying on the death-ball.
- **PUSH** marches on the hall, reading the board for **expected value**: a
  hostile soldier in its face is dealt with, soft targets on the way are taken,
  and only the **wall-breakers** (siege / axemen) batter walls while the rest
  follow the gap — **combined arms**, not everyone poking stone.
- If the player is walled and the party carries **no siege**, it comes in
  through the **weakest flank** instead of the front gate.
- Raid parties **route along real passable lanes** (pathfinding enforces it), so
  they follow the terrain and automatically pick up **harvest-opened routes** — a
  border you clear-cut becomes a road the rival will use.

**Creativity dial — unpredictable, never self-defeating.** `AI.creativity()`
returns a 0..1 value from the persona (aggressive/harassing chiefs are craftier)
**scaled by difficulty** (Calm plays it straighter, Hard is unpredictable). It
drives *controlled* variation so two games with the same posture don't play the
same: the **committed party fraction** is jittered within sound bounds, the **raid
cadence** is jittered off its fixed metronome, and the **feint/split likelihood**
is creativity-driven at *every* difficulty (not a hard-coded per-mode count). All
variation stays tactically sound — hard to memorise, never random or suicidal.

**Multi-lane probing (creativity- & difficulty-scaled).** The rival doesn't commit
to one predictable approach. From `AI.playerLanes()` (approach seams into your
town, least-defended first) it launches, in rough order of creativity:

- **Straight** — one telegraphed column down a single lane.
- **Feinting** — peels off a **feint** down a second lane to pull your defenders.
- **Splitting** — **splits the host**: harass/probe parties on alternate lanes to
  find the undefended gap, while the **main force commits to the lane memory says
  is softest**. Probe parties carry their own objective (`u.raidObj` /
  `u.raidLane`); the main force shares `ai.raidObj`. A creative Hard chief splits
  most pushes; a straight Calm chief rarely does.

**Lane memory** (`S.ai.memory.laneDef`): a push that stalls or is beaten back
marks *that lane* as defended, so the next commit routes elsewhere; a productive
one softens it; all decay slowly. Probes that hit a defended lane **retreat and
re-route** rather than feed themselves in.

Retreat still applies: a party cut below a third of strength, or bogged down
8+ days, breaks off and marches home.

---

## Layer 5 — Within-game memory (`S.ai.memory` + `S.ai.knownB`)

Two kinds of memory. **Building memory** (`S.ai.knownB`, Layer 1) is the map of
the player's town the rival carries between sightings — the reason a raid can
march on a hall it scouted twenty days ago and now can't see, and the reason it
stops believing in a workplace it watched burn. **Tactical memory**
(`S.ai.memory`) is cheap adaptation that makes the chief **harder to read the
longer you play**. `AI.learn()` folds each day's observations into a decaying
store and feeds it back into placement, production and tactics:

- **`wallStop`** — a raid that stalls on walls without razing routes the **next**
  push through the weakest flank instead of the front gate (never suicides into
  the same wall twice; a productive raid clears it).
- **`laneDef`** — per-lane defended-ness: a beaten push marks *its* lane defended
  so the next commit routes elsewhere; probes retreat off defended lanes (Layer 4).
- **`hitFlank`** — the direction the player keeps **attacking from**. `maybeWalls`
  reinforces that seam first and `towerSpot` biases coverage toward it.
- **`foeMassed`** — a decaying tally of what the player keeps **fielding**;
  `counterMix` and the counter-hall picker key off this *trend*, so the chief
  keeps building the right counter after the enemy army leaves its sight.
- **`foeRush`** — hit at home early flags a rusher, so tower/wall utility rises
  and it fortifies **pre-emptively** thereafter.

Everything decays, so stale reads fade — and legacy saves (older `memory` shape)
load and upgrade in place without breaking.

---

## Smart ≠ Hard (difficulty)

Difficulty gates the rival's **appetite and scale — never its decision
quality**. The perception → posture → utility → tactics brain runs at **every**
level; the mode knobs (`CFG.MODES`) only change how it's expressed:

| Knob | Calm | Moderate | Hard | Effect |
|---|---|---|---|---|
| `aiAggro` | 0.55 | 0.90 | 1.20 | exploitation appetite — how small an edge it commits on |
| `aiOutput` | 0.85 | 1.10 | 1.30 | economy scale |
| `aiArmyCap` | 6 | 9 | 13 | base standing-army size (grows with the clock) |
| `aiArmyDiv` | 11 | 8 | 6 | lower = army grows faster |
| `aiEliteShare` | 0.15 | 0.45 | 0.80 | fraction allowed to be elite-tier |
| `aiBuildEvery` | 3 | 2 | 1 | days between construction attempts |
| `aiRaidDay` | 80 | 50 | 32 | non-vulnerability raid floor (a real opening beats it at all levels) |

So **Calm is smart-but-gentle** — it reads the board and makes sound moves, but
keeps a smaller army, rarely all-ins, and won't punish every minor opening;
**Hard is smart-and-ruthless** — it exploits every vulnerability window, builds
optimal counters, and commits decisive pushes. The difference is aggression and
scale, not blunders. In the benchmark, a passive player is conquered on **Calm
(~day 88), Moderate (~day 51), and Hard (~day 43)** — same competence, rising
aggression (the maze geometry and multi-lane splits add a few days over the
open-map figures, but every difficulty still lands the kill).

Difficulty also shapes the **terrain game** (Phases above): easier games hand the
player a more naturally fortified spawn (Calm ~2 approach lanes, Hard exposed),
and the rival probes more lanes the harder it gets (Calm one column, Hard splits
its host across 2+ lanes and commits to the softest).

---

## Fairness / limitations (unchanged design)

- **Symmetric fog** — the rival sees only what it has explored, remembers what it once saw (with staleness), and scouts to learn more. No omniscience: it can't read your treasury, count a hidden army, or attack a town it hasn't found. The one thing it always sees is its **own** ground (home threat).
- **No worker micro** — income is a daily trickle (scaled by `aiOutput`) plus its buildings' output (auto-crewed). Its villagers wander (flavor + raid bait) and, under siege, fight (the **townsfolk militia**, `js/combat.js`).
- **No amphibious assault** — it builds boats/warships for coastal economy and defense, but its raids march overland.
- **One card, one identity** — its strategic personality is fixed at the draft; it doesn't switch personas, but its *posture*, *aggression*, and *army scale* all shift with the board and the clock.

---

## Verification

Headless Playwright suites in the session scratchpad cover each layer:
`aiperc` (fog-limited perception — blind without vision, sees within it,
remembers unseen buildings, forgets razed ones, estimates economy, scouts),
`aipost` (posture divergence / exploitation / hysteresis), `aiutil` (utility
town-building / counter-building / conquest),
`aitac` (objectives / soft targets / wall memory),
`aiterrain` (chokepoint perception, seam-plugging defense, towers on the
approach), `aiprobe` (multi-lane probing / lane memory / main-force commits to
the softest lane), and `aibench` (beats a passive player at every difficulty;
smart-not-hard). Terrain itself is covered by `terrain` (impassable tiles,
adjacent gathering opens routes, reachability, trap-guard) and `defensibility`
(difficulty-scaled spawn fortification). `smoke45` / `smoke46` guard persona
coherence and the Origin-Card sweep.

## File map

| Concern | Location |
|---|---|
| Perception, posture, utility engine, raid planning, memory | `js/ai.js` (`AI`) |
| Raid-party & militia tactics, wave/aggro logic, home turf | `js/combat.js` (`Combat`) |
| Building placement, construction, training, production | `js/buildings.js` (`Bld`) |
| Origin Cards → persona / boon / opening bias | `js/cards.js` (`Cards`) |
| Day tick that calls `AI.daily()`, start-package roll | `js/game.js` (`G`) |
| Difficulty knobs, unit/building stat tables | `js/config.js` (`CFG`) |
