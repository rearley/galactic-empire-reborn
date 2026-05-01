# Quickstart — Prisma Schema Test Suite

How to run the feature-001 test suite on a fresh clone. The dev machine
needs no local Postgres — Docker Compose provides everything.

## Prerequisites

- Node.js 20 LTS
- Docker + Docker Compose
- Repo cloned

## One-time setup

```bash
# Copy the env template
cp .env.example backend/.env

# Install deps
cd backend
npm install
```

## Run the suite

```bash
# 1. Start Postgres (creates both `ge` and `ge_test` databases)
npm run db:up

# 2. Apply schema.prisma to the test DB
DATABASE_URL="$TEST_DATABASE_URL" npx prisma db push --skip-generate

# 3. Generate Prisma client
npx prisma generate

# 4. Run the tests
npm test -- --runInBand
```

`npm test` runs Jest with a `globalSetup` that re-runs
`prisma db push --force-reset --skip-generate` against `ge_test` once per run;
per-test isolation is provided by `TRUNCATE ... CASCADE` in `beforeEach`.

## Useful npm scripts

| Script | What it does |
|---|---|
| `npm run db:up` | Start the `db` service in `../docker-compose.yml` and wait until `pg_isready` |
| `npm run db:down` | Stop the `db` service (volume preserved) |
| `npm run db:reset` | Stop, remove the volume, and start fresh — drops all data |
| `npm test` | Run the Jest suite against `TEST_DATABASE_URL` |

## What the suite verifies

- **Round-trip fidelity** for every entity (User, Ship, Sector, Planet,
  Wormhole, Team, Mail, MailStat, ShipClass, Mine).
- **Native array column lengths** match `MAXTORPS=3`, `MAXMISSL=3`,
  `MAXDECOY=10`, `NUMITEMS=14`, `options[30]`, `freq[3]`.
- **BigInt range** — values > 2³¹ round-trip on every `BigInt`/`BigInt[]` column.
- **Uniqueness** — duplicate composite keys are rejected by Postgres.
- **Seed coverage** — all 18 `ShipClass` rows insert and look up by `classNumber`.
- **Fidelity audit** — every C field from `GEMAIN.H` (excluding `filler`/`waste`)
  is reachable via Prisma DMMF.

## Tearing down

```bash
npm run db:down       # keep data
npm run db:reset      # nuke and restart
```
