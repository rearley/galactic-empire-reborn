# Test strategy — what we test, what we deliberately do not, and why

The suite exists to make CHANGE safe. Not to hit a number.

That distinction decides everything below. The stated goal is to reach a point
where the code can be optimised — restructured, made faster, made clearer —
**without changing what the game does**. A suite that proves lines execute does
not support that. A suite that pins observable behaviour does.

## Where we are

Recounted 2026-09-10 (second recount, same day) after the pre-refactor cleanup,
backend, 602 suites and 6,104 tests. Both numbers matter and only the second is
the bar:

| | |
|---|---|
| Raw branches | 83.9% |
| **Branches of COVERABLE** | **92.9%** |

Frontend, measured 2026-09-10: branches 90.8%, functions 94.2%, lines 87.5%,
310 tests.

### The recount is now a script, because doing it by hand kept moving

`backend/tools/classify-coverage.mjs`:

```
cd backend
npx jest --coverage --coverageReporters=json
node tools/classify-coverage.mjs
```

It reads each uncovered branch's source line and sorts it into this document's
own buckets. 626 backend branches are uncovered:

| | |
|---|---|
| Display and format fallbacks | 302 |
| Defensive early returns | 73 |
| Optional-dependency guards | 3 |
| **Real decisions** | **248** |

So the raw figure would read 93.6% with every real decision covered, and we sit
at 92.9% of what can be covered. **The pre-refactor bar is met in aggregate.**

The hand count was done twice and disagreed with itself both times. The first
version looked only for `??` and `catch` and overstated the real count by about
a third. The second still scored `const stack = err instanceof Error ? …` and
`if (owner === null) return` as real decisions, which put `planet-economy` at a
false 68.8% when every one of its twelve open branches is an error-logging
ternary or a null guard. Change the rules in the script rather than re-deriving
them, or the next recount will not be comparable with this one.

### Per module, against the bar

| module | raw | coverable | real left |
|---|---|---|---|
| `planet/planet-economy.service.ts` | 64.7 | **100** | 0 |
| `combat/firehp.ts` | 100 | **100** | 0 |
| `handlers/report.handler.ts` | 76.8 | **98.4** | 1 |
| `handlers/transfer.handler.ts` | 71.2 | **97.9** | 1 |
| `physics/physics-tick.service.ts` | 96.4 | **97.6** | 2 |
| `cybertron/cybertron-tick.service.ts` | 83.5 | **97.1** | 6 |
| `combat/combat-tick.service.ts` | 90.5 | **97.1** | 4 |
| `planet/planet-state.service.ts` | 87.6 | **96.8** | 3 |
| `handlers/scan.handler.ts` | 89.6 | **96.6** | 6 |
| `gateway/game.gateway.ts` | 85.6 | **95.4** | 15 |
| `droid/droid-tick.service.ts` | 76.9 | **95.2** | 4 |
| `handlers/new-ship.handler.ts` | 89.2 | **94.3** | 5 |

Every module previously named as under the bar now clears it. Note how far the
raw column misleads: `planet-economy` reads 64.7% and has nothing real left at
all, and `transfer.handler.ts` reads 71.2% at 97.9% of what is coverable.
Judging either by the raw figure would send someone to write tests for display
fallbacks.

### What is left is a long tail, not a hot spot

No file has more than 15 real decisions open, and the median is under five. The
concentrations that justified five-agent rounds are gone. The largest remaining
counts are `game.gateway.ts` (15, mostly transport plumbing rather than game
rules), `commands/messages.ts` (11) and `handlers/tea.handler.ts` (11). Further
work is worth doing opportunistically when touching a module, not as another
sweep.

Branches being well below lines is the signature of tests that walk the happy
path and confirm the code runs. Six defects were found by an evening of PLAY on
2026-09-09, not by 5,800 tests, and every one was a conditional no test entered:

- AI torpedoes had no lock check to branch on at all
- The torpedo gate tested speed where canon tests hyperspace
- `sys kill` filtered on a field AI ships do not carry
- `ren` dropped every argument after the first
- `loc B` self-matched on the caller's ship name
- `sys class` compared a class number against a count

A further three were found on 2026-09-10 by READING the three droid brains side
by side, which is the other thing coverage work is good for:

- a Garbage Scow that spotted a player never got the short reaction countdown
- a droid phaser shot that rounded to zero damage never spent the bank
- the droid hyper-phaser carried a minimum-damage gate `firehp` does not have

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

## The queue, as it stood before the four rounds

Kept as a record of where the effort went, not as work to do — every file below
is now at or above the bar. The tiering is the part worth reusing: combat
decisions first, because a wrong branch there costs a ship; then economy, where
credits and planets move; then physics and surfaces.

| tier | file | branch % then | missed then |
|---|---|---|---|
| 1 | `droid/droid-tick.service.ts` | 45.7 | 57 |
| 1 | `cybertron/cybertron-tick.service.ts` | 70.7 | 71 |
| 1 | `combat/combat-tick.service.ts` | 73.0 | 40 |
| 1 | `combat/firehp.ts` | 50.0 | 5 |
| 2 | `planet/planet-economy.service.ts` | 55.9 | 15 |
| 2 | `commands/handlers/transfer.handler.ts` | 57.6 | 28 |
| 2 | `commands/handlers/buy.handler.ts` | 66.7 | 12 |
| 2 | `commands/handlers/new-ship.handler.ts` | 66.7 | 31 |
| 2 | `commands/handlers/admin.handler.ts` | 76.5 | 19 |
| 2 | `planet/planet-state.service.ts` | 78.1 | 23 |
| 3 | `physics/physics-tick.service.ts` | 79.8 | — |
| 3 | `gateway/game.gateway.ts` | 74.7 | 93 |

The Droid tick was the worst gameplay file in the codebase and drives real
fights. The Cybertron half got attention on 2026-09-09; the Droid half did not,
which is how the torpedo lock guard added that day shipped with its Droid copy
untested — and how the three defects above survived until someone read it.

## What the suite cannot prove about itself, and what now guards it

A passing test proves the code matches the test. It does not prove the test is
right. Almost every spec here hardcodes its expected value — correctly, because
running one must not depend on reading C — which makes the citation beside that
number the only tether between it and canon. A wrong number with a wrong
citation goes green forever and then defends the invention against anyone who
tries to correct it.

Thirty-two specs are deliberately the other way and re-read the original at test
time. That category exists because hand-transcription has put wrong numbers into
this codebase twice, and it stays small on purpose.

Two guards close the difference, both in
`test/balance/canon-citations.balance.spec.ts`:

- **A quoted citation is checked against the original.** Where a comment quotes
  the line it cites — `@see GEMAIN.C:1977 \`#define MAXTIC\t20\`` — the guard
  finds that text within five lines of the cited line, whitespace ignored. It
  caught a citation reading `GEMAIN.C:963` for a define that lives at 1977 on
  its first run.
- **A NEW citation has to carry its quote.** Two ratchets working as a pincer:
  the count of quoted citations may not fall, and the count of bare ones may not
  rise. Adding `GECMDS.C:1234` alone fails; adding it with the line quoted
  passes. The 3,268 bare citations already in the tree are grandfathered and get
  quoted when someone touches them for another reason, because backfilling them
  by hand is the same error-prone transcription the guard exists to catch.

  This was added after the guard missed three wrong line numbers in a single
  commit — two pointing at a commented-out statement and a damage assignment,
  one at the print above the line it named. All three sat in prose with no
  quote, so nothing looked at them, and a person asking "are you sure?" found
  them instead.

  The honest limit stays: five lines of tolerance means a quoted citation proves
  the right NEIGHBOURHOOD, not the right line. Exact matching was measured and
  produced six false failures in forty-seven, because canon spaces its
  semicolons oddly and citations legitimately point at the head of a block.
- **A divergence must be a decision.** `@divergence <slug>` has to appear in
  both the code and `docs/DECISIONS.md`, checked both ways, and the prose people
  reach for when parking one instead of ruling on it is trapped. It found the
  `rep sys` phaser-readiness deviation, which had been sitting in a test
  docblock in words good enough to read like a decision had been taken.

## When play turns up a bug

The loop that found nine defects in two days, in order:

1. **Read canon first and quote the line.** Not the wiki, not memory, not the
   in-game help — the help states intent and the shipped configuration often
   does not implement it.
2. **Write the failing test before the fix,** through the caller rather than the
   helper, with the citation bound to a quote.
3. **Watch it fail for the right reason.** A test that passes on first run is
   testing something else.
4. **Mutation-check the fix** by breaking it deliberately and confirming the new
   test is what fails.
5. **If canon genuinely cannot answer, it is a decision** — record it in
   `DECISIONS.md` and tag both sides `@divergence`. It is not a comment.

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
   Do not do that split by hand — `backend/tools/classify-coverage.mjs` prints
   it per module, and the hand version came out different every time it was
   tried.
2. The behaviour should be pinned by CHARACTERIZATION tests — given this input
   state, assert the exact output state — not merely by "it does not throw".
3. The canon citations in that module's tests must still point at real C source
   lines. `test/balance/*` re-reads the original files and is the strongest
   asset here: it fails if a value drifts, whatever the code around it looks
   like.

Optimisation without those three is a rewrite with extra steps.
