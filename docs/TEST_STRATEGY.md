# Test strategy — what we test, what we deliberately do not, and why

The suite exists to make CHANGE safe. Not to hit a number.

That distinction decides everything below. The stated goal is to reach a point
where the code can be optimised — restructured, made faster, made clearer —
**without changing what the game does**. A suite that proves lines execute does
not support that. A suite that pins observable behaviour does.

## Where we are

Recounted 2026-09-10 after four rounds of work, backend, 596 suites and 6,073
tests. Both numbers matter and only the second is the bar:

| | |
|---|---|
| Raw branches | 82.6% |
| **Branches of COVERABLE** | **90.0%** |
| Lines | 95.6% |
| Functions | 91.9% |

Frontend, measured for the first time on the same day: branches 90.8%, functions
94.2%, lines 87.5%, 310 tests.

### The recount, and how to repeat it

702 backend branches are uncovered. Classified against this document's own
exclusions:

| | |
|---|---|
| Display and format fallbacks | 297 |
| Defensive early returns | 31 |
| Optional-dependency guards | 3 |
| **Real decisions** | **269** |

So the coverable ceiling is 91.8% and we sit at 90.0% of it. **The pre-refactor
bar is met in aggregate.**

Reproduce with `jest --coverage --coverageReporters=json`, then walk
`coverage-final.json`, take each uncovered branch's `branchMap[id].loc.start.line`,
read that source line, and classify it. A crude classifier that only looks for
`??` and `catch` will overstate the real count by roughly a third — it misses
`if (!x) return` and `if (this.optionalDep)`, which this document also excludes.

### Per module, against the bar

| module | raw | coverable | real left |
|---|---|---|---|
| `combat/firehp.ts` | 100 | **100** | 0 |
| `handlers/report.handler.ts` | 76.8 | **98.4** | 1 |
| `planet/planet-state.service.ts` | 87.6 | **96.8** | 3 |
| `handlers/scan.handler.ts` | 89.6 | **96.1** | 7 |
| `cybertron/cybertron-tick.service.ts` | 83.5 | **95.8** | 6 |
| `combat/combat-tick.service.ts` | 90.5 | **95.7** | 4 |
| `handlers/transfer.handler.ts` | 71.2 | **94.0** | 3 |
| `handlers/new-ship.handler.ts` | 89.2 | **93.3** | 5 |
| `gateway/game.gateway.ts` | 85.8 | **92.9** | 18 |
| `droid/droid-tick.service.ts` | 76.2 | 89.9 | 8 |
| `physics/physics-tick.service.ts` | 85.7 | 86.7 | 8 |
| `planet/planet-economy.service.ts` | 64.7 | 81.5 | 2 |

Note how far the raw column misleads. `transfer.handler.ts` reads 71.2% and is
actually at 94% of what can be covered; `report.handler.ts` reads 76.8% and has
exactly one real decision left. Judging either by the raw figure would send
someone to write tests for display fallbacks.

### What is left is a long tail, not a hot spot

No file has more than 18 real decisions open, and the median is under five. The
concentrations that justified five-agent rounds are gone. Further work is
~7 branches each across ~30 files, with falling returns — worth doing
opportunistically when touching a module, not as another sweep.

The three modules still under the bar are `droid-tick` (89.9), `physics-tick`
(86.7) and `planet-economy` (81.5). Those are the ones to finish before
restructuring anything in them.

Branches being fifteen points below lines is the signature of tests that walk
the happy path and confirm the code runs. Six defects were found by an evening
of PLAY on 2026-09-09, not by 5,800 tests, and every one was a conditional no
test entered:

- AI torpedoes had no lock check to branch on at all
- The torpedo gate tested speed where canon tests hyperspace
- `sys kill` filtered on a field AI ships do not carry
- `ren` dropped every argument after the first
- `loc B` self-matched on the caller's ship name
- `sys class` compared a class number against a count

That list is the argument for this document.

## The filter

**Would a wrong answer on this branch cost a player a ship, a planet, or
credits?**

If yes, it needs a test. If no, leave it uncovered and honest. A coverage target
pushes effort toward whatever is cheapest to cover, which is exactly the code
where being wrong costs nothing.

## What we deliberately do not test

Recorded so the gap is a decision rather than an oversight, and so nobody
"improves" the number by filling it.

- **Display fallbacks.** Every `cls?.maxTons ?? '?'` is a branch. `rep wpns`
  alone contributes fourteen in one block. They fire only when a ship's class is
  missing from the cache, which is unreachable in practice and cosmetic if it
  ever happens.
- **Debug controllers.** They read 0% because Jest cannot see them. Four
  Playwright specs exercise them; that is the right layer.
- **Config modules.** `droid.config.ts`, `cybertron.config.ts` and similar are
  option plumbing already pinned by the balance specs, which re-read the
  original `.MSG` files.
- **Defensive early returns** guarding states the type system already prevents.

## The queue, in risk order

### Tier 1 — combat decisions, where a wrong branch costs a ship

| file | branch % | missed |
|---|---|---|
| `droid/droid-tick.service.ts` | 45.7 | 57 |
| `cybertron/cybertron-tick.service.ts` | 70.7 | 71 |
| `combat/combat-tick.service.ts` | 73.0 | 40 |
| `combat/firehp.ts` | 50.0 | 5 |

The Droid tick is the worst gameplay file in the codebase and drives real
fights. The Cybertron half got attention on 2026-09-09; the Droid half did not,
which is how the torpedo lock guard added that day shipped with its Droid copy
untested.

### Tier 2 — economy, where credits and planets move

| file | branch % | missed |
|---|---|---|
| `planet/planet-economy.service.ts` | 55.9 | 15 |
| `commands/handlers/transfer.handler.ts` | 57.6 | 28 |
| `commands/handlers/buy.handler.ts` | 66.7 | 12 |
| `commands/handlers/new-ship.handler.ts` | 66.7 | 31 |
| `commands/handlers/admin.handler.ts` | 76.5 | 19 |
| `planet/planet-state.service.ts` | 78.1 | 23 |

### Tier 3 — physics and surfaces

`physics/physics-tick.service.ts` (79.8), `gateway/game.gateway.ts` (74.7, and
the largest absolute gap at 93 branches, though much of it is transport
plumbing rather than game rules).

## The rule that would have caught most of 2026-09-09

**Test the caller's arithmetic, not the function's.** Three of the six defects
survived because a unit test exercised a helper with values no caller passes:

- `sysClassIsValid(34, 34)` used canon's slot count; the caller passes 18
- `lock.spec.ts` ran every case with an empty scan table, so no test ever put a
  letter through the handler
- `flux-rescues-cloak` registered a STUB at the flux position, so it could not
  prove the real service was registered there

Where a helper and its caller can disagree, there must be a test that goes
through the caller.

## For the refactoring work this is building toward

Optimisation must not change behaviour, so before restructuring a module:

1. Its branch coverage should be at or above 90% **of its COVERABLE branches**,
   not of its raw total.

   This distinction was got wrong first time and is worth stating precisely. A
   module's excluded branches — the `??` fallbacks, the optional-dependency
   guards, the catch-block log ternaries — still count in the denominator
   Istanbul reports. `droid-tick.service.ts` has 105 branches of which 12 are
   excludable, so its raw ceiling is 88.6% even with every real decision
   covered. Chasing a raw 90% there means testing display fallbacks to buy
   percentage points, which is the exact behaviour the filter exists to stop.

   Measure it as `(total - excludable - uncovered_real) / (total - excludable)`.
   To find the split, run coverage with the `json` reporter and classify each
   uncovered branch line by reading its source line.
2. The behaviour should be pinned by CHARACTERIZATION tests — given this input
   state, assert the exact output state — not merely by "it does not throw".
3. The canon citations in that module's tests must still point at real C source
   lines. `test/balance/*` re-reads the original files and is the strongest
   asset here: it fails if a value drifts, whatever the code around it looks
   like.

Optimisation without those three is a rewrite with extra steps.
