# Implementation Plan: Planet Attack Commands

**Branch**: `014-planet-attack` | **Date**: 2026-05-07 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/014-planet-attack/spec.md`

## Summary

Land four commands from `GECMDS.C` that close out the planet/assault player
loop: `att` (planet attack with troops or fighters), `pln` (list owned
planets), `pri` (price quote at orbited planet), and the deferred password
gate on `mai` (maintenance) carried over from feature 013 as FR-210.

`att` is the headline deliverable — the primary endgame loop. It composes
two combat math paths (`attack_tro` inlined inside `cmd_attack`, and
`attack_fig`), an ownership-transfer step (`wonplnt`), a real-time
notification + spy-mail roll (`call_4_help`), and four planet-distress mail
types (`MESG02..MESG05`). All math, message ordering, and the documented
`/* there is a bug here */` ratio quirk in `attack_fig()` are reproduced
verbatim. Combat resolves under the per-planet mutex established in
feature 005's `PlanetStateService` so concurrent attackers serialize and
re-validate preconditions on lock acquisition.

`pln` is a read-only Postgres scan filtered by `userid`, sorted by `plnum`
ascending. `pri` reuses the full feature-005 buy precondition ladder and
emits a quote-only PRICE1 line — no cash debit, no inventory transfer. A
bare `pri` lists every sellable item at the orbited planet (matching the
`cmd_price` no-args loop).

**Ordering note (att handler)**: `ship.hostile = ship.where` and
`ship.cantexit = FIRETICKS` MUST be set BEFORE combat math runs (matching
`GECMDS.C cmd_attack` ordering at GECMDS.C:3567–3576), not after. This
locks the attacker in orbit for the duration of the resolution and is the
canonical sequence — failing to do this would let the attacker `warp` out
mid-combat in a way the original game disallows.

`mai` gets a five-line addition: when the orbited planet's `password` field
is not the literal `"none"`, the captain MUST supply a matching argument
(case-insensitive `sameas`) before the existing feature-013 maintenance
path runs. Without it, `MAINT2` (no arg) or `MAINT3` (wrong arg) is emitted
and no cash, hull, shield, or energy state changes.

Six combat coefficients (`PLATTRT1`, `PLATTRT2`, `PLATTRF1`, `PLATTRF2`,
`PLATTRF3`, `FIRETICKS`) are exposed as DI tokens following the
`CLOAK_ENERGY_USE` pattern from feature 013 so balance regression tests can
override them. PLATTR* defaults are sysop-tunable in the original
(`numopt(PLATTRx,5,1000)/100.0`); the canonical "factory" defaults
documented in `research.md` D2 are pinned by regression. `FIRETICKS = 10`
is canonical from `GEMAIN.H:138`.

No schema changes. The feature uses only existing tables — `Planet`,
`Ship`, `WarUser`, `MailStat` — and existing infrastructure: the
`PlanetStateService` per-planet mutex, the `user:${userid}` Socket.io room
from feature 012, the `MailStat` write path from feature 009, and the
`gernd()` randomness source from feature 006.

## Technical Context

**Language/Version**: TypeScript 5.x, Node 20.x (backend only — no frontend changes in this feature)
**Primary Dependencies**: NestJS 10, `@nestjs/platform-socket.io`, Prisma 5, Socket.io 4
**Storage**: PostgreSQL 16+ via Prisma — **no schema changes**. All reads/writes use existing `Planet`, `Ship`, `WarUser`, and `MailStat` tables.
**Testing**: Jest (backend); each handler gets a unit test plus a router dispatch test; combat math gets a deterministic-`gernd` trace test against the C reference; the `attack_fig` ratio bug gets a dedicated preservation test.
**Target Platform**: Linux server (backend)
**Project Type**: Web application — backend additions only
**Performance Goals**: `att` resolves and persists under the per-planet mutex within the 1 s ship-update tick budget. `pln` < 200 ms for a captain owning up to 50 planets in a 500-planet galaxy (SC-005). `pri` returns synchronously; no DB writes.
**Constraints**:
  - In-memory `PlanetStateService.Map<plnum, PlanetState>` is authoritative for planet items/owner (Constitution III). The per-planet mutex (introduced in feature 005) MUST serialize all `att`-driven mutations.
  - In-memory `ShipStateService.Map<shipId, ShipState>` is authoritative for ship cargo, `hostile`, `cantexit`, `userid` (Constitution III).
  - Real-time owner alert MUST go to the `user:${userid}` Socket.io room established in feature 012 — no new room types.
  - Mail writes MUST go through the existing `MailStat` write path used by `planet-economy.service.ts` (`MAIL_CLASS_DISTRESS = 1`). No new mail subsystem.
  - Strict TypeScript; no `any`.
  - All four commands MUST trace to identifiable lines in `GECMDS.C` (Constitution I); the `attack_fig` ratio quirk is intentionally preserved per spec FR-014-019 / SC-008.
  - No new gateway events — owner alert reuses `event.log`.
  - No new `@Interval` decorators or schedulers; combat is driven entirely by the command handler under the per-planet mutex (Constitution III).
**Scale/Scope**: Backend tests ~50+ (4 handler unit tests with multi-branch coverage; combat-math trace tests for troop and fighter paths; `attack_fig` bug preservation test; concurrent-attack lock test; spy-mail roll gate test; `pri` six-precondition ladder coverage; `mai` four password-state combinations; balance regression for the six DI defaults). 4 new handler files (one for each command, replacing the existing `maint.handler.ts` body in place). 6 new DI tokens in a new `attack.config.ts`. One new `_attack-constants.ts` module for compile-time values. No new Prisma migrations.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### I. Fidelity

- ✅ Each command traces to `GECMDS.C` with line anchors:
  - `att` → `cmd_attack` (GECMDS.C:3515), `attack_fig` (GECMDS.C:3788),
    `call_4_help` (GECMDS.C:3952), `wonplnt` (GECMDS.C:3996)
  - `pln` → `cmd_pln` (referenced from spec FR-014-040)
  - `pri` → `cmd_price` (GECMDS.C:4284)
  - `mai` (password gate) → `cmd_maint` (GECMDS.C:4452), MAINT2/MAINT3
    branches at GECMDS.C:4471 and 4479
- ✅ Combat math constants `PLATTRT1`, `PLATTRT2`, `PLATTRF1`, `PLATTRF2`,
  `PLATTRF3` are sysop-tunable in the original (loaded via
  `numopt(PLATTR*, 5, 1000) / 100.0` in `GEMAIN.C:532–548`), implemented as
  DI tokens following the `CLOAK_ENERGY_USE` pattern. Canonical default
  values pinned in `research.md` D2 with regression tests.
- ✅ `FIRETICKS = 10` preserved verbatim from `GEMAIN.H:138`. Same pattern
  applied to lock the attacker post-attack (`ship.cantexit = FIRETICKS`,
  `ship.hostile = ship.where`).
- ✅ Mail types `MESG02` (lost defenders, troop), `MESG03` (lost planet,
  troop), `MESG04` (lost defenders, fighter), `MESG05` (lost planet,
  fighter) exposed as `MessageId` enum values; mapped to message-template
  strings in `messages.ts`.
- ✅ The `attack_fig()` ratio quirk (`ratio = (left1/left2)*100` skipped
  when `left2 == 0`, leaving the ground-fire and item-destruction gates
  unreachable) is **intentionally preserved** per FR-014-019 and SC-008. A
  dedicated regression test asserts the bugged behavior — fixing it is a
  test failure.
- ✅ `gernd()` reused from feature 006 (`backend/src/game/combat/random.port.ts`).
  `rndm(N)` (uniform `[0, N)`) is added as a thin helper on the same port —
  trivial addition, no new infrastructure.
- ✅ Text command input is the primary interface — no UI buttons added.
- ✅ Tick cadence untouched (no scheduling-mechanism changes).
- ✅ The `mai` password gate uses the existing case-insensitive `sameas`
  helper from feature 003's command parsing layer — matching the source's
  `!sameas(plptr->password, margv[1])` comparison rule (spec edge case).

### II. Testing is First Class

- ✅ Unit tests: every handler gets a Jest unit test covering the happy
  path and every documented rejection branch. `att` coverage includes the
  not-in-orbit, ship-class `max_attk == 0`, wormhole, self-attack,
  insufficient-cargo, neutral-zone-zap, and combat-resolution branches for
  both troop and fighter paths.
- ✅ Combat math trace tests: with a deterministic `gernd` seed and a
  fixed planet/ship state, the post-combat numbers (`kill1`, `kill2`,
  `left1`, `left2`, items destroyed, `won` outcome) MUST match the
  reference C implementation exactly (SC-004).
- ✅ Bug-preservation test: `attack_fig` with `left2 == 0` (defenders had
  no fighters) MUST skip the ground-fire and item-destruction branches
  (SC-008). Test fails if someone "fixes" the bug.
- ✅ Concurrent-attack test: two simulated attackers acquire the
  per-planet mutex sequentially; the second re-validates preconditions
  against post-first-attack state and rejects via self-attack if the
  first capture transferred ownership to the first attacker (spec edge
  case).
- ✅ Spy-mail roll test: `call_4_help` with `send_spy_mail = true` queues
  spy mail iff `plptr->spyowner` is set AND (`won == 1` OR
  `gernd() % 6 == 0`).
- ✅ Owner-online alert test: when the `user:${userid}` room has a
  connected socket, an `event.log` is broadcast with planet/sector/
  attacker fields. Disconnect-race produces silent drop (FR/SC-002).
- ✅ Mail-path tests: each of the four `MESG02..MESG05` paths writes a
  `MailStat` row with `MAIL_CLASS_DISTRESS` and the documented payload
  fields (planet name, sector, attack quantity, attacker ship name,
  attacker userid).
- ✅ `pri` precondition-ladder test: every one of the six
  precondition-failure messages (BUY1/BUY7/BUY5/BUY4/BUY8/BUY3/BUY2) is
  asserted with the correct narration (SC-006).
- ✅ `pln` test: returns sorted-by-plnum rows for the calling captain;
  empty-state branch tested separately; no DB writes verified.
- ✅ `mai` password gate: four combinations tested (no arg / wrong arg /
  correct arg / planet password is `"none"`). Cash-unchanged assertion
  on rejection paths (SC-007).
- ✅ Balance regression: the six DI defaults
  (`PLATTRT1`, `PLATTRT2`, `PLATTRF1`, `PLATTRF2`, `PLATTRF3`,
  `FIRETICKS`) are asserted in regression tests that fail if any default
  changes.
- ✅ AI isolation: no Cybertron / Droid changes; existing AI tests
  remain valid.

### III. Architecture

- ✅ Backend: NestJS service handlers; no frontend changes in this
  feature.
- ✅ In-memory state: all planet mutations happen on
  `PlanetStateService.Map`; ship cargo and `hostile`/`cantexit` mutations
  happen on `ShipStateService.Map`. Both marked dirty for async flush.
- ✅ Per-planet mutex from feature 005's `PlanetStateService` is reused
  unchanged for serializing `att` resolution.
- ✅ Tick engine: untouched. `att` runs synchronously inside the command
  handler (under the mutex). No new tick callbacks.
- ✅ Real-time: owner alert reuses the existing `event.log` Socket.io
  event published to the `user:${userid}` room from feature 012. No new
  events, no new rooms.
- ✅ Calendar scheduling: untouched.

### IV. Quality

- ✅ TypeScript strict; no `any`. Combat math uses explicit `number` /
  `bigint` typing, with documented conversions at the C-source's
  `(unsigned long)` cast boundaries.
- ✅ JSDoc on every handler service references the canonical C function
  with line anchors; combat math helpers reference their `cmd_attack` /
  `attack_fig` line ranges.
- ✅ No Prisma migration in this feature — schema is unchanged.
- ✅ Docker Compose unaffected.
- ✅ CI must stay green.

**Result**: All gates pass. No `Complexity Tracking` entries required.

## Project Structure

### Documentation (this feature)

```text
specs/014-planet-attack/
├── plan.md              # This file (/speckit-plan)
├── research.md          # Phase 0 — DI defaults, mutex behavior, C-source line maps
├── data-model.md        # Phase 1 — entity field reference (no schema changes)
├── quickstart.md        # Phase 1 — end-to-end manual verification path
├── contracts/
│   ├── commands.md      # Command grammar, args, errors, events for att/pln/pri/mai
│   └── combat-math.md   # Troop/fighter math contract with C-source line refs
├── checklists/          # (existing, from /speckit-checklist if invoked)
└── tasks.md             # Phase 2 — created by /speckit-tasks
```

### Source Code (repository root)

```text
backend/
└── src/
    ├── game/
    │   ├── commands/
    │   │   ├── handlers/
    │   │   │   ├── attack.handler.ts          # NEW — `att` command
    │   │   │   ├── pln.handler.ts             # NEW — `pln` command
    │   │   │   ├── price.handler.ts           # NEW — `pri` command (renamed from any pre-existing stub)
    │   │   │   └── maint.handler.ts           # MODIFIED — adds password gate (FR-014-060/061/062)
    │   │   ├── _attack-constants.ts           # NEW — compile-time only: MESG02..05 ids, item-destruction range (0..14)
    │   │   ├── attack.config.ts               # NEW — six DI tokens: PLATTRT1, PLATTRT2, PLATTRF1, PLATTRF2, PLATTRF3, FIRETICKS
    │   │   └── commands.module.ts             # +3 providers, +3 registrations (att/pln/pri)
    │   ├── planet/
    │   │   ├── planet-attack.service.ts       # NEW — combat math (troop + fighter), under per-planet mutex
    │   │   ├── planet-attack.types.ts         # NEW — AttackOutcome, AttackKind enums
    │   │   ├── call-for-help.service.ts       # NEW — owner alert + spy-mail roll
    │   │   └── planet.module.ts               # +PlanetAttackService, +CallForHelpService providers
    │   └── combat/
    │       └── random.port.ts                 # MODIFIED — add rndm(N) uniform helper
    └── tests/
        └── game/
            ├── commands/handlers/
            │   ├── attack.handler.spec.ts             # NEW — orbit/self/wormhole/cargo/class gates
            │   ├── attack.dispatch.spec.ts            # NEW — CommandRouterService dispatches "att", "pln", "pri" to their respective handlers (matches *.dispatch.spec.ts pattern from features 011-013)
            │   ├── attack-troop-math.spec.ts          # NEW — deterministic-gernd trace test for troop combat
            │   ├── attack-fighter-math.spec.ts        # NEW — fighter math + the bug-preservation case
            │   ├── attack-concurrent.spec.ts          # NEW — per-planet mutex serialization
            │   ├── pln.handler.spec.ts                # NEW
            │   ├── price.handler.spec.ts              # NEW — six-precondition ladder
            │   └── maint-password.spec.ts             # NEW — four password-state combinations
            └── planet/
                ├── call-for-help.spec.ts              # NEW — alert + spy-mail roll combinations
                └── planet-attack-balance.spec.ts      # NEW — DI default regression
```

**Structure Decision**: Existing single-backend layout. No new modules; combat
math lives under `game/planet/` because it mutates planet state and uses the
planet mutex; the command handlers stay thin (precondition gating + delegation
to `PlanetAttackService`). No frontend changes; no Prisma migration.

**Consolidation note (non-blocking)**: `CallForHelpService` MAY be
implemented as a private method on `PlanetAttackService` rather than a
separate `@Injectable` if the implementation finds no other callers
(currently none planned outside the attack flow). In that case
`call-for-help.service.ts` is dropped from the file list above and the
`call-for-help.spec.ts` coverage is merged into
`attack-troop-math.spec.ts` and `attack-fighter-math.spec.ts` (each gets
its own owner-alert + spy-mail-roll cases for its branch). Decide at
implementation time based on how the math service shapes up; either
shape satisfies the constitution gates.

## Complexity Tracking

> No constitution violations. Section intentionally empty.
