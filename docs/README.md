# docs/ — index

Start here. Each file below has one job; this page says which.

## "I want to know…"

| Question | Go to |
|----------|-------|
| **What is the canon value of X?** | Don't read a doc — run an extractor. `reference/README.md` has the three commands. |
| How does mechanic X work, and where is it in the C? | `GAME_MECHANICS.md` — one section per mechanic, each citing its C source |
| Why is the code like this? | `DECISIONS.md` — dated decisions with context, reasoning and rejected alternatives |
| Where does module X live, what does it own? | `ARCHITECTURE.md` |
| What fields does entity X have? | `DATA_MODEL.md` |
| What's been built, and what broke along the way? | `PROGRESS.md` — append-only session log, newest at the **bottom** |
| Where does the port still diverge from the original? | `CANON_AUDIT_2026-09.md` — the current audit, 98 findings |
| What did earlier audits find? | `FIDELITY_AUDIT.md`, `020-audit-findings.md` — **superseded**, see below |

## The audit trail, in order

1. `FIDELITY_AUDIT.md` and `020-audit-findings.md` — earlier passes, done before
   the full original distribution was available. Their conclusions were drawn
   from the nine C files and the wiki, so anything they say about a **value**
   should be re-checked against `reference/ge-upstream/`. Their findings about
   **logic** still stand.
2. `CANON_AUDIT_2026-09.md` — current. A 15-agent adversarial audit against the
   full distribution, every finding independently re-verified. Section 5 is the
   ranked work order; the appendix lists all 98 findings by area.

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
