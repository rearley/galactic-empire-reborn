# Implementation Plan: Ship Management Commands

**Branch**: `013-ship-management` | **Date**: 2026-05-06 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/013-ship-management/spec.md`

## Summary

Land eight commands from `GECMDS.C` that govern individual ship management:
`cloak`, `maint`, `transfer`, `jettison`, `set`, `destruct`, `abort`, `abandon`.
All eight plug into the existing `CommandRouterService` pipeline (feature 003) and
follow the established `Command` / handler-service pattern. Two — `maint` and
`destruct` — interact with tick-engine systems (repair counter, countdown), and
two — `transfer` and `abandon` — are reinterpreted from their canonical C
semantics to fit the spec's scope (see `research.md` D1, D2).

The cloak command closes a known dead-code gap: four call sites already check
`ship.cloak === 10` (torpedo lock, report visibility, three Cybertron AI
branches) but no command flips that state today. `cloak on` enters the canonical
ramp (`cloak = 1` → `2` on next physics tick → `10` thereafter, draining
`CLENGUSE` per tick); `cloak off` resets to 0. Damage-induced negative cloak
states (`cloak < 0`) are out of scope here — they are produced only by
combat damage, not the player command.

`destruct` and `abort` use the existing `ShipState.destruct` field (already in
the schema) and a new `TickService` hook that decrements the counter every
physics tick (6 s) per `GEFUNCS.C:destruct`, broadcasts a per-tick warning to
the sector room, and triggers ship destruction when it hits zero.

`maint` repairs damage at a fixed planet-side cost (`MAINT5` formula:
`repair = damage/3 + 1`, cost `200` cr at a friendly planet, `2500` at a
neutral-zone Zygor planet) — the spec's "formula scaling with damage" wording is
reconciled to the canonical C formula (research.md D3).

`transfer` moves cargo or gold ship-to-ship in the same sector — a deviation
from the canonical ship-to-planet behavior (research.md D1). `abandon` releases
the captain from their current ship and routes them back through the
feature-011 onboarding flow — also a deviation from the canonical
abandon-a-colony semantics (research.md D2).

`jettison` matches canonical `cmd_jettison` exactly: `jett <amt|ALL> <itemkw>`
removes items with no recovery path. `set` toggles `auto-shield` and
`auto-repair` flags on the ship (a curated subset; the canonical options
[`scannames`, `scanhome`, `scanfull`, `filter`] live on the user account, not
the ship — research.md D4).

Two new `ShipState` fields (`autoShield: boolean`, `autoRepair: boolean`) are
added with a Prisma migration. No other schema changes.

## Technical Context

**Language/Version**: TypeScript 5.x, Node 20.x (backend only — no frontend changes in this feature)
**Primary Dependencies**: NestJS 10, `@nestjs/platform-socket.io`, Prisma 5, Socket.io 4
**Storage**: PostgreSQL 16+ via Prisma — one migration adds `Ship.autoShield` and `Ship.autoRepair` columns (both `Boolean @default(false)`); all other state already exists on `Ship` (`cloak`, `damage`, `destruct`, `repair`, `items`, `cantexit`)
**Testing**: Jest (backend); each handler gets a unit test plus a router dispatch test; tick-driven behavior (cloak ramp, cloak per-tick drain, destruct countdown) gets fake-timer integration tests
**Target Platform**: Linux server (backend)
**Project Type**: Web application — backend additions only
**Performance Goals**: Command response within 1 s under normal load; tick-driven cloak/destruct work within the existing 6 s physics tick budget
**Constraints**:
  - In-memory `ShipStateService.Map<shipId, ShipState>` is authoritative (Constitution III)
  - Tick cadence untouched — new `cloakTick()` and `destructTick()` callbacks invoked from the existing physics tick (`TickService`)
  - No `@Interval` decorators (Constitution III)
  - Strict TypeScript; no `any`
  - All eight commands MUST trace to identifiable lines in `GECMDS.C` (Constitution I); deviations enumerated in `research.md`
  - No new gateway events — all broadcasts reuse `event.log` and existing sector/global rooms
**Scale/Scope**: Backend tests ~44 (8 handler unit tests + ~4 additional `maint` rejection-path unit tests for FR-206/207/208/209 + dispatch integration + cloak-ramp tick test + destruct-countdown tick test + balance regression for the `CLOAK_ENERGY_USE` default, maintenance cost, `COUNTDOWN`); 8 new handler files; 2 new ShipState fields + 1 Prisma migration; 2 new tick callbacks; 1 new config provider (`cloak.config.ts`)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### I. Fidelity

- ✅ Each command traces to `GECMDS.C` with line anchors:
  - `cloak` → `cmd_cloak` (GECMDS.C:3188), `cloakstat` (GEFUNCS.C:1366)
  - `maint` → `cmd_maint` (GECMDS.C:4452); four orbit-gate rejection paths
    derived from this function are preserved verbatim as FR-206 (deep-space
    rejection), FR-207 (uninhabited / underpopulated planet), FR-208
    (combat-locked `cantexit > 0`), FR-209 (neutral-zone non-Zygor). The
    canonical password gate (MAINT2/MAINT3) is deferred — see research.md D3.
  - `transfer` → `cmd_transfer` (GECMDS.C:3271) — semantics reinterpreted, D1
  - `jettison` → `cmd_jettison` (GECMDS.C:6102), `jettison()` (GECMDS.C:6121)
  - `set` → `cmd_set` (GECMDS.C:5190) — option set deviates, D4
  - `destruct` → `cmd_destruct` (GECMDS.C:5025), `destruct()` (GEFUNCS.C:1820)
  - `abort` → `cmd_abort` (GECMDS.C:5044)
  - `abandon` → `cmd_abandon` (GECMDS.C:3420) — semantics reinterpreted, D2
- ✅ Constants preserved verbatim from `GEMAIN.H`:
  - `COUNTDOWN = 20` (destruct countdown initial value)
  - Cloak ramp values 1 → 2 → 10 from `cloakstat`
  - Maintenance prices `200` / `2500` from `cmd_maint`
- ✅ `CLENGUSE` (cloak energy use) is NOT a `GEMAIN.H` constant — it is
  declared in `GEGLOBAL.H:150` and loaded at `GEMAIN.C:519` as a
  sysop-tunable runtime option (`numopt(CLENGUSE,1,32000)`). Implemented as
  a NestJS config injection following the `CHGLOSER_PERCENT` pattern from
  feature 009: env var `CLOAK_ENERGY_USE` (default `50`, clamped to
  `1..32000`), exposed via a DI token `CLOAK_ENERGY_USE`. Balance regression
  pins the default. See research.md.
- ✅ Cloak indicator value `10` matches all four pre-existing call sites
  (`GEFUNCS.C:156`, `:165`, `:1717`, `:1722`).
- ✅ Text command input is the primary interface — no UI buttons added.
- ✅ Tick cadence untouched (no scheduling-mechanism changes).

Deviations are explicitly enumerated in `research.md` (D1, D2, D3, D4) per
Constitution I's "silence implies faithful reproduction" rule.

### II. Testing is First Class

- ✅ Unit tests: every handler gets a Jest unit test covering happy path,
  rejection paths (insufficient energy / cash / cargo, no active countdown,
  unknown option, etc.), and event emission.
- ✅ Integration test: dispatch through `CommandRouterService.dispatch()` for
  each keyword exercises the registration wiring and the unknown-keyword /
  insufficient-args branches.
- ✅ Tick integration tests with fake timers:
  - Cloak ramp 1 → 2 → 10 across two physics ticks per `cloakstat`
  - Cloak per-tick drain debits `CLENGUSE`; auto-decloak when energy insufficient
  - Destruct countdown decrements per physics tick; sector warning broadcast on
    initiation, every tick, and destruction
  - Destruct expiration at 0 destroys the ship and applies the score penalty
  - Abort clears the countdown and prevents destruction
- ✅ Atomicity test: `transfer` failure modes leave both source and target
  inventories unchanged (FR-305 / SC-003).
- ✅ Balance regression: named constants for `CLENGUSE`, `COUNTDOWN`,
  `MAINT_COST_NORMAL`, `MAINT_COST_NEUTRAL`, and the destruct score penalty
  asserted in regression tests that fail if values change.
- ✅ AI isolation: no Cybertron / Droid changes; existing AI tests remain valid.

### III. Architecture

- ✅ Backend: NestJS service handlers; no frontend in this feature.
- ✅ In-memory state: all per-tick mutations (cloak ramp/drain, destruct
  decrement) happen on `ShipStateService.Map`, marked dirty for async flush.
- ✅ Tick engine: cloak/destruct hooks invoked from the existing physics
  `TickService.physicsTick()` — no new schedulers.
- ✅ Real-time: all broadcasts reuse the existing `event.log` Socket.io event
  to sector or per-user rooms; no new gateway events introduced.
- ✅ Calendar scheduling: untouched.

### IV. Quality

- ✅ TypeScript strict; no `any`. New `ShipState` fields are explicit booleans.
- ✅ JSDoc on every handler service references the canonical C function with
  line anchors.
- ✅ Prisma migration is a new file; no existing migration is edited.
- ✅ Docker Compose unaffected.
- ✅ CI must stay green.

**Result**: All gates pass. No `Complexity Tracking` entries required.

## Project Structure

### Documentation (this feature)

```text
specs/013-ship-management/
├── plan.md              # This file (/speckit-plan)
├── research.md          # Phase 0 — deviation rationale and constant lookups
├── data-model.md        # Phase 1 — ShipState additions, Prisma migration
├── quickstart.md        # Phase 1 — end-to-end manual verification path
├── contracts/
│   ├── commands.md      # Command grammar, args, errors, events
│   └── tick-hooks.md    # cloakTick / destructTick contract
└── tasks.md             # Phase 2 — created by /speckit-tasks
```

### Source Code (repository root)

```text
backend/
├── prisma/
│   ├── schema.prisma                                    # +autoShield, +autoRepair
│   └── migrations/
│       └── 20260506xxxxxx_ship_auto_flags/migration.sql # NEW
└── src/
    ├── game/
    │   ├── commands/
    │   │   ├── handlers/
    │   │   │   ├── cloak.handler.ts          # NEW
    │   │   │   ├── maint.handler.ts          # NEW
    │   │   │   ├── transfer.handler.ts       # NEW
    │   │   │   ├── jettison.handler.ts       # NEW
    │   │   │   ├── set.handler.ts            # NEW
    │   │   │   ├── destruct.handler.ts       # NEW
    │   │   │   ├── abort.handler.ts          # NEW
    │   │   │   └── abandon.handler.ts        # NEW
    │   │   ├── _ship-management-constants.ts # NEW (compile-time only: COUNTDOWN=20, MAINT_COST_NORMAL=200, MAINT_COST_NEUTRAL=2500, cloak ramp 1→2→10) — CLENGUSE is NOT here; it is a DI token injected from env CLOAK_ENERGY_USE (default 50)
    │   │   ├── cloak.config.ts                # NEW (CLOAK_ENERGY_USE token + factory provider, mirrors midnight.config.ts pattern)
    │   │   └── commands.module.ts            # +8 providers, +8 registrations
    │   ├── ship/
    │   │   ├── ship-state.types.ts           # +autoShield, +autoRepair
    │   │   └── ship-state.mappers.ts         # map new fields
    │   └── tick/
    │       └── tick.service.ts               # +cloakTick, +destructTick calls
    └── tests/
        └── game/
            ├── commands/handlers/{cloak,maint,transfer,jettison,set,destruct,abort,abandon}.handler.spec.ts
            └── tick/{cloak-ramp,cloak-drain,destruct-countdown}.integration.spec.ts
```

**Structure Decision**: Existing single-backend layout. No new modules; everything
slots into `game/commands` and `game/tick`. Two ship-state fields are added
behind a Prisma migration; everything else lives in memory.

## Complexity Tracking

> No constitution violations. Section intentionally empty.
