# Implementation Plan: Galaxy Generator

**Branch**: `004-galaxy-generator` | **Date**: 2026-05-01 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-galaxy-generator/spec.md`

## Summary

Generate the persistent 30×15 sector galaxy on first boot — sectors, planets,
and wormholes — driven by a seedable PRNG, faithful to `GEPLANET.C:xgetsector`
(lines 455-650) and the source's `plodds` / `wormodds` / `maxplanets` knobs.
The neutral zone at `(0,0)` is populated from a hand-authored `s00` fixture
(the original loaded an equivalent table from a missing `.MSG` config) with
`Zygor-3` at `plnum=1`. Generation runs synchronously inside one Postgres
transaction in `GalaxyService.onModuleInit`; a singleton `GalaxyMeta` row is
the last write of that transaction and the sole boot-time signal that the
world is fully built. Subsequent boots see the meta row, skip generation
entirely, and hydrate an in-memory read model from Prisma.

The same feature lands the deferred `TODO(004)` markers from feature 003's
`scan.handler.ts`: `scan lo` projects planets (`'O'`) and wormholes (`'W'`)
into the tactical grid, and `scan pl <name>` resolves named planets via the
new `GalaxyService.findPlanetByName`. Out of scope: planet mutation /
colonization (feature 005), AI placement (007/008), combat against planets
(006).

## Technical Context

**Language/Version**: TypeScript 5.x, Node 20.x (backend only — no frontend changes)
**Primary Dependencies**: NestJS 10, Prisma 5 (existing). No new runtime dependency.
**Storage**: PostgreSQL 16+ via Prisma. New table: `GalaxyMeta` (singleton). Existing: `Sector`, `Planet`, `Wormhole`.
**Testing**: Jest (backend) — unit + integration. No frontend tests (no frontend changes).
**Target Platform**: Linux server (NestJS process); generator runs only on backend boot.
**Project Type**: Web application backend. `frontend/` is unmodified by this feature.
**Performance Goals**: Generation completes in < 1 s on a fresh DB (450 sector inserts + ~200 planets + ~25 wormholes + meta row in one transaction). Idempotent boot (skip path) completes in < 100 ms including read-model hydration.
**Constraints**:
  - Single-process backend → raw `setInterval` and module-init hooks are safe (Constitution III). No leader election needed.
  - Generator MUST be deterministic given a seed (FR-005, SC-003) — fixed iteration order, single shared RNG instance.
  - Atomic generation in one Postgres transaction (FR-012); no partial-galaxy intermediate state visible to gameplay.
  - Out-of-range tunables MUST throw on init, not silently clamp (FR-006a).
  - In-memory read model is authoritative for read paths (FR-009); Postgres is the durable source of truth.
  - All schema changes via NEW Prisma migration files only (Constitution IV).
**Scale/Scope**: Galaxy is small and bounded — 450 sectors, ~200 planets, ~25 wormholes. The whole read model fits comfortably in memory. New backend tests target ≥ 25 (config: 6, RNG: 3, service: 6, scan handler extension: 4, integration: 6+).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### I. Fidelity

- ✅ Generator algorithm follows `GEPLANET.C:xgetsector` (455-650) field-by-field
  for both origin (`s00`) and non-origin paths. Citations in `data-model.md`.
- ✅ Balance constants (`MAXX=30`, `MAXY=15`, `MAXPLANETS=9`, `SECTYPE_NORMAL=1`,
  `PLTYPE_PLNT=2`, `PLTYPE_WORM=3`) preserved exactly from `GEMAIN.H:121-207`.
- ✅ Tunables (`plodds`, `wormodds`, `maxplanets`) accept the source's
  `numopt` legal ranges (1..20, 1..100, 1..9 — `GEFUNCS.C` numopt validators).
- ⚠ Documented deviation #1 — wormhole destinations bounded to grid, not
  `[-univmax..+univmax]` (`GEPLANET.C:642-643`). Justified in spec Q4 and
  `research.md` Decision 5.
- ⚠ Documented deviation #2 — `scan pl <name>` resolves by planet name
  galaxy-wide, not by numeric `plnum` in the current sector
  (`GECMDS.C:2295`). Justified in spec Q1 / FR-010 and `research.md`
  Decision 8.
- ⚠ Documented deviation #3 — origin `s00` table authored in code, not
  loaded from `.MSG` (file unrecoverable). Justified in spec Q2 and
  `research.md` Decision 4. Treated as a fidelity fixture.
- ✅ All deviations are explicit, traceable, and bounded — no silent drift.

### II. Testing is First Class

- ✅ Unit tests: config validation (`G6`), RNG determinism, `GalaxyService`
  read methods (`G9`, `G10`), scan handler planet/wormhole projection.
- ✅ Integration tests: bootstrap (`G1`), determinism (`G2`, `G3`),
  idempotency + crash-rollback (`G4`, `G5`), balance regression (`G7`),
  wormhole bounds (`G8`), config divergence WARN line.
- ✅ Balance regression tests pin (a) the legal `numopt` ranges of all three
  tunables — fail if a constant changes, (b) the `[100..300]` planet and
  `[10..40]` wormhole envelope at default seed (`G7`).
- ✅ Generator runs in unit tests via in-memory PrismaClient against a test
  database (existing pattern from features 001-003); fake clocks not needed
  because no `setInterval` is involved in this feature.
- ❌ AI isolation / midnight idempotency — N/A (no AI, no midnight job).
- ✅ Test count target ≥ 25 new backend tests (per Technical Context).

### III. Architecture

- ✅ Backend-only feature; no NestJS module, scheduling, or transport
  changes that would require constitutional review. Pure addition of one
  module (`GalaxyModule`).
- ✅ Postgres is the durable store; in-memory read model in `GalaxyService`
  is the runtime source of truth — same pattern as `ShipStateService`. No
  Redis introduced.
- ✅ No `setInterval` and no `@nestjs/schedule` use in this feature —
  generation is a one-shot `onModuleInit` operation. The constitution's
  scheduling rules apply only to recurring work; bootstrap fits neither
  cadence kind and uses the standard NestJS lifecycle hook.
- ✅ Real-time / Socket.io: no new events. `scan` handler is extended in
  place; existing `command` / `command:result` contract from feature 003
  is unchanged.
- ✅ Spec-Driven Development: this plan was produced by `/speckit-plan`
  after `/speckit-specify` + `/speckit-clarify` rounds. Tasks step is next.

### IV. Quality

- ✅ Strict TypeScript across new code; matches existing `tsconfig`. No
  `any`, no implicit types.
- ✅ Public service methods (`GalaxyService.*`) carry JSDoc anchors to the
  original C source where applicable (`@see GEPLANET.C:xgetsector`).
- ✅ Schema delta added via a single new migration
  (`add_galaxy_meta`); prior migrations untouched.
- ✅ Docker Compose path unchanged — no new infra.
- ✅ CI: existing Jest workflow auto-discovers new tests; no new pipeline
  needed.

**Gate result: PASS.** Three documented deviations are recorded above and
re-cited in `research.md`. No Complexity Tracking rows required.

## Project Structure

### Documentation (this feature)

```text
specs/004-galaxy-generator/
├── plan.md              # This file
├── spec.md              # Already produced (with clarifications)
├── research.md          # Phase 0 — produced by /speckit-plan
├── data-model.md        # Phase 1 — produced by /speckit-plan
├── quickstart.md        # Phase 1 — produced by /speckit-plan
├── contracts/           # Phase 1 — produced by /speckit-plan
│   ├── galaxy-service.md      # Public read interface + behavioural guarantees
│   ├── galaxy-config.md       # Env-var surface and validation rules
│   └── scan-projection.md     # Wire-up of feature-003 deferred scan branches
└── tasks.md             # Phase 2 — NOT created here (/speckit-tasks)
```

### Source Code (repository root)

```text
backend/
├── prisma/
│   ├── schema.prisma                       # ← add `GalaxyMeta` model
│   └── migrations/
│       └── <timestamp>_add_galaxy_meta/    # ← NEW migration
│           └── migration.sql               #    creates table + CHECK (id=1)
├── src/
│   ├── app.module.ts                       # ← register GalaxyModule
│   ├── prisma/                             # existing
│   ├── game/
│   │   ├── constants.ts                    # existing — no changes
│   │   ├── tick/                           # existing — no changes
│   │   ├── ship/                           # existing — no changes
│   │   ├── commands/
│   │   │   ├── messages.ts                 # ← extend with SCAN08..SCAN16, NO_SUCH_PLANET, SCAN_LOCATED_IN
│   │   │   └── handlers/
│   │   │       └── scan.handler.ts         # ← wire planet/wormhole projection + scan pl name lookup
│   │   └── galaxy/                         # NEW
│   │       ├── galaxy.module.ts
│   │       ├── galaxy.service.ts           # generator + onModuleInit + read model
│   │       ├── galaxy.config.ts            # env loader + validators (parseUint32, parseRange)
│   │       ├── galaxy.types.ts             # GalaxyConfig, GalaxyMetaSnapshot, S00Entry
│   │       ├── rng.ts                      # Mulberry32 PRNG
│   │       └── s00.ts                      # frozen 5-entry neutral-zone fixture (Zygor-3 + 4)
│   └── gateway/                            # existing — no changes
└── test/
    ├── unit/
    │   ├── galaxy-config.spec.ts           # NEW — defaults + bounds + error wording
    │   ├── galaxy-rng.spec.ts              # NEW — determinism + sequence stability
    │   ├── galaxy-service.spec.ts          # NEW — read methods, name lookup, sector lookup
    │   └── handlers/
    │       └── scan.spec.ts                # ← extended for planet/wormhole projection cases
    └── integration/
        ├── galaxy-bootstrap.spec.ts        # NEW — G1: 450 sectors + meta row after first boot
        ├── galaxy-determinism.spec.ts      # NEW — G2/G3: same seed → same world; different seed → different
        ├── galaxy-idempotent.spec.ts       # NEW — G4/G5: zero writes on second boot, crash rolls back
        ├── galaxy-balance.spec.ts          # NEW — G7/G8: counts in expected envelope; wormhole bounds
        ├── galaxy-config-divergence.spec.ts# NEW — env values disagreeing with GalaxyMeta → WARN line
        └── command-roundtrip.spec.ts       # ← extended — scan lo cells include planet/wormhole entries

reference/
└── ge-source/                              # READ-ONLY; consulted, never modified
```

**Structure Decision**: Web-application layout (Option 2) continued — no
frontend tree changes. The new `backend/src/game/galaxy/` module is the
sole feature directory. The generator is wholly contained inside
`GalaxyService` so future re-faithfulization (e.g. unfreezing the `s00`
fixture into a config table) is a localized change. The deferred
`TODO(004)` wire-up in feature 003's `scan.handler.ts` is a surgical
in-place edit, not a rewrite — keeps the diff auditable.

## Complexity Tracking

> No Constitution Check violations. Section intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| _(none)_  |            |                                     |
