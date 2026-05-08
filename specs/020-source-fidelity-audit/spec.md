# Feature Specification: Source Fidelity Audit

**Feature Branch**: `020-source-fidelity-audit`
**Created**: 2026-05-08
**Status**: Draft
**Input**: User description: "Systematic source-fidelity audit and fix pass. Identify behavioral differences between the C source and TypeScript implementation, then close them in the same pipeline run."

## Clarifications

### Session 2026-05-08

- Q: How is TS `randamage()` equivalence to the C source verified? → A: Golden-vector match against checked-in fixture of pre-computed C values
- Q: What payload schema does the beacon socket event carry? → A: C-source parity — `{ shipId, shipName, fromSector, toSector }`
- Q: What scopes "every documented option" in `User.options[]`? → A: Only options the C source actively reads in a command/tick path; unused bytes out of scope
- Q: How is scope capped if the audit surfaces gaps beyond the original 8? → A: Up to +2 additional HIGH/MEDIUM may be fixed; further findings are documented and deferred
- Q: What format do the manual smoke tests take? → A: Jest manual suite (`*.manual.spec.ts`, excluded from default `npm test`, runnable via `npm run test:manual`)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Combat behavior matches the original game (Priority: P1)

A returning player who remembers the original Galactic Empire combat feel
expects damage rolls, phaser reload behavior, and class-specific bonuses
(notably the Interceptor's preload bonus) to match the 1988-1992 game.
Today, divergences in `randamage()` and a missing Interceptor preload bonus
cause subtle balance drift that veterans will notice immediately.

**Why this priority**: Combat is the core loop. Any drift here propagates to
every PvP encounter, every Cybertron fight, and every balance test. Veteran
players' trust depends on this matching the C source exactly.

**Independent Test**: Run combat unit tests with seeded RNG and compare
damage distribution and reload progression to values derived directly from
GEFUNCS.C. Boot a ship and confirm Interceptor reload is faster than other
classes by the documented bonus.

**Acceptance Scenarios**:

1. **Given** a seeded RNG and identical inputs, **When** `randamage()` is
   invoked in the TS implementation, **Then** the output matches the C
   source implementation byte-for-byte across the test seed range.
2. **Given** an Interceptor-class ship taking damage, **When** the per-tick
   phaser reload is computed, **Then** it includes the class-specific
   preload bonus from GEFUNCS.C `checkdam`.
3. **Given** any other ship class, **When** the same reload is computed,
   **Then** the Interceptor bonus is NOT applied.

---

### User Story 2 - Wormholes behave authentically per sector (Priority: P1)

Wormholes in the original game have per-sector visibility — players see
them only when conditions are met. The current `ShipState` does not surface
the `GALWORM.visible` flag, so wormhole rendering and discovery diverge from
the original behavior.

**Why this priority**: Wormholes are a navigation primitive. Incorrect
visibility breaks exploration mechanics and the sector scan output.

**Independent Test**: With known galaxy fixtures, scan a sector containing
a wormhole under both visible and hidden states; the rendered scan output
must reflect the visible flag.

**Acceptance Scenarios**:

1. **Given** a wormhole with `visible=false`, **When** a player scans the
   sector, **Then** the wormhole is hidden from the scan output.
2. **Given** a wormhole with `visible=true`, **When** the same scan is
   performed, **Then** the wormhole is shown with its destination marker
   per the original C source rendering.

---

### User Story 3 - Scan output ordering matches the original terminal (Priority: P2)

The `scan lo full` side-panel ordering on the original terminal followed a
specific column/line sequence. Today's TS output may diverge, breaking
muscle memory for veterans who parse scan output visually.

**Why this priority**: Cosmetic but high-visibility. Veterans read scans
quickly via positional cues; reordering disrupts this.

**Independent Test**: Snapshot test the `scan lo full` output against a
reference layout extracted from the C source command handler.

**Acceptance Scenarios**:

1. **Given** a fixed game state, **When** `scan lo full` is executed,
   **Then** the side-panel field order matches the order emitted by the
   original C command handler.

---

### User Story 4 - Beacons announce ship movement (Priority: P2)

The original game emits a beacon message on movement (GEFUNCS.C:808). The
current implementation does not surface this as a socket event, so other
players miss the movement announcement that originally appeared in their
event log.

**Why this priority**: Affects the live multiplayer feel — the scrolling
event log is a defining part of the game.

**Independent Test**: Move a ship under conditions where a beacon should
fire; assert that subscribed clients receive a beacon socket event with
the documented payload.

**Acceptance Scenarios**:

1. **Given** ship A moves into a sector with players present, **When** the
   physics tick processes the movement, **Then** observing players receive
   a beacon event matching the C source emission.
2. **Given** movement under conditions that should NOT emit a beacon,
   **When** the tick processes movement, **Then** no beacon event is
   emitted.

---

### User Story 5 - User options fully covered by the `set` command (Priority: P2)

The original `User.options[]` array carries up to 30 bytes of per-player
preferences. The current `set` command coverage is partial. Players who
expect to toggle specific options inherited from the original game cannot
do so today.

**Why this priority**: Player customization is a quality-of-life concern.
Not gameplay-critical, but visible to anyone consulting original docs.

**Independent Test**: For each documented option in `User.options[]`,
confirm a corresponding `set` toggle exists and its persisted value
round-trips through login/logout.

**Acceptance Scenarios**:

1. **Given** the audited list of options from the C source, **When** the
   `set` command is enumerated, **Then** every option has a toggle.
2. **Given** a player toggles each option, **When** they reconnect,
   **Then** the option state persists.

---

### User Story 6 - Balance constants are pinned by tests (Priority: P1)

GEMAIN.H defines the canonical balance constants. Drift here silently
changes game feel. Today, not all of these constants are pinned by a
regression test.

**Why this priority**: Pins prevent silent regressions and make future
changes auditable.

**Independent Test**: Run the balance regression suite; mutating any
GEMAIN.H-derived constant in the TS code must fail at least one test.

**Acceptance Scenarios**:

1. **Given** the full set of GEMAIN.H gameplay constants, **When** the
   balance regression suite is executed, **Then** every constant has at
   least one test that fails if the constant is changed.

---

### User Story 7 - Manual quickstart smoke tests are runnable (Priority: P3)

Tasks T053, T043, T077 from prior features specify manual validations that
are not currently encoded as runnable scripts. They risk being skipped.

**Why this priority**: Process hygiene; non-blocking for gameplay.

**Independent Test**: A developer can execute the documented validation
suite from a single command and observe pass/fail.

**Acceptance Scenarios**:

1. **Given** a developer with a fresh checkout, **When** they run the
   manual validation entrypoint, **Then** each smoke test runs and reports
   pass/fail.

---

### Edge Cases

- A divergence is identified during the audit but classified LOW: the gap
  is recorded in `docs/020-audit-findings.md` and explicitly NOT fixed in
  this feature.
- A pre-existing test relies on the (incorrect) divergent behavior: the
  test is updated alongside the fix and the change is called out in the
  audit findings.
- A finding requires a schema or contract change beyond a constant or
  formula tweak: the finding is documented but deferred to a follow-up
  feature; no schema migrations are produced in this feature unless a
  HIGH severity gap absolutely requires it.
- The audit surfaces gaps not in the input list of 8: they are triaged
  using the same HIGH/MEDIUM/LOW rubric. Up to 2 additional HIGH or
  MEDIUM findings MAY be fixed in this feature; any further findings —
  regardless of severity — MUST be documented in
  `docs/020-audit-findings.md` and deferred to a follow-up feature.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The TS combat damage roll MUST match a checked-in golden
  fixture of pre-computed C `randamage()` outputs for a fixed input set;
  any divergence MUST be reconciled in this feature. The fixture is
  generated once from the C source and committed to the repo.
- **FR-002**: The phaser reload computation MUST apply the Interceptor
  class preload bonus per GEFUNCS.C `checkdam`, and only for that class.
- **FR-003**: Wormhole per-sector visibility MUST be represented in the
  in-memory ship/sector state and respected by scan rendering.
- **FR-004**: `scan lo full` output ordering MUST match the original C
  command handler's field/column ordering.
- **FR-005**: Ship movement MUST emit a beacon event to observing clients
  under the same conditions as GEFUNCS.C:808 in the original source. The
  event payload mirrors the C source emission and carries
  `{ shipId, shipName, fromSector, toSector }`.
- **FR-006**: Every option in the original `User.options[]` array that is
  actively read by the C source in a command or tick path MUST be
  toggleable via the `set` command and persisted. Bytes never read by the
  C source are out of scope. The audit produces the canonical list of
  in-scope options as part of this feature.
- **FR-007**: Every gameplay-affecting constant declared in GEMAIN.H MUST
  be covered by at least one balance regression test that fails if the
  constant changes.
- **FR-008**: The manual validation steps from T053, T043, and T077 MUST
  be encoded as a Jest manual suite (`*.manual.spec.ts` files), excluded
  from the default `npm test` run and invokable via a single
  `npm run test:manual` command.
- **FR-009**: Audit findings MUST be recorded — inline as code comments
  next to the fix or as `docs/020-audit-findings.md` when scope warrants
  prose.
- **FR-010**: Findings classified HIGH or MEDIUM MUST be fixed in this
  feature; LOW findings MUST be documented but not fixed.
- **FR-011**: All pre-existing tests MUST remain green; the net new test
  count MUST be tracked and reported in the feature's progress entry.
- **FR-012**: This feature MUST NOT introduce new commands, new game
  mechanics, or new UI features.

### Key Entities *(include if feature involves data)*

- **Audit Finding**: A recorded behavioral divergence between the C source
  and TS implementation. Attributes: source reference (file:line),
  affected TS module, severity (HIGH/MEDIUM/LOW), disposition
  (fixed/deferred), notes.
- **Balance Constant Pin**: A test assertion that ties a TS-side constant
  to its GEMAIN.H reference value, failing on drift.

## Success Criteria *(mandatory)*

- **SC-001**: 100% of the eight gaps listed in the input are triaged with
  a HIGH/MEDIUM/LOW disposition and either fixed or documented.
- **SC-002**: Every gap classified HIGH or MEDIUM has a corresponding
  passing test (unit, integration, or snapshot) that exercises the fixed
  behavior.
- **SC-003**: All pre-existing tests pass after the fix pass; CI is green.
- **SC-004**: The balance regression suite covers every gameplay constant
  declared in GEMAIN.H — verified by an enumeration test that fails if
  the GEMAIN.H constant set grows without a matching pin.
- **SC-005**: Audit findings are recorded — either inline at the fix site
  or in `docs/020-audit-findings.md` — with severity and disposition for
  every finding.
- **SC-006**: The manual smoke tests for T053, T043, T077 are runnable
  via a single documented command.
- **SC-007**: No new commands, mechanics, or UI features are introduced
  by this feature; the diff is limited to fidelity fixes, tests, and
  documentation.

## Assumptions

- The C source files in `/reference/ge-source/` are the canonical
  reference; where the wiki disagrees with the source, the source wins.
- "Equivalent to C `randamage()`" is verified via a golden-vector fixture:
  a checked-in table of (input, expected output) pairs generated from the
  C source. The TS implementation must reproduce every fixture entry
  exactly. Underlying RNG implementations need not be bit-identical so
  long as the fixture passes.
- `scan lo full` ordering is a snapshot/text comparison concern; minor
  whitespace normalization is acceptable as long as field order matches.
- Beacon emission follows the C source's gating conditions; the socket
  event payload schema is a fresh, internal contract — no backwards
  compatibility burden for external clients.
- "All GEMAIN.H constants" means gameplay-affecting constants. Pure
  buffer-size / I/O constants from the original C codebase are out of
  scope.
- LOW-severity findings deferred by this feature do not block any open
  issue or next planned feature in the sequence.

## Dependencies

- Prior features 001–019 are merged; in-memory ship state, scan command,
  combat math, set command, and tick engine all exist.
- The `reference/ge-source/` C source tree remains read-only and present
  in the working tree.
