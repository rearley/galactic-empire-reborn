# Data Model — Source Fidelity Audit

This feature is primarily a fix-and-pin pass. It introduces no new
persistent entities and (absent a forced HIGH finding) no Prisma
migrations. It does introduce two **process** entities and one
in-memory state field.

## Entity: Audit Finding (process artifact)

A recorded behavioral divergence between the C source and the TS
implementation. Stored in `docs/020-audit-findings.md`, one entry per
finding.

| Field | Type | Notes |
|---|---|---|
| id | string | `F-001`, `F-002`, … assigned in document order |
| sourceRef | string | C source reference, e.g. `GEFUNCS.C:1956` |
| tsModule | string | TS site, e.g. `backend/src/game/combat/combat-math.ts` |
| severity | enum | `HIGH` \| `MEDIUM` \| `LOW` |
| disposition | enum | `fixed` \| `deferred` |
| testRef | string \| null | Path to the regression test if `fixed`; `null` if `deferred` |
| notes | string | One-paragraph explanation, including any deviation rationale |

**Validation rules**:
- A finding with `disposition=fixed` MUST have a non-null `testRef` (SC-002).
- A finding with `severity ∈ {HIGH, MEDIUM}` MUST have `disposition=fixed`,
  unless it is one of the deferred surplus findings beyond the +2 cap from
  spec edge case 4.
- A finding with `severity=LOW` MUST have `disposition=deferred` (FR-010).

## Entity: Balance Constant Pin (test artifact)

A `(constantName, expectedValue, sourceRef)` triple expressed in the
balance regression suite.

| Field | Type | Notes |
|---|---|---|
| name | string | e.g. `TICKTIME`, `PRELOAD`, `MAXX` |
| expectedValue | number | Value as declared in `GEMAIN.H` |
| sourceRef | string | `GEMAIN.H:<line>` |

**Validation rules**:
- The set of pins MUST equal the set of gameplay-affecting `#define`s in
  GEMAIN.H. The enumeration test fails if either side has an entry the
  other lacks (FR-007, SC-004).
- "Gameplay-affecting" excludes pure I/O / buffer-size constants — the
  exclusion list is hard-coded in the enumeration test header and
  comment-justified per entry.

## In-memory state addition: `Wormhole.visible`

Added to the in-memory wormhole record consumed by the scan renderer.

| Field | Type | Notes |
|---|---|---|
| visible | boolean | Mirrors `GALWORM.visible` (`GEMAIN.H:473`). Defaults to `true` if a fixture omits it (backward-compat). |

State transitions: out of scope for this feature — the field is read but
not mutated by any new code path. Mutation (e.g., discovery flips from
hidden → visible) is reserved for a future feature.

## No schema changes

No Prisma schema or migration changes are anticipated. If the audit
surfaces a HIGH finding that requires one, it is added as a new
immutable migration per Principle IV; the rationale is recorded in the
finding's `notes`.
