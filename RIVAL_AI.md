# Clanfire — The Rival AI (how the computer plays its village)

A code-accurate overview of the rival tribe's brain. The AI is the `AI` object
in **`js/ai.js`**; its tactical combat (raid execution, the villager last
stand) lives in **`js/combat.js`**. Everything it knows comes from the shared
game state `S` — the same state the player's village uses. The rival plays
**without fog** (full map knowledge), which the brain uses as *cognition*, not
as a cheat: it reads the true board the way a person reads a screen.

The AI is built as **five layers over the base village systems**. It thinks
**once per in-game day** in `AI.daily()` (called from `G.dayTick()`); its
construction and training progress tick in *frame time* via `Bld.update`, and
its units move and fight in `Units.update` / `Combat.update`, exactly like the
player's.

---

## Layer 1 — Perception (`AI.assess()` → `S.ai.read`)

Each day the chief takes stock of the whole board and writes a compact
**world-read** the rest of the brain reasons about (perception decoupled from
action). The read includes:

- **Power** — its own vs the player's, the ratio, and the player's power **trend** (rising/falling).
- **Player army disposition** — how much is **home** vs **away**, and the resulting **vulnerability window** (`foeVuln`: the home guard is thin, or two-plus soft targets sit undefended).
- **Player defenses** — wall/tower strength around the hall, and the **weakest flank** (the least-defended approach, sampled over 8 directions).
- **Economic exposure** — undefended resource buildings and **isolated, unescorted gatherers** far from home (`exposed[]`) — prime raid targets.
- **Composition** — cavalry / archer / melee / siege counts, with `foeCavHeavy` / `foeArchHeavy` / `foeSiegeSeen` flags for counter-building.
- **Own standing** — economy (its treasury vs the player's, read directly from `S.res`), building tempo, what's under construction, whether it's been **sacked**.
- **Immediate threat** — enemy force strength on its own hall right now (`threat` / `underThreat`).

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

Retreat still applies: a party cut below a third of strength, or bogged down
8+ days, breaks off and marches home.

---

## Layer 5 — Within-game memory (`S.ai.memory`)

Cheap counters that let it adapt to *you* over a match. Chiefly: a raid that
**stalls on walls without razing** sets `wallStop`, and the **next** push routes
in through the weakest flank instead of the front gate — so the chief **never
suicides into the same wall twice**. A productive raid clears the flag.

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
(~day 82), Moderate (~day 48), and Hard (~day 35)** — same competence, rising
aggression.

---

## Fairness / limitations (unchanged design)

- **No worker micro** — income is a daily trickle (scaled by `aiOutput`) plus its buildings' output (auto-crewed). Its villagers wander (flavor + raid bait) and, under siege, fight (the **townsfolk militia**, `js/combat.js`).
- **No amphibious assault** — it builds boats/warships for coastal economy and defense, but its raids march overland.
- **One card, one identity** — its strategic personality is fixed at the draft; it doesn't switch personas, but its *posture*, *aggression*, and *army scale* all shift with the board and the clock.

---

## Verification

Headless Playwright suites in the session scratchpad cover each layer:
`aiperc` (perception read), `aipost` (posture divergence / exploitation /
hysteresis), `aiutil` (utility town-building / counter-building / conquest),
`aitac` (objectives / soft targets / wall memory), and `aibench` (beats a
passive player at every difficulty; smart-not-hard — no blunders on Calm, Hard
is bigger and more aggressive). `smoke45` / `smoke46` guard persona coherence
and the Origin-Card sweep.

## File map

| Concern | Location |
|---|---|
| Perception, posture, utility engine, raid planning, memory | `js/ai.js` (`AI`) |
| Raid-party & militia tactics, wave/aggro logic, home turf | `js/combat.js` (`Combat`) |
| Building placement, construction, training, production | `js/buildings.js` (`Bld`) |
| Origin Cards → persona / boon / opening bias | `js/cards.js` (`Cards`) |
| Day tick that calls `AI.daily()`, start-package roll | `js/game.js` (`G`) |
| Difficulty knobs, unit/building stat tables | `js/config.js` (`CFG`) |
