# Test strategy — what we test, what we deliberately do not, and why

The suite exists to make CHANGE safe. Not to hit a number.

That distinction decides everything below. The stated goal is to reach a point
where the code can be optimised — restructured, made faster, made clearer —
**without changing what the game does**. A suite that proves lines execute does
not support that. A suite that pins observable behaviour does.

## Where we are

Measured 2026-09-10, backend, 578 suites and 5,808 tests:

| | |
|---|---|
| Lines | 92.5% |
| Statements | 91.4% |
| Functions | 89.9% |
| Branches | **76.5%** |

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

1. Its branch coverage should be at or above 90%, by the filter above.
2. The behaviour should be pinned by CHARACTERIZATION tests — given this input
   state, assert the exact output state — not merely by "it does not throw".
3. The canon citations in that module's tests must still point at real C source
   lines. `test/balance/*` re-reads the original files and is the strongest
   asset here: it fails if a value drifts, whatever the code around it looks
   like.

Optimisation without those three is a rewrite with extra steps.
