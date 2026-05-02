# Quickstart — Galaxy Generator (feature 004)

**Audience**: developer cloning the repo on `004-galaxy-generator` for the
first time, wanting to verify the feature end-to-end on local Postgres +
Docker Compose.

## Prerequisites

- Repo on branch `004-galaxy-generator`, dependencies installed
  (`cd backend && npm install`).
- Docker Compose stack up (`docker compose up -d db`) so Postgres 16+ is
  reachable on the URL in `backend/.env`.
- Migrations through feature 001 already applied.

## 1. Apply the new migration

```bash
cd backend
npx prisma migrate dev --name add_galaxy_meta
```

You should see a new migration directory created and `GalaxyMeta` added to the
DB. The CHECK constraint is added by the same migration's raw SQL block.

## 2. Boot the backend on a fresh DB

```bash
# Wipe to confirm a clean first-boot path
npx prisma migrate reset --force
npm run start:dev
```

Expected log line within ~500 ms of startup:

```
GalaxyService: galaxy ready — seed=12648430 plodds=4 wormodds=10 maxplanets=5 \
  sectors=450 planets=NNN wormholes=MM generated=true ms=NNN
```

`NNN` will fall in `[100..300]`; `MM` in `[10..40]` (SC-001).

## 3. Verify idempotency

Stop with Ctrl-C, then `npm run start:dev` again. The new boot logs:

```
GalaxyService: galaxy ready — seed=12648430 ... generated=false ms=NN
```

`generated=false` confirms the idempotency probe found `GalaxyMeta` and
skipped regeneration. Run `psql -c 'SELECT count(*) FROM "Sector"'` before
and after — counts match (SC-002).

## 4. Verify reseeding

```bash
npx prisma migrate reset --force
GALAXY_SEED=42 npm run start:dev
```

The log line now reports `seed=42` and a different planet/wormhole count
than the default-seed run. Drop and re-run with the same seed to confirm
the same counts and coordinates (SC-003, SC-006).

## 5. Verify `scan lo` projects planets and wormholes

In a second terminal, with the backend running:

```bash
# Use the dev test client (or the 003 frontend) to send `scan lo` from a
# ship known to be in a sector with a planet and a wormhole. The neutral
# zone (0,0) always has both kinds — place a test ship there.
```

The `command:result` payload's `scanGrid` field contains entries with
`type: 'planet'` (`char: 'O'`) and `type: 'wormhole'` (`char: 'W'`)
in addition to the self-cell (US2 / SC-004).

## 6. Verify `scan pl Zygor-3`

Same dev client:

```
> scan pl Zygor-3
Planet #1: Zygor-3
-----------------
Bearing: 0   Distance: 0
Environment: Earth-like
Resources:   Rich
Located in sector (0,0).
```

`scan pl NOTAPLANET` returns `No planet by that name.` — neither path
returns the deferred 003 stub `'No planets found in range.'` (US2 / SC-005).

## 7. Run the test suite

```bash
cd backend
npm test
```

Feature 004 tests live alongside existing 002/003 suites and are
auto-discovered by Jest. New test files:

```
test/unit/galaxy-config.spec.ts
test/unit/galaxy-rng.spec.ts
test/unit/galaxy-service.spec.ts
test/unit/handlers/scan.spec.ts                   ← extended
test/integration/galaxy-bootstrap.spec.ts
test/integration/galaxy-determinism.spec.ts
test/integration/galaxy-idempotent.spec.ts
test/integration/galaxy-balance.spec.ts
test/integration/galaxy-config-divergence.spec.ts
test/integration/command-roundtrip.spec.ts        ← extended
```

All should pass. Backend test count target: existing 003 baseline + ≥ 25
new tests.

## Troubleshooting

- **"GalaxyConfigError: GALAXY_PLODDS=0 must be in 1..20"** — fix the env
  value or unset it. The generator never silently clamps (FR-006a).
- **`generated=true` on what you thought was a populated DB** — your
  `GalaxyMeta` row was lost. Check whether a previous boot crashed
  mid-transaction; the design guarantees this leaves an empty world (FR-012),
  so a fresh `migrate reset` regenerates cleanly.
- **`scan lo` shows ships but no planets** — confirm the player ship is in
  a sector that actually has planets via
  `psql -c 'SELECT xsect, ysect, name FROM "Planet" WHERE xsect=X AND ysect=Y'`.
  Sectors with `numplan == 0` are valid; not every sector has a planet.
