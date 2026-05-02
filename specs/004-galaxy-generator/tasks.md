# Tasks: Galaxy Generator (004)

**Input**: Design documents from `/specs/004-galaxy-generator/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/{galaxy-service,galaxy-config,scan-projection}.md, quickstart.md

**Tests**: MANDATORY per Constitution II. Generator and scan wire-up land with unit + integration tests written before or alongside implementation. Target ≥ 25 new backend tests.

**Organization**: Tasks are grouped by user story (US1 = P1 world-exists/persistence, US2 = P1 scan-projection, US3 = P2 operator-reseed). US1 and US2 are both P1 — US1 is the MVP since US2 strictly depends on the generator producing a world.

## Format: `[ID] [P?] [Story?] Description with file path`

- **[P]**: Different file, no dependency on incomplete tasks
- **[Story]**: User-story label (US1/US2/US3); omitted in Setup, Foundational, and Polish phases

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Schema migration and empty module skeleton so subsequent tasks have somewhere to land.

- [X] T001 Add `GalaxyMeta` model to `backend/prisma/schema.prisma` per data-model.md (id Int @id @default(1), seed BigInt, plodds Int, wormodds Int, maxplanets Int, generatedAt DateTime @default(now()))
- [X] T002 Generate Prisma migration `add_galaxy_meta` via `npx prisma migrate dev --name add_galaxy_meta` and append a raw-SQL block adding `CONSTRAINT "GalaxyMeta_singleton" CHECK ("id" = 1)` to the new `backend/prisma/migrations/<ts>_add_galaxy_meta/migration.sql`
- [X] T003 [P] Create empty module files: `backend/src/game/galaxy/galaxy.module.ts`, `galaxy.service.ts`, `galaxy.types.ts` (with `GalaxyConfig`, `S00Entry`, `GalaxyMetaSnapshot` interfaces from data-model.md/contracts)
- [X] T004 Register `GalaxyModule` in `backend/src/app.module.ts` after `PrismaModule` and before `GameGatewayModule` so generation completes before sockets accept clients

**Checkpoint**: `npm run build` passes with the new (still-empty) module imported.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Config loader, PRNG, and the `s00` fixture — required by every user story (the generator needs all three; the divergence-warning code in US3 reuses the config loader).

⚠️ CRITICAL: No user-story work can begin until this phase completes.

- [X] T005 [P] Implement Mulberry32 PRNG in `backend/src/game/galaxy/rng.ts` per research.md Decision 1 — exports `class Rng` with `constructor(seed: number)`, `next(): number` (float ∈ [0,1)), `intBelow(max: number): number`. Seed truncated to uint32. JSDoc citing `GEFUNCS.C:gernd`.
- [X] T006 [P] Write `backend/test/unit/galaxy-rng.spec.ts` covering: same seed → identical sequence (≥ 1000 draws); different seeds diverge within first 10 draws; `intBelow(N)` stays in `0..N-1` over 10 000 draws.
- [X] T007 [P] Implement `parseUint32` and `parseRange` helpers + `loadGalaxyConfig(env)` + `GalaxyConfigError` class in `backend/src/game/galaxy/galaxy.config.ts` per contracts/galaxy-config.md. Out-of-range throws naming the offending field; defaults `{seed:0xC0FFEE, plodds:4, wormodds:10, maxplanets:5}`; supports `0x...` hex and `12_648_430` underscore decimals.
- [X] T008 [P] Write `backend/test/unit/galaxy-config.spec.ts` covering G6: defaults when env unset; hex + underscore parsing; each tunable rejected at boundary (`plodds=0`, `plodds=21`, `wormodds=0`, `wormodds=101`, `maxplanets=0`, `maxplanets=10`); error message names the bad field and the offending value.
- [X] T009 [P] Author canonical neutral-zone fixture in `backend/src/game/galaxy/s00.ts` — `Object.freeze`d 5-entry `S00Entry[]` with `Zygor-3` at index 0 (plnum=1, type=PLTYPE_PLNT=2, env Earth-like, res Rich) and 4 additional named planets within `S00PLNUM` range, all owner `""`. Cite `GECMDS.C:4127, 4558` for Zygor-3 and `GEPLANET.C:495-541` for entry shape.
- [X] T010 [P] Add `GALAXY_*` constants and shared `MAXX=30`, `MAXY=15`, `SECTYPE_NORMAL=1`, `PLTYPE_PLNT=2`, `PLTYPE_WORM=3`, `MAXPLANETS=9` to `backend/src/game/constants.ts` if not already present (verify against feature 001/002 — only add what's missing). Cite `GEMAIN.H:121-207`.

**Checkpoint**: Foundation ready — RNG and config validated by passing unit tests; s00 fixture importable; constants in place.

---

## Phase 3: User Story 1 — The world exists and persists across restarts (Priority: P1) 🎯 MVP

**Goal**: A fresh-DB boot generates the full 30×15 galaxy atomically inside one Postgres transaction; subsequent boots detect `GalaxyMeta` and skip generation; identical seeds against fresh DBs yield byte-identical galaxies.

**Independent Test**: Boot with empty DB at default seed → 450 sectors + planets/wormholes + 1 `GalaxyMeta` row. Restart → row counts unchanged. Drop DB, boot with same seed → identical planet coordinate/name set.

### Tests for US1 (write FIRST and confirm RED before implementation)

- [X] T011 [P] [US1] Write `backend/test/integration/galaxy-bootstrap.spec.ts` covering G1: after `onModuleInit` against an empty DB, `Sector` rowcount = 450, `GalaxyMeta` rowcount = 1 with the configured seed/tunables; every sector `(x,y)` in `0..29 × 0..14` exists exactly once.
- [X] T012 [P] [US1] Write `backend/test/integration/galaxy-determinism.spec.ts` covering G2: two fresh DBs booted with the same seed produce identical planet `(plnum, xsect, ysect, xcoord, ycoord, name, type, enviorn, resource)` tuple sets AND identical wormhole `(xsect, ysect, destXsect, destYsect, name, visible)` tuple sets across the two boots (closes SC-003 fully); G3: different seeds produce different planet coordinate sets.
- [X] T013 [P] [US1] Write `backend/test/integration/galaxy-idempotent.spec.ts` covering G4: a second boot against a populated DB emits zero INSERT/UPDATE/DELETE on `Sector`/`Planet`/`Wormhole`/`GalaxyMeta` (verified via row-count equality + a Prisma middleware spy on writes during the second `onModuleInit`); G5: a generator that throws after sector inserts but before the `GalaxyMeta` insert leaves all four tables empty (transaction rollback).
- [X] T014 [P] [US1] Write `backend/test/integration/galaxy-balance.spec.ts` covering G7: at default seed/tunables, `Planet` rowcount ∈ `[100, 300]` and `Wormhole` rowcount ∈ `[10, 40]`; G8: every wormhole row satisfies `destXsect ∈ 0..29`, `destYsect ∈ 0..14`, and `(destXsect, destYsect) ≠ (xsect, ysect)`.
- [X] T015 [P] [US1] Write `backend/test/unit/galaxy-service.spec.ts` covering G9 (`findPlanetByName('Zygor-3')` returns the canonical planet; `findPlanetByName('NOTAPLANET')` returns null; lookup is case-insensitive) and G10 (`getSectorPlanets(0,0)` returns 5 entries in s00 fixture order).

### Implementation for US1

- [X] T016 [US1] Implement origin-sector path in `backend/src/game/galaxy/galaxy.service.ts` — private `generateOrigin(tx, rng)` inserts the s00 fixture into `Sector(0,0)` (with `numplan=s00.length`, `type=SECTYPE_NORMAL`) and `Planet`/`Wormhole` rows derived from each `S00Entry` per data-model.md (xcoord/ycoord = sector + entry offset; type/env/res/name/owner from entry). Cite `GEPLANET.C:670-727 (build_plan_1)`.
- [X] T017 [US1] Implement non-origin sector path in `galaxy.service.ts` — private `generateSector(tx, rng, x, y, cfg)` running `gernd()%plodds==0` planet trigger, `gernd()%maxplanets` slot count, per-slot `gernd()%wormodds==0` wormhole-vs-planet branch, and the random `xcoord/ycoord = sect + rng.next()*0.8 + 0.1` placement with peer-distance ≥ 0.07 retry. Wormhole destinations sampled `(floor(rng.next()*MAXX), floor(rng.next()*MAXY))` with self-loop retry per research.md Decision 5. Non-origin planets get `name=""`, `userid=null`, `enviorn=floor(rng.next()*4)`, `resource=floor(rng.next()*4)`, defaults per data-model.md. Cite `GEPLANET.C:484-651`.
- [X] T018 [US1] Implement generator entry point in `galaxy.service.ts` — `private async runGeneration(cfg)` opens `prisma.$transaction(async tx => …)`, performs the row-major `for y in 0..MAXY-1: for x in 0..MAXX-1` iteration (origin first via special-case), and writes the `GalaxyMeta` row LAST. Cite research.md Decision 6 (iteration order).
- [X] T019 [US1] Implement idempotency probe + lifecycle hook in `galaxy.service.ts` — `async onModuleInit()` calls `loadGalaxyConfig(process.env)`, then inside a transaction does `SELECT 1 FROM "GalaxyMeta" LIMIT 1`. If present → no-op (no writes). Else → `runGeneration(cfg)`. Wrap both branches so an existing-meta boot performs zero writes (G4). After commit, hydrate the read model and call the boot-summary log helper owned by T033 (T019 does not define the log line format or content — it only invokes the helper).
- [X] T020 [US1] Implement read-model hydration + getters in `galaxy.service.ts` — private `hydrate()` populates `planetsBySector: Map<string, Planet[]>`, `wormholesBySector: Map<string, Wormhole[]>`, `planetsByName: Map<string, Planet>` (lowercased key, only non-empty names) from `prisma.planet.findMany()` + `prisma.wormhole.findMany()`. Public `getSectorPlanets(x,y)`, `getSectorWormholes(x,y)`, `findPlanetByName(name)`, `getMeta()` per contracts/galaxy-service.md (out-of-range coords throw; getMeta returns a structural clone).
- [X] T021 [US1] Wire `GalaxyService` and `PrismaService` into `backend/src/game/galaxy/galaxy.module.ts` (`providers: [GalaxyService]`, `exports: [GalaxyService]`, `imports: [PrismaModule]`).

**Checkpoint**: All US1 tests green. Booting against an empty DB produces a galaxy; restart is a no-op; same-seed reproducibility holds.

---

## Phase 4: User Story 2 — Players see planets and wormholes via scan (Priority: P1)

**Goal**: Replace the `TODO(004)` markers in feature 003's `scan.handler.ts` so `scan lo` projects planet (`'O'`) and visible wormhole (`'W'`) cells onto the tactical grid, and `scan pl <name>` returns a real status block (or "No planet by that name.") instead of the deferred stub.

**Independent Test**: Place a test ship at sector `(0,0)` (neutral zone has both planets and wormholes); send `scan lo` over the WebSocket; assert grid payload contains `type:'planet'/char:'O'` and `type:'wormhole'/char:'W'` cells. Send `scan pl Zygor-3` → populated status block. Send `scan pl NOTAPLANET` → "No planet by that name."

### Tests for US2 (write FIRST and confirm RED before implementation)

- [X] T022 [P] [US2] Extend `backend/test/unit/handlers/scan.spec.ts` with the four planet/wormhole projection cases from spec.md US2 acceptance: planet-only sector, wormhole-only sector, planet+ship+self sector, hidden wormhole (`visible===0`) is omitted. Mock `GalaxyService` to return the expected fixtures.
- [X] T023 [P] [US2] Extend the same `scan.spec.ts` with `scan pl` cases: `scan pl Zygor-3` → `SCAN08`/dashes/env/resources/`SCAN_LOCATED_IN` lines (no bearing line when planet is in a different sector); `scan pl NOTAPLANET` → `NO_SUCH_PLANET`; `scan pl` with no args → existing `SCANFMT`.
- [X] T024 [P] [US2] Extend `backend/test/integration/command-roundtrip.spec.ts` to boot with `GALAXY_SEED=12648430`, place a ship at `(0,0)`, dispatch `scan lo` over the test Socket.io client, and assert the `command:result` payload's `scanGrid` includes a `type:'planet'/char:'O'` and a `type:'wormhole'/char:'W'` entry.

### Implementation for US2

- [X] T025 [US2] Add `MessageId` entries `NO_SUCH_PLANET`, `SCAN08`, `DASHES`, `SCAN09`, `SCAN10`, `SCAN11`, `SCAN12`, `SCAN13`, `SCAN14`, `SCAN15`, `SCAN16`, `SCAN_LOCATED_IN` to `backend/src/game/commands/messages.ts` with the strings and `GECMDS.C` citations from contracts/scan-projection.md §"Message catalogue additions". `SCAN12..SCAN15` are reused for resources via index lookup.
- [X] T026 [US2] Widen `ScanCell.type` from `'ship' | 'self'` to `'ship' | 'self' | 'planet' | 'wormhole'` in the type definition (likely `backend/src/game/commands/handlers/scan.handler.ts` or `backend/src/game/types.ts`).
- [X] T027 [US2] Inject `GalaxyService` into `ScanHandlerService`. Replace the `TODO(004)` at `backend/src/game/commands/handlers/scan.handler.ts:103-104` (planet projection) and `:164` (wormhole projection) with calls to `galaxy.getSectorPlanets(x,y)` and `galaxy.getSectorWormholes(x,y).filter(w => w.visible === 1)`, projecting via the existing `projectRangeCell` helper. Iteration order per contracts/scan-projection.md: ships → planets → visible wormholes → self.
- [X] T028 [US2] Replace the `scan pl` deferred stub in `scan.handler.ts` with a `findPlanetByName(name)` lookup. On null → `NO_SUCH_PLANET`. On hit → emit `SCAN08`, `DASHES`, optional `SCAN09` (when owned), `SCAN11` + env string, `SCAN16` + resource string, and `SCAN_LOCATED_IN(planet.xsect, planet.ysect)`. Omit the `SCAN10` bearing line when `planet.xsect/ysect ≠ ship.xsect/ysect` (per contracts/scan-projection.md §"scan pl"). When `args.length === 0` keep the existing `SCANFMT` path.
- [X] T029 [US2] Make `ScanHandlerService`'s NestJS module import `GalaxyModule` (or wire the export so injection resolves) — adjust `backend/src/game/commands/commands.module.ts` (or wherever `ScanHandlerService` is provided).

**Checkpoint**: All US1 + US2 tests green. End-to-end scan demo from quickstart.md §5–§6 produces real data, not the 003 stub.

---

## Phase 5: User Story 3 — Operator reseed via env config (Priority: P2)

**Goal**: Operators can override the seed and tunables via env vars without touching source. The chosen seed is recorded in `GalaxyMeta` and on the boot log so the live world is auditable. If env disagrees with the persisted `GalaxyMeta` on an idempotent boot, a WARN line surfaces the divergence.

**Independent Test**: Boot fresh DB with `GALAXY_SEED=A` → galaxy A. Drop DB, boot with `GALAXY_SEED=B` → different galaxy. Restart that DB with `GALAXY_SEED=A` → log emits a WARN line that env disagrees with persisted seed B; live world remains B.

### Tests for US3 (write FIRST and confirm RED before implementation)

- [X] T030 [P] [US3] Write `backend/test/integration/galaxy-config-divergence.spec.ts`: boot with `GALAXY_SEED=42` against fresh DB; restart with `GALAXY_SEED=99` against the same DB and assert (a) `GalaxyMeta.seed === 42n`, (b) a WARN-level log line is emitted naming both values, (c) zero writes on the second boot. Use a captured logger spy (Nest `Logger` mock) for assertion.
- [X] T031 [P] [US3] Extend `galaxy-bootstrap.spec.ts` (or add a new tiny spec) to assert SC-006: a fresh-DB boot at `GALAXY_SEED=A` and a separate fresh-DB boot at `GALAXY_SEED=B` produce galaxies whose planet coordinate sets are not equal.

### Implementation for US3

- [X] T032 [US3] Add divergence detection in `galaxy.service.ts` — on the idempotent path (existing-meta branch in `onModuleInit`), compare each of `seed/plodds/wormodds/maxplanets` from the loaded `GalaxyConfig` against the persisted `GalaxyMeta` row and emit a single WARN line via Nest `Logger` listing each mismatched field with both values. The persisted values remain authoritative.
- [X] T033 [US3] Verify the FR-013 boot-summary INFO line in `galaxy.service.ts` matches the format pinned in research.md Decision 11 — single line: `GalaxyService: galaxy ready — seed=… plodds=… wormodds=… maxplanets=… sectors=450 planets=… wormholes=… generated=<true|false> ms=…`. On the idempotent path, counts come from the hydrated read model.

**Checkpoint**: All three user stories green. Quickstart §4 reseeding flow reproducible.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T034 [P] Update `docs/ARCHITECTURE.md` with the `GalaxyService` module entry (read model, generator lifecycle, consumed by `ScanHandlerService` and future 005/006/007/008 services).
- [X] T035 [P] Add a 2026-05-01 entry to `docs/DECISIONS.md` recording the three documented deviations (s00-in-code, named-planet `scan pl`, grid-bounded wormholes) with citations to research.md.
- [X] T036 [P] Update `docs/PROGRESS.md` with the 004 entry — completed work, test count delta, decisions, next feature (005 planet system).
- [X] T037 [P] Update `docs/DATA_MODEL.md` with the `GalaxyMeta` singleton (and note that `Sector`/`Planet`/`Wormhole` are now populated by the generator).
- [X] T038 [P] Update `docs/GAME_MECHANICS.md` with the procedural-generation mechanics + `GEPLANET.C:xgetsector` citation.
- [X] T039 Run the quickstart.md flow end-to-end (`prisma migrate reset`, default-seed boot, idempotent restart, reseed, scan lo, scan pl Zygor-3) and confirm every assertion holds. Capture the boot log lines in a comment on the implementation PR.
- [X] T040 Run full backend test suite (`cd backend && npm test`) and confirm ≥ 25 new tests added vs the 003 baseline; no regressions in the existing 443-test suite.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 → T002 (migration depends on schema). T003 ‖ T004 after T002.
- **Foundational (Phase 2)**: Depends on Setup. T005..T010 are mutually independent ([P]).
- **US1 (Phase 3)**: Depends on Foundational. Tests T011..T015 written first (any order, all [P]); implementation T016..T021 in the order listed (T021 after T020 after T019 after T018 after T016+T017).
- **US2 (Phase 4)**: Depends on US1 (needs `GalaxyService.getSectorPlanets/Wormholes/findPlanetByName`). Tests T022..T024 first; implementation T025..T029.
- **US3 (Phase 5)**: Depends on US1 (needs the `onModuleInit` lifecycle and `GalaxyMeta` row). Independent of US2.
- **Polish (Phase 6)**: Depends on all desired user stories.

### Parallel Opportunities

- **Setup**: T003 ‖ T004 after the migration lands.
- **Foundational**: T005, T006, T007, T008, T009, T010 all independent — six-way parallel.
- **US1 tests**: T011, T012, T013, T014, T015 all independent — five-way parallel; all must pass RED before T016 starts.
- **US2 tests**: T022, T023, T024 all independent.
- **US3 tests**: T030 ‖ T031.
- **Polish docs**: T034..T038 all independent.

### Story Independence

- US1 is the MVP and must complete first — US2 and US3 both depend on the generator producing a real world.
- US2 and US3 are independent of each other once US1 is done; in a parallel-team scenario, one developer takes US2 while another takes US3.

---

## Parallel Example: Foundational

```bash
# All six foundational tasks can run in parallel:
Task: "T005 — Implement Mulberry32 PRNG in backend/src/game/galaxy/rng.ts"
Task: "T006 — Write backend/test/unit/galaxy-rng.spec.ts"
Task: "T007 — Implement loadGalaxyConfig in backend/src/game/galaxy/galaxy.config.ts"
Task: "T008 — Write backend/test/unit/galaxy-config.spec.ts"
Task: "T009 — Author s00 fixture in backend/src/game/galaxy/s00.ts"
Task: "T010 — Verify/extend backend/src/game/constants.ts with GALAXY_* constants"
```

## Parallel Example: US1 Tests

```bash
# All five US1 integration/unit tests can run in parallel — write all five
# RED first, then proceed to T016+ implementation:
Task: "T011 — galaxy-bootstrap.spec.ts (G1)"
Task: "T012 — galaxy-determinism.spec.ts (G2/G3)"
Task: "T013 — galaxy-idempotent.spec.ts (G4/G5)"
Task: "T014 — galaxy-balance.spec.ts (G7/G8)"
Task: "T015 — galaxy-service.spec.ts (G9/G10)"
```

---

## Implementation Strategy

### MVP First (US1 only)

1. Phase 1 Setup → Phase 2 Foundational → Phase 3 US1.
2. **Stop and validate**: world generates, persists, idempotent on restart, reproducible by seed. The `scan` commands still emit the 003 stub at this point — that is fine.
3. Tag MVP and review.

### Incremental Delivery

1. Land US1 → demo the world via `psql` (no UI surface yet).
2. Land US2 → demo `scan lo` and `scan pl Zygor-3` over the existing 003 frontend; this is the first player-visible 004 outcome.
3. Land US3 → demo reseeding via env override.
4. Polish docs and run quickstart.

### Estimated Test Count

- Foundational: T006 (≥3 cases) + T008 (≥7 cases) ≈ 10 tests
- US1: T011 (≥3) + T012 (≥2) + T013 (≥2) + T014 (≥2) + T015 (≥4) ≈ 13 tests
- US2: T022 (≥4) + T023 (≥3) + T024 (≥1 e2e) ≈ 8 tests
- US3: T030 (≥3) + T031 (≥1) ≈ 4 tests
- **Total**: ≥ 35 new backend tests, comfortably above the ≥ 25 target in plan.md Technical Context.

---

## Notes

- Every task above strictly follows `- [ ] Tnnn [P?] [Story?] description with file path`.
- The migration in T002 is the only Prisma migration introduced by this feature; prior migrations are not edited (Constitution IV).
- `GEPLANET.C`, `GECMDS.C`, `GEMAIN.H`, and `GEFUNCS.C` line citations in JSDoc are mandatory for new public service methods (Constitution Quality § Code Quality).
- All tests run against the existing `backend/test/setup.ts` global setup — no new harness needed.
- Three documented deviations (s00 in-code, scan pl by name galaxy-wide, wormhole destinations grid-bounded) are already recorded in research.md; do not re-litigate during implementation.
