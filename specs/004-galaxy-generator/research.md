# Phase 0 — Research: Galaxy Generator

**Feature**: 004-galaxy-generator
**Date**: 2026-05-01
**Status**: Complete (no NEEDS CLARIFICATION outstanding)

All open questions in `spec.md` were resolved during clarification. This document
records the technical decisions that flow into Phase 1 design.

## Decision 1 — Seedable RNG

**Decision**: Use a small, dependency-free Mulberry32 PRNG seeded from a 32-bit
unsigned integer. Implemented inline in `backend/src/game/galaxy/rng.ts`.

**Rationale**:
- The original `gernd()` (`GEFUNCS.C`) is just `rand()` from MSC — any cheap
  PRNG with a seedable state is a faithful match in spirit. We only need
  reproducibility, not cryptographic quality.
- Mulberry32 is ~10 lines, deterministic across platforms, and avoids pulling
  in a new dependency for one tiny use case (the only consumer is the
  generator on first boot).
- A single `Rng` instance is threaded through every randomized decision so
  there is one ordered consumption sequence — this is what makes the seed
  reproducible across runs (FR-005, SC-003).

**Alternatives rejected**:
- `seedrandom` npm package — extra dep for a one-call-site use; we never
  reseed at runtime so the package's flexibility is wasted.
- `Math.random()` — not seedable; violates FR-005 / SC-003 outright.
- Mersenne Twister — overkill; ~5x more code; same reproducibility guarantee.

## Decision 2 — Generator placement and lifecycle

**Decision**: Generation runs synchronously inside `GalaxyService.onModuleInit`,
inside a single `prisma.$transaction(async (tx) => …)` callback. The transaction
performs:

1. `SELECT 1 FROM "GalaxyMeta" LIMIT 1` (idempotency probe).
2. If a row exists → no-op, log "galaxy already generated", return.
3. Else → seeded RNG construction, full 30×15 sector/planet/wormhole inserts,
   `INSERT INTO "GalaxyMeta" …` as the final write.

The Nest module ordering ensures `GalaxyService` initializes before
`GameGateway` accepts connections — gameplay never sees a half-built world.

**Rationale**:
- FR-002 + FR-012 require boot-time idempotency and atomic generation. A single
  `$transaction` is the simplest mechanism Postgres + Prisma offer that gives
  us both. A crash mid-generation aborts the transaction and leaves no
  `GalaxyMeta` row, so the next boot retries cleanly.
- `onModuleInit` is the standard NestJS lifecycle hook for "do work before the
  app accepts requests"; we already use it elsewhere (`PrismaService.$connect`,
  `ScanHandlerService` class cache).
- The galaxy is small (~450 sector inserts + ~200 planets + ~25 wormholes +
  1 meta row ≈ 700 rows). One transaction is fine; no batching gymnastics
  needed.

**Alternatives rejected**:
- Background job after boot — leaves a window where players can connect to
  an empty world. Violates the "world is always there" expectation that
  every other 00x feature assumes (FR-009).
- Separate Nest provider running before module init via a custom factory —
  more moving parts, no benefit.
- Per-sector mini-transactions — partial generation is exactly what FR-012
  forbids.

## Decision 3 — Configuration surface

**Decision**: Five env vars, all optional, all validated at boot:

| Env var | Default | Legal range | Citation |
|---|---|---|---|
| `GALAXY_SEED` | `0xC0FFEE` (3211498) | any uint32 | FR-006 |
| `GALAXY_PLODDS` | `4` | `1..20` | `numopt` bound; FR-006a |
| `GALAXY_WORMODDS` | `10` | `1..100` | `numopt` bound; FR-006a |
| `GALAXY_MAXPLANETS` | `5` | `1..9` | `numopt` bound; FR-006a |
| `GALAXY_LOG_S00` | `false` | bool | dev-only verbose s00 log |

Validation uses a small inline guard (`assertUint32`, `assertRange`) — no
`class-validator`/`zod` dependency added for one-shot boot config. Out-of-range
values throw on `onModuleInit` and cause Nest to abort startup with a clear
message (no clamping — FR-006a).

**Rationale**:
- Env vars match the project's existing config style (`DATABASE_URL` etc.).
  No new framework to learn.
- Documented defaults satisfy FR-006 / FR-006a; explicit overrides satisfy
  US3.
- Failing fast on bad input is consistent with NestJS conventions and avoids
  silently producing a degenerate world.

**Alternatives rejected**:
- A YAML config file — extra surface, no operator benefit; env vars compose
  well with Docker Compose / Hetzner systemd units.
- Storing tunables in a DB row — chicken-and-egg with first-boot generation.

## Decision 4 — `s00` neutral-zone fixture

**Decision**: Author the canonical 5-entry origin-sector table as a frozen
TypeScript constant in `backend/src/game/galaxy/s00.ts`. Schema mirrors the
fields read by `GEPLANET.C:495-541`:

```ts
export interface S00Entry {
  type: 1 | 2 | 3;       // GEPLANET.C:503/510/517 — planet type 1/2/3 OR wormhole=3
  name: string;          // GEPLANET.C:672 — planet name (≤ 20 chars per PLNAMSZ-ish)
  xcoord: number;        // 0..1 within origin sector
  ycoord: number;        // 0..1 within origin sector
  env: number;           // GEPLANET.C:675 — environment 0..3
  res: number;           // GEPLANET.C:676 — resource 0..3
  owner: string;         // empty string ⇒ unowned
  destX?: number;        // wormholes only — destination sector x in 0..MAXX-1
  destY?: number;        // wormholes only — destination sector y in 0..MAXY-1
}
```

`Zygor-3` is `plnum=1` per `GECMDS.C:4127, 4558`. Four additional entries fill
the table to length 5, all within the source's `S00PLNUM` legal range of 3..9.
The fixture is a `Object.freeze`d default export and reviewed via PR like any
other fidelity artifact.

**Rationale**:
- The original loaded `s00[]` from a `.MSG` file that does not exist in
  `reference/ge-source/`. Authoring it in code is the only path forward.
- TypeScript const + `Object.freeze` is checkable, diffable, and impossible
  to mutate at runtime. No data-migration needed.
- 5 entries is mid-range of the legal `S00PLNUM` 3..9 — gives a populated
  neutral zone without overpacking it.

**Alternatives rejected**:
- JSON file in `reference/wiki/` — would mix authored fixtures with read-only
  reference. `reference/` is for original-game artifacts, not our authored
  ones.
- DB seed table — not version-controlled in source the same way; harder to
  audit deviations.

## Decision 5 — Wormhole destination strategy

**Decision**: Wormhole destinations are picked by the same seeded RNG used for
placement. Sampling rule:

```
do {
  destX = floor(rng.next() * MAXX);     // 0..29
  destY = floor(rng.next() * MAXY);     // 0..14
} while (destX === xsect && destY === ysect);
```

The retry loop is bounded; a sector never overlaps its own destination
(`MAXX*MAXY = 450 > 1`, so a single retry suffices in the worst case).

**Rationale**:
- FR-004 + Q4 mandate destinations within the 30×15 grid and reject
  self-loops. Original `GEPLANET.C:642-643` sampled across `[-univmax..+univmax]`,
  which assumes an unbounded explorable space the BBS port grew into. We have
  a bounded 30×15 world.
- Documented deviation: original sampled a wider space and accepted
  out-of-grid coordinates as "deep space"; we treat them as a generator bug.

**Alternatives rejected**:
- Faithful out-of-grid destinations — produces wormholes that lead nowhere
  the player can reach, contradicting FR-004's grid-bounds requirement.
- Disallowing wormholes-to-neighboring-sectors — adds a constraint not in
  the original; speculative balance work.

## Decision 6 — Iteration order (determinism)

**Decision**: Sectors are visited in a fixed, hard-coded `(y, x)` row-major
order: `for y in 0..MAXY-1: for x in 0..MAXX-1: …`. Within a sector, planets
are placed before wormholes. Origin `(0,0)` is special-cased and visited first.

**Rationale**:
- Determinism (FR-005, SC-003) requires not just a seeded RNG but a fixed
  order in which RNG draws happen. Two boots must consume the RNG in the
  same sequence to produce identical galaxies. Sorting/iterating from a
  `Map` or `Object.keys` would be deterministic in practice but the explicit
  nested loop is auditable.
- Special-casing `(0,0)` first means the `s00` fixture is applied before any
  random draws happen. The non-origin RNG sequence is therefore independent
  of the fixture content — adding/removing s00 entries does NOT shift the
  rest of the galaxy.

**Alternatives rejected**:
- Visit non-origin sectors first, origin last — breaks the audit property
  above.
- Random-permuted visit order — destroys determinism guarantees.

## Decision 7 — In-memory galaxy cache

**Decision**: `GalaxyService` exposes the generated galaxy via an in-memory
read model:
- `getSectorPlanets(xsect, ysect): Planet[]` — O(1) lookup against a
  `Map<string, Planet[]>` keyed by `"x,y"`.
- `getSectorWormholes(xsect, ysect): Wormhole[]` — likewise.
- `findPlanetByName(name): Planet | null` — O(1) lookup against a
  `Map<string, Planet>` keyed by lowercased name; only named (neutral-zone)
  planets populate this index.

The cache is hydrated once during `onModuleInit`, after the generation
transaction completes (or after detecting an existing world). Hydration reads
`prisma.planet.findMany()` and `prisma.wormhole.findMany()` — small enough
(<300 rows) that loading everything is fine.

**Rationale**:
- FR-009 forbids each consumer (`scan lo`, future combat, future planet
  system, AI ships) from hammering Postgres on every read. A read model in
  memory satisfies this without a Redis layer (Constitution III).
- Galaxy state changes only on colonization (feature 005) — feature 004
  treats the cache as immutable. When 005 lands it will add invalidation
  hooks; for now there are no writes after boot.
- Aligns with the existing pattern: `ShipStateService` also keeps a
  read/write cache with async DB flush.

**Alternatives rejected**:
- Query Postgres on every `scan` — defeats FR-009 and adds latency to a
  command that runs many times per second across all players.
- Use the `ShipStateService` pattern with a dirty-flag flush — overkill;
  galaxy data is not mutated during a 004 scope.

## Decision 8 — `scan pl <name>` lookup semantics (deviation)

**Decision**: `scan pl <name>` uses `GalaxyService.findPlanetByName(name)`,
matched case-insensitively, and resolves only against named planets (the s00
neutral-zone set). Output line shapes follow `GECMDS.C:2326-2356`
(`SCAN08…SCAN16`) but skip the bearing/distance values that depend on the
ship's COORD when the looked-up planet is in a different sector.

**Rationale (deviation tracked)**:
- Original `scan_pl` (`GECMDS.C:2295`) takes a numeric `plnum` argument
  bounded by `MAXPLANETS` and looks up planets only in the *current* sector.
  Our spec (Q1, FR-010) deliberately deviates: we accept a planet name and
  resolve it galaxy-wide against the named neutral-zone set.
- The deviation is intentional because non-origin planets are nameless until
  colonization (Q1 Option B); a numeric-plnum-in-current-sector lookup
  against an empty world (no neutral zone in the player's current sector)
  would always return "FOOLISH". Named lookup gives the command useful
  semantics in the 004 scope.
- The deviation is documented in spec FR-010 and again in
  `contracts/messages.md` so any future re-faithfulization (e.g. when 005
  introduces in-sector colonized planets) is traceable.

**Alternatives rejected**:
- Faithful numeric-plnum + current-sector — produces no useful output until
  feature 005 colonization; would block US2 acceptance.
- Both name AND numeric forms — added complexity for ambiguous error paths;
  deferred to feature 005 if needed.

## Decision 9 — Planet character codes for `scan lo`

**Decision**: `scan lo` projects planets and wormholes onto the tactical grid
using the original character codes:
- Planet → `'O'` (capital letter O)
- Wormhole → `'W'` (capital W) when `visible == 1`, hidden otherwise

Both are emitted as `ScanCell` entries with `type: 'planet'` /
`type: 'wormhole'` so the frontend can style them distinctly without
re-parsing the char.

**Rationale**:
- The `scan_lo` map character table in `GECMDS.C:2640-2740` (the planet/worm
  branches) uses `O` and `W`. Recorded in `contracts/messages.md`.
- `ScanCell` already supports a `type` discriminator; widening it to
  `'planet' | 'wormhole'` is a non-breaking change for the existing 003
  consumers (frontend's `ScanMap.tsx` defaults to grid-cell rendering for
  unknown types).

**Alternatives rejected**:
- Using `*` for planets — collides with the self-cell character in 003
  (`GECMDS.C:2721`).
- Returning rich planet/wormhole objects in the grid payload — leaks server
  data shape into the wire; frontend doesn't need it for rendering.

## Decision 10 — Prisma migration shape

**Decision**: One new migration introduces the `GalaxyMeta` table. No edits
to prior migrations (Constitution IV — Prisma migrations are immutable).

```sql
CREATE TABLE "GalaxyMeta" (
  "id"           INTEGER NOT NULL DEFAULT 1,
  "seed"         BIGINT  NOT NULL,
  "plodds"       INTEGER NOT NULL,
  "wormodds"     INTEGER NOT NULL,
  "maxplanets"   INTEGER NOT NULL,
  "generated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "GalaxyMeta_pkey"      PRIMARY KEY ("id"),
  CONSTRAINT "GalaxyMeta_singleton" CHECK ("id" = 1)
);
```

The `id = 1` CHECK enforces "single row" at the DB level — a second insert
attempt fails with a constraint violation rather than producing two meta rows
that could disagree about which seed produced the world.

**Rationale**:
- A natural single-row table is more honest than a "first row wins"
  convention. The CHECK constraint makes the singleton promise machine-
  enforceable.
- Stores the seed as `BIGINT` to allow operator-supplied 64-bit-style seeds
  even though the RNG truncates to 32 bits internally — prevents bool-trap
  truncation surprises in audit logs.

**Alternatives rejected**:
- Reuse `Sector` row count as the idempotency signal — fragile against
  partial generation if we ever drop the single-transaction guarantee.
- Store generator state in a JSON config file in the repo — couples the
  source tree to a specific deployment's seed. Bad.

## Decision 11 — Logging format

**Decision**: Single log line at end of `onModuleInit`, INFO level:

```
GalaxyService: galaxy ready — seed=3211498 plodds=4 wormodds=10 maxplanets=5
  sectors=450 planets=187 wormholes=23 generated=true ms=412
```

When generation was skipped (idempotent boot), `generated=false` and the
counts come from the read-model hydration (still authoritative).

**Rationale**:
- Satisfies FR-013 with one greppable line. Operators can correlate live
  worlds with their seed.
- INFO-level so it shows up in default deployment logging without enabling
  verbose modes.

## Open items (none)

All `NEEDS CLARIFICATION` resolved during the spec clarification round.
Generator runs synchronously, blocks startup, and the resulting galaxy is
read-only for the 004 scope. Phase 1 design proceeds.
