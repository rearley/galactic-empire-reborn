# Implementation Plan: Planet System

**Branch**: `005-planet-system` | **Date**: 2026-05-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/005-planet-system/spec.md`

## Summary

Turn the nameless planets that feature 004 generates into owned, named,
productive worlds. Five player stories: (P1) claim by `orbit` + `land`,
(P1) buy/sell at planet (galactic-market sell semantics — items leave the
universe), (P1) production tick that grows inventory and population,
(P2) owner admin (rates, markup, sell flag, reserve, tax, beacon, password,
withdraw), (P2) `report cargo` reading the real 14-slot ship hold deferred
from feature 003.

Architecturally: a new `PlanetStateService` that mirrors `ShipStateService`
in shape (in-memory `Map<key, PlanetState>` hydrated on boot) but writes
through to Postgres on every mutation rather than dirty-flushing on a tick
— per spec clarification, planet mutations are sparse and crash-safety is
maximal. A new third tick kind `PLANET_UPDATE` is added to `TickService`
with cadence derived at startup from `PLANTOCK / planetCount` (mirroring
`GEMAIN.C:656`) and processes one planet per firing in deterministic
round-robin order. Six new command handlers (`orbit`, `land`, `buy`, `sell`,
`admin`, `withdraw`) plus the `report cargo` body. `scan` continues to read
planet ownership/name through `GalaxyService`'s read model — no changes
there. The Prisma `Planet` model already has every field this feature
needs; **no schema migration is required**.

Out of scope: planetary defense / `check_spy()` (combat — feature 006);
production-report mail and end-of-day scoring (midnight job — feature 009);
`transfer` / `jettison` / `price` commands (deferred to a follow-up); UI
beyond plain command output (frontend — feature 010).

## Technical Context

**Language/Version**: TypeScript 5.x, Node 20.x (backend only — no frontend changes)
**Primary Dependencies**: NestJS 10, Prisma 5 (existing). No new runtime dependency.
**Storage**: PostgreSQL 16+ via Prisma. Existing `Planet` model unchanged.
**Testing**: Jest (backend) — unit + integration. No frontend tests (no frontend changes).
**Target Platform**: Linux server (NestJS process); single-process backend.
**Project Type**: Web application backend. `frontend/` is unmodified by this feature.
**Performance Goals**:
  - Buy/sell handler completes < 50 ms p95 including the synchronous Postgres write (single planet row + single ship row).
  - `PLANET_UPDATE` tick handler processes one planet in < 20 ms (one read of in-memory state, one write).
  - Boot hydration of all planets into the in-memory Map < 200 ms for the 100-300 planet envelope from feature 004.
**Constraints**:
  - Single-process backend → in-memory Map is authoritative; no leader-election needed (Constitution III).
  - All write paths (buy, sell, admin, withdraw, planet-update tick) MUST be serialized per planet to satisfy FR-013 / SC-005. Implementation uses an in-process per-planet promise chain ("async mutex" pattern) — no external lock service.
  - Per-mutation flush (FR-018 / Spec Q4): planet rows are written to Postgres synchronously in the same async function as the in-memory mutation. The `dirty` flag pattern from `ShipStateService` deliberately does NOT apply.
  - Planet-update cadence MUST be derived from `PLANTOCK` and the live planet count at startup; NOT hardcoded. Test target is the cadence formula, not a count.
  - `PLANET_UPDATE` tick uses raw `setInterval` (Constitution III) — added to `TickService` next to the existing two timers, not via `@nestjs/schedule`.
  - All schema-touch operations forbidden — this feature does not migrate the schema.
**Scale/Scope**: ~100-300 planets (envelope from feature 004 / G7). 14 items per planet × 6 numeric fields = 84 numeric values mutated by `multiply()` per planet per pass. New backend tests target ≥ 35 (state service: 5, tick: 6, command handlers: 14, integration: 8, balance regression: 4).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### I. Fidelity

- ✅ Production formula `multiply()` from `GEPLANET.C:195-333` ported field-for-field. Citations live in `data-model.md` and the new `PlanetTickService`'s JSDoc.
- ✅ Buy semantics from `GECMDS.C:4201-4350` — owner pays `baseprice`, non-owner pays `markup2a`, `tot` credits planet cash in full (no per-purchase tax skim), `items[].sell == 'Y'` gate enforced, neutral-zone exception (planet inventory NOT decremented) preserved.
- ✅ Sell semantics from `GECMDS.C:4103-4192` — galactic-market: items leave the universe, fee = `1 + doll/1000`, planet inventory and cash NOT modified. Sell only allowed in neutral zone at `plnum=1` (Zygor-3) per `GECMDS.C:4127`.
- ✅ Tax semantics from `GEPLANET.C:257, 282, 335-338` — population levy on the planet-update tick (`tax += taxrate/1200 * MEN.qty`), production penalty (`taxfact = 1 - taxrate/120`). NOT a per-purchase surcharge.
- ✅ Cadence formula `plantime = plantock / numrecs` mirrors `GEMAIN.C:656` (with the `< 4` floor preserved).
- ✅ Planet name buffer width 19 chars + null preserved from `GALPLNT.name[20]` (`GEMAIN.H:212`).
- ⚠ Documented deviation #1 — sell allowed at any neutral-zone planet's plnum=1 (the original game has only Zygor-3 there). Practically equivalent because feature 004's `s00` fixture places exactly one planet at plnum=1 in the neutral zone (Zygor-3). Recorded in research.md Decision 4.
- ⚠ Documented deviation #2 — the original game emits a production-report mail when an item crosses its max threshold (`GEPLANET.C:313-326`). This feature defers mail emission to feature 009 (midnight job + mail system). The state mutation itself (`temp = max`) is preserved exactly. Recorded in research.md Decision 5.
- ⚠ Documented deviation #3 — the original `multiply()` also runs revolt logic (`GEPLANET.C:341-...`) when troops < `tfact * men`. Revolt is intertwined with combat (planetary defenders, ownership flip) and depends on feature 006 to land cleanly. Deferred. Production, food consumption, men starvation, and tax accrual ARE in scope. Recorded in research.md Decision 6.
- ✅ All deviations are explicit, traceable, and bounded.

### II. Testing is First Class

- ✅ Unit tests:
  - `PlanetStateService` get/mutate/serialize behavior, hydration count.
  - `multiply()` formula — known population + rate + environ + resource → exact expected qty (uses `manhours[]`, `maxpl[]` constants).
  - Cadence formula `interval = floor(plantock / numrecs)` with the `< 4` floor.
  - Buy handler: owner price path, non-owner price path, reserve cap, capacity cap, sell-flag gate, neutral-zone exception, password gate, password "team" exception.
  - Sell handler: not-in-neutral-zone refusal, item-not-recognized refusal, fee calculation including the `if (doll-fee) < 0` clamp, ship-cargo-shortfall refusal, no-mutation of planet on success.
  - Admin handler: non-owner refusal, rate / markup / sell / reserve setters, tax setter, beacon, password.
  - `report cargo`: 14-line per-item readout, zero-suppressed line policy.
- ✅ Integration tests:
  - Boot → hydrate → buy from Zygor-3 → restart → verify ledger preserved (FR-018 / SC-004).
  - Two concurrent buys against same item — final state matches a serial replay (SC-005).
  - Planet-update tick fires; population grows per formula across N ticks (SC-006).
  - Zero-population planet stays at zero across 100 ticks (FR-017).
  - Round-robin completeness — N planets all touched within `plantock` simulated seconds.
  - Balance regression: NUMITEMS=14, PLANTOCK constant, `manhours[]` and `maxpl[]` per-item arrays pinned by tests that fail on any change (FR-028).
  - End-to-end via `CommandRouterService`: orbit → land → buy → report cargo → sell.
- ✅ Tick subscriber tests use the existing fake-clock pattern (Jest `useFakeTimers` against raw `setInterval` — Constitution III rationale #1 stays satisfied because the new tick is registered the same way as `PHYSICS` and `SHIP_UPDATE`).
- ❌ AI isolation / midnight idempotency — N/A (no AI; midnight job is feature 009).
- ✅ Test count target ≥ 35 new backend tests.

### III. Architecture

- ✅ Backend-only feature; no module relocation; new `PlanetModule` follows the same shape as `GalaxyModule` and `ShipModule`.
- ✅ In-memory state authoritative; Postgres durable; no Redis introduced.
- ✅ Scheduling: the new third tick (`PLANET_UPDATE`) is added to the existing `TickService` using raw `setInterval` in the same `OnModuleInit`/`OnModuleDestroy` block, alongside the existing two timers. No `@nestjs/schedule` use. Rationale: Constitution III's three reasons (Jest fake-timer compatibility, no-drift `setInterval` semantics, single-process safety) apply identically. The cadence is computed at boot from the planet count and the `PLANTOCK` constant, then passed into `setInterval`.
- ✅ Real-time / Socket.io: no new event types. Beacon visibility (FR-021) reuses the existing `scan` projection — no new push channel.
- ✅ Spec-Driven Development: this plan was produced by `/speckit-plan` after `/speckit-specify` + clarification round.

### IV. Quality

- ✅ Strict TypeScript; no `any`, no implicit types.
- ✅ Public service methods carry JSDoc anchors to original C source (`@see GEPLANET.C:multiply`, `@see GECMDS.C:cmd_buy`).
- ✅ No Prisma schema changes — no migration. The existing `Planet` model already exposes every field this feature needs (verified against `schema.prisma:196-255`).
- ✅ Docker Compose path unchanged.
- ✅ CI: existing Jest workflow auto-discovers new tests.

**Gate result: PASS.** Three documented fidelity deviations recorded in `research.md`. No Complexity Tracking rows required.

## Project Structure

### Documentation (this feature)

```text
specs/005-planet-system/
├── plan.md              # This file
├── spec.md              # Already produced (with clarifications)
├── research.md          # Phase 0 — produced by /speckit-plan
├── data-model.md        # Phase 1 — produced by /speckit-plan
├── quickstart.md        # Phase 1 — produced by /speckit-plan
├── contracts/           # Phase 1 — produced by /speckit-plan
│   ├── planet-state-service.md   # Public read/write interface + serialization guarantees
│   ├── planet-tick.md            # PLANET_UPDATE cadence + handler contract
│   └── commands.md               # orbit / land / buy / sell / admin / withdraw / report cargo
└── tasks.md             # Phase 2 — NOT created here (/speckit-tasks)
```

### Source Code (repository root)

```text
backend/
├── prisma/
│   ├── schema.prisma                           # ← UNCHANGED (Planet already complete)
│   └── migrations/                             # ← UNCHANGED
├── src/
│   ├── app.module.ts                           # ← register PlanetModule
│   ├── prisma/                                 # existing
│   ├── game/
│   │   ├── constants.ts                        # ← extend with PLANTOCK_SECONDS, PLANTIME_MIN_SECONDS
│   │   ├── constants/
│   │   │   └── items.ts                        # NEW — NUMITEMS, item indices, hardcoded
│   │   │                                       #    BASEPRICE/MANHOURS/MAXPL/ITEM_TONS arrays
│   │   │                                       #    (NOT env-configurable — research Decision 9)
│   │   ├── tick/
│   │   │   ├── tick.types.ts                   # ← add TickKind.PLANET_UPDATE + dynamic-interval support
│   │   │   └── tick.service.ts                 # ← add third setInterval; cadence injected at startup
│   │   ├── ship/                               # existing — no changes
│   │   ├── galaxy/                             # existing — read model is consumed by PlanetStateService
│   │   ├── commands/
│   │   │   ├── messages.ts                     # ← extend with ORBIT*, LAND*, BUY*, SELL*, ADM*, WTHDR*, REPCRG*
│   │   │   ├── commands.module.ts              # ← register new handlers
│   │   │   └── handlers/
│   │   │       ├── orbit.handler.ts            # NEW — cmd_orbit
│   │   │       ├── land.handler.ts             # NEW — cmd_land + name-on-claim flow
│   │   │       ├── buy.handler.ts              # NEW — cmd_buy
│   │   │       ├── sell.handler.ts             # NEW — cmd_sell
│   │   │       ├── admin.handler.ts            # NEW — cmd_admin (rate/markup/sell/reserve/tax/beacon/pwd)
│   │   │       ├── withdraw.handler.ts         # NEW — cmd_with (tax pool → ship cash)
│   │   │       └── report.handler.ts           # ← cargo body (replace TODO(005) placeholder)
│   │   └── planet/                             # NEW
│   │       ├── planet.module.ts
│   │       ├── planet-state.service.ts         # in-memory Map + per-planet async serializer + per-mutation flush
│   │       ├── planet-state.types.ts           # PlanetState, PlanetItem, planetKey
│   │       ├── planet-state.mappers.ts         # prismaPlanetToState / stateToPrismaUpdate
│   │       ├── planet-tick.service.ts          # PLANET_UPDATE handler — round-robin one-planet-per-tick
│   │       ├── planet-economy.ts               # PURE multiply() port + tax accrual; NO I/O.
│   │       │                                   #    Takes a snapshot, returns a new state delta.
│   │       │                                   #    PlanetStateService applies + flushes.
│   │       └── planet-trade.ts                 # PURE buy/sell math; NO I/O, NO mutation.
│   │                                           #    Returns a TradeOutcome (transferred qty,
│   │                                           #    unit price, fee, neutral-zone flag).
│   │                                           #    PlanetStateService consumes the outcome,
│   │                                           #    applies state changes, performs Postgres flush.
│   └── gateway/                                # existing — no changes
└── test/
    ├── unit/
    │   ├── planet-state.spec.ts                # NEW
    │   ├── planet-economy.spec.ts              # NEW (multiply + tax)
    │   ├── planet-tick-cadence.spec.ts         # NEW
    │   ├── planet-trade.spec.ts                # NEW (buy/sell math)
    │   ├── balance-planet.spec.ts              # NEW (regression for NUMITEMS, PLANTOCK, item arrays)
    │   └── handlers/
    │       ├── orbit.spec.ts                   # NEW
    │       ├── land.spec.ts                    # NEW
    │       ├── buy.spec.ts                     # NEW
    │       ├── sell.spec.ts                    # NEW
    │       ├── admin.spec.ts                   # NEW
    │       ├── withdraw.spec.ts                # NEW
    │       └── report-cargo.spec.ts            # NEW
    └── integration/
        ├── planet-bootstrap.spec.ts            # NEW — hydrate from Postgres on boot
        ├── planet-tick-roundrobin.spec.ts      # NEW — every planet visited within plantock window
        ├── planet-trade-persistence.spec.ts    # NEW — buy → restart → ledger preserved
        ├── planet-trade-concurrent.spec.ts     # NEW — two concurrent buys serialize correctly
        ├── planet-claim.spec.ts                # NEW — orbit → land → name → owner persists
        └── command-roundtrip-planet.spec.ts    # NEW — full text-command path

reference/
└── ge-source/                                  # READ-ONLY; consulted, never modified
```

**Structure Decision**: Web-application layout (Option 2) continued — no
frontend tree changes. The new `backend/src/game/planet/` module mirrors
the shape of `backend/src/game/ship/` so two files inside it
(`planet-state.service.ts`, `planet-state.types.ts`) read like familiar
companions to the ship equivalents. `planet-economy.ts` and
`planet-trade.ts` are intentionally framework-free pure-math modules —
exhaustively unit-testable in isolation, the same approach used for the
RNG and config in feature 004.

## Complexity Tracking

> No Constitution Check violations. Section intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| _(none)_  |            |                                     |
