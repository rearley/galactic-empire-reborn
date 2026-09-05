# docs/ — index

Start here. Each file below has one job; this page says which.

## "I want to know…"

| Question | Go to |
|----------|-------|
| **What is the canon value of X?** | Don't read a doc — run an extractor. `reference/README.md` has the three commands. |
| **What does the code do today?** | Don't read a doc — read the code. The table below says which file owns each kind of fact. |
| How does mechanic X work, and where is it in the C? | `GAME_MECHANICS.md` — one section per mechanic, each citing its C source |
| Why is the code like this? | `DECISIONS.md` — dated decisions with context, reasoning and rejected alternatives |
| Where does module X live, what does it own? | `ARCHITECTURE.md` |
| What fields does entity X have? | `DATA_MODEL.md`, but `prisma/schema.prisma` is the truth |
| What's been built, and what broke along the way? | `PROGRESS.md` — append-only session log, newest at the **bottom** |

## Single source of truth

A 2026-09-05 audit of every doc against the code found 115 real discrepancies.
**Almost every one was a doc restating a fact that already lives somewhere
authoritative** — 13 in `DATA_MODEL.md` restating the Prisma schema, 13 in
`ARCHITECTURE.md` restating the `src/` tree, and a long tail of constants
restating `.MSG` values. Prose copies of a machine-readable fact go stale in
exactly the way canon transcriptions do.

So: **docs point, they do not restate.** For each kind of fact there is one
owner, and a doc that repeats it is a bug waiting to happen.

| Kind of fact | Lives in | Docs may |
|---|---|---|
| A canon value (option, ship class, item table, message) | `reference/ge-upstream/mbmgemp/GE/REL/*.MSG`, via `tools/extract-*.mjs` | cite it with a `file:line`, never retype it |
| A canon algorithm | `reference/ge-source/*.C` | cite `FILE.C:line`, quote at most a line or two |
| A DB column | `backend/prisma/schema.prisma` | describe what it MEANS; never re-list types and defaults |
| A wire event shape | `backend/src/game/commands/command.types.ts` | name the event; never re-declare the interface |
| A module, class or file path | the `src/` tree itself | describe responsibility; keep names current or omit them |
| A tuned deviation | `backend/config/game.config.json` + a `DECISIONS.md` entry | explain the reasoning |

If a doc needs a number to make its point, cite where the number lives. If it
needs to be exact, there is a balance spec for that — a test re-reads the
original and fails on drift, which no paragraph can do.

**The docs themselves are now tested.**
`backend/test/balance/docs-truth.balance.spec.ts` fails the build when a doc:

- cites a `FILE.C:line` that does not exist,
- backticks a repo path that is not there,
- names a `*Service` / `*Handler` / `*Repository` the code does not have,
- or states what CANON ships and gets it wrong.

It is deliberately narrow. A broader check — every option name against its canon
default — was prototyped and produced 69 candidates that were almost all false:
documented deviations, digits caught from neighbouring option names, and
append-only entries correctly recording an old value. A noisy test gets
disabled, and a disabled test is worse than none. Each check that shipped runs
at zero false positives across the whole corpus, and each was verified to FAIL
on a deliberately broken doc before being trusted.

## The audit trail

All three audit reports are closed and have been removed; they remain in git
history. `FIDELITY_AUDIT.md` and `020-audit-findings.md` were superseded by the
full distribution arriving on 2026-09-02, and every finding in both is fixed.
`CANON_AUDIT_2026-09.md` — the 15-agent adversarial audit, 98 findings and seven
owner decisions — is closed in full; its durable conclusion is preserved as the
2026-09-05 entry in `DECISIONS.md`, because the conclusion outlives the findings.

`PROGRESS.md` still refers to all three by name. That is correct: it is an
append-only log and those entries record what was true when written.

## The two rules that generated most of this project's bugs

Both are in `CLAUDE.md` in full. In short:

**The classic game is the source of truth**, in the order C source → `.MSG` data
→ wiki. In-game help text states intent and is never authoritative for a number.

**Canon is generated and pinned, never hand-transcribed.** Every hand-copied
table here has drifted, and each drift hid behind a plausible comment asserting
that canon was unavailable:

> *"the `.cnf` files are not part of the reference source, so there is nothing to
> recover"* — `game-config.ts`, above 44 of 51 wrong option defaults
>
> *"there is no canonical figure to preserve, and the port must choose one"* —
> `pdammax.balance.spec.ts`, above a damage base and a distance exponent both
> set to a clamp bound

Where a value genuinely has no canon, say so **positively** and pin the absence
with a test. `BASEPRICE` is the worked example: `item-tables-canon.balance.spec.ts`
asserts that `MBMGEMSG.MSG` contains no `ITMPR` blocks, so if a fuller message
file ever surfaces, the test fails and tells us.

## Recurring defect shapes, so they are recognisable on sight

These accounted for most of what the audits found. Worth checking for whenever
you touch something:

- **One rule, two implementations.** The neutral zone, the buy gates, `land`,
  Cybertron steering, droid `scanRange`, and four private config loaders each
  held a second copy that drifted from the first. The fix is always to delete
  the duplicate, not to sync it.
- **A bound picked as a value.** `numopt(NAME,min,max)` clamps; it does not
  suggest. Errors ran in both directions, which is the fingerprint.
- **The test asserts the bug.** Written from the same misreading as the code, so
  it can never catch it. `speed2b === topspeed * 1000` *was* the overspeed
  defect, restated as an expectation.
- **A fixture that no longer exercises anything.** Phaser tests placed victims a
  full sector apart, which lands zero damage under canon falloff; a missile test
  fired 4% of a charge. Both passed while asserting nothing.
- **Questions the C never faced.** The original was single-threaded. A
  read-then-write that is safe in a BBS is a TOCTOU race in a websocket server —
  "faithful to the C" does not settle it.

## Keeping these current

`CLAUDE.md` requires updating `ARCHITECTURE.md`, `DECISIONS.md`, `PROGRESS.md`,
`DATA_MODEL.md` and `GAME_MECHANICS.md` at the end of every implementation
session. `PROGRESS.md` is append-only and chronological — add to the bottom.
