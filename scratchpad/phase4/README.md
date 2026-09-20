# Phase 4 (balance) — work in progress, NOT shipped

This branch is a BACKUP, not a proposal. None of it has been through its
contracts and none of it belongs on main until it has. It exists because the
sandbox that produced it is ephemeral and the measurements were expensive.

## What is in the working diff

- `js/config.js` — CFG.MODES.moderate dials: aiEarly 0.75, aiRaidCdMult 1.35,
  aiVulnDay 25, aiHarass 12 + aiHarassLead 0, waveFirst 52; the Wonder priced
  at 6000 food / 6000 wood / 4000 stone / 1500 gold, WONDER.aiCostFrac 0.30
  (the rival's absolute wood bill stays 1800).
- `js/ai.js` — the famine valve in autoConvert (a starving chief spends its
  purse), spare hands scaling with the town in workTheLand, the raid-cadence
  multiplier, the vulnerability floor, the harassment lead, and the hunt
  column refusing to launch at peace. Also armyWant's ramp now reads
  m.aiRampDays.
- `js/combat.js` — aiRaidSeek walks a rival column home at peace instead of
  stabbing the first villager it meets, and its sapper/villager picks ask
  hostileUnits rather than a hand-rolled owner check (the militia-leak rule).
- `js/map.js` — MapGen.MTN_SEAT_R (8): no massif rises at either hall's door.
- `tests/moderate-dials.mjs` — new contract for the above.
- `tests/calm-peace.mjs` §6, `tests/wonder.mjs` — updated pins.

## What the harness measured

`balance-sim.mjs` is a fixed-step headless sim with a scripted player at four
skill levels (none / econ / basic / good). Run it as:

    node balance-sim.mjs <mode> <size> <style> <days> <seed,seed,...> <out.jsonl>
    SIM_OVER='CFG.MODES.moderate.aiArmyCap=8;' node balance-sim.mjs ...   # dial overrides
    SIM_ROOT=/path/to/other/checkout node balance-sim.mjs ...             # A/B a baseline

`sim-summary.py <file.jsonl> ...` prints outcome rates, first-raid day, hall
fall day and per-day trajectories.

### The state of the question when this was parked

The diagnosis held up: the first rival raid lands day 42-63 with ~5 soldiers
whatever the player does; harassment cuts the workforce before it arrives;
and 14 of 30 rivals starved with 250+ gold banked (the famine valve fixes
that — starving rivals 14 -> 4, day-50 rival army 2.6 -> 5.7).

The dial changes did NOT hit the target. Measured on 12-16 seeds:

    moderate/good    before  25% won / 58% lost     after  6% / 81%
    moderate/basic   before   0% won / 50% lost     after  0% / 69%

A softer exploration set (X1: armyCap 8, armyDiv 11, eliteShare 0.3, aggro
0.75, raidDay 60, raidCdMult 1.5, early 0.65) did not help either — the
competent rival swamps the softening. The last round (`sim-r2-*`) ran a
food-managing bot against base / current / F1 dials; F1 moved the hall-fall
median from 79 to 144 days on the good bot but the win rate did not follow.

The honest read is that the scripted bots are weaker than a human, so their
absolute win rates are not the target metric — the deltas are. That is the
thing to settle before tuning further.

Calm: 0 of 12 wins, 10 lost to the rival's Wonder at ~day 375, which is why
the Wonder price was cut. Highlands showed no generation fault (best-
provisioned seats, both halls always in the main walkable body); MTN_SEAT_R
is a stated hypothesis about the extruded art covering the town, not a
measured fix.

### Contracts NOT yet run against this diff

moderate-dials, calm-peace, wonder, rival-strength, worked-ground,
raider-camps, mountain, variants, island-maps, rival-crossing,
endgame-doom-ai, combined-arms, siege-progress, foe-notes, tutorial, and the
full sweep. rival-strength in particular measures raze counts that the raid
cadence multiplier may well move.
