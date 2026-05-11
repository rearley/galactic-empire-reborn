# Fidelity Audit v2 — Design

**Date:** 2026-05-11
**Author:** brainstorming session
**Target spec folder:** `specs/022-fidelity-audit-v2/`

## Problem

Playtest has been a reactive bug-fixing treadmill. Individual subsystems
look plausible in isolation, but composed behavior produces game-breaking
bugs: basic scanners revealed the whole map, AI ships fired from across
the universe, and in-memory ship state drifted from the DB row. Unit
tests pass; the game is wrong.

The 020 source-fidelity audit pass produced useful findings (F-001..F-008)
but was narrow. We need a deeper, structured pass focused on the
subsystems where range/scope/state-boundary bugs are concentrated, plus
a way to prevent re-drift.

## Goal

1. Find fidelity & state-management bugs proactively in four high-risk
   subsystems.
2. Pin the correct rules with an invariant test harness so future
   drift fails CI instead of being discovered by a player.
3. Fix all HIGH-severity findings inline. Defer MEDIUM/LOW with
   tracked dispositions.

## Scope

In scope (four subsystems):

- **Scanners & visibility** — scan command variants, scanner range vs
  scan type, what is visible at what distance, side-panel data, beacon
  emission.
- **AI targeting & engagement** — Cybertron + Droid: target acquisition
  range, weapon firing ranges, sector/visibility gating of targets,
  neutral-zone respect, escalation thresholds, fire decision logic.
- **Ship state persistence** — in-memory `ShipState` ↔ Postgres flush:
  field authority, flush triggers, reconnect/disconnect, ghost users,
  midnight job vs live state.
- **Combat ranges & weapons** — phasor, torpedo, missile, mine ranges;
  damage falloff; lock acquisition. Applies to player↔player as well as
  AI↔player.

Out of scope: UX/copy, frontend rendering, midnight job correctness,
mail, social commands, planet economy. Those get their own pass later.

Non-goal: subsystem rewrites. If a finding requires more than a
localized fix, file it and defer.

## Method (applied to each subsystem)

Five steps per subsystem:

1. **C source inventory** — every function, constant, and data field
   in `reference/ge-source/` that touches the subsystem. Cite file:line.
2. **TS surface inventory** — every TS module implementing it (handlers,
   services, types, gateway emissions).
3. **Side-by-side walk** — for each C rule, find the TS counterpart and
   record one of: `match` / `drift` / `missing` / `extra`. "Extra"
   (TS-only behavior) is recorded so it's conscious rather than accidental.
4. **File findings** — append to `findings.md` using the existing 020
   schema: `id, sourceRef, tsModule, severity, disposition, testRef, notes`.
   Severity: HIGH = exploitable / game-breaking; MEDIUM = wrong but
   bounded; LOW = cosmetic.
5. **Fix or defer** — HIGH fixed in this spec. MEDIUM/LOW filed with
   `deferred` disposition and a tracked follow-up.

The four walks are independent; tasks.md should mark them as
parallelizable for subagent-driven execution.

## Invariant harness

A small reusable utility that encodes rules as assertions and runs in
two modes:

- **Test mode** — invariants imported by Jest specs and asserted against
  fixtures + simulated tick states. Failure = red CI.
- **Dev-tick mode** — when `INVARIANTS_RUNTIME=1`, `TickService` invokes
  invariants against live state each physics tick and logs violations
  at warn level. Never throws. Off by default in prod.

Each invariant is a pure function `(world) => Violation[]` where
`Violation` carries `{ rule, sourceRef, detail, severity }`.

### Seed invariants

- `scanRangeMatchesScanType` — a sector scan reveals only sectors
  within the C-source range for that scan type.
- `weaponFireRangeRespected` — no combat event resolves with
  shooter↔target distance > weapon max range.
- `aiCannotFireAcrossMap` — AI fire events satisfy weapon range AND
  target was visible to the AI ship at acquisition time per the
  C-source visibility rules.
- `aiRespectsNeutralZone` — no AI fire event with target inside the
  neutral zone.
- `inMemoryShipMatchesDb` — after a flush, every persisted `ShipState`
  field equals the corresponding DB row.
- `noOrphanShipState` — every in-memory ship has a corresponding
  User+Ship row; no JWT-valid sessions without a User.

More invariants will be added during the walks.

## File layout

```
specs/022-fidelity-audit-v2/
  spec.md
  plan.md
  tasks.md
  findings.md

backend/src/game/invariants/
  harness.ts
  scanners.invariants.ts
  ai-targeting.invariants.ts
  ship-persistence.invariants.ts
  combat-ranges.invariants.ts

backend/test/invariants/
  scanners.spec.ts
  ai-targeting.spec.ts
  ship-persistence.spec.ts
  combat-ranges.spec.ts

backend/test/integration/
  invariants-tick.spec.ts

docs/
  PROGRESS.md                ← updated on completion
```

`docs/020-audit-findings.md` is left alone; this audit owns
`specs/022-fidelity-audit-v2/findings.md`.

## Order of operations

1. C-source inventory for all four subsystems (cheap, parallel).
2. Ship-state persistence walk **first** — it underpins the others; if
   memory↔DB drifts, downstream findings are unreliable.
3. Combat ranges walk next — defines the truth that AI targeting relies on.
4. AI targeting walk — leans on combat-range findings.
5. Scanners walk — last, since it's the most self-contained.
6. Build harness skeleton early so invariants can be added as walks
   surface rules.
7. Fix HIGH findings as they appear, not batched at the end.
8. Final validation: run a ~15-min dev playtest with
   `INVARIANTS_RUNTIME=1` and review the violations log.

## Acceptance

- `findings.md` exists with entries for all four subsystems, each row
  citing a C source location.
- Every HIGH finding has `disposition: fixed` and a `testRef`.
- Invariant harness exists with the seed invariants plus any added
  during walks; all green in CI.
- A dev playtest with `INVARIANTS_RUNTIME=1` produces zero unexplained
  violations.
- `docs/PROGRESS.md` updated.

## Risks

- **Walk scope creep.** Tempting to "just fix" a MEDIUM finding while
  reading the code. Discipline: HIGH inline, others deferred.
- **Invariant false positives.** Runtime invariants that fire on
  legitimate transient states (mid-flush, mid-tick) will train people
  to ignore the log. Each invariant must be defined on a stable
  observation point (post-tick, post-flush), not mid-mutation.
- **C-source ambiguity.** Where the C code itself is unclear, record the
  ambiguity in the finding rather than guessing. Cross-check against
  `reference/wiki/` if available.

## Next step

Hand off to `superpowers:writing-plans` to produce `plan.md` and
`tasks.md` under `specs/022-fidelity-audit-v2/`.
