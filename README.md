# Galactic Empire Reborn

A faithful web port of the classic MajorBBS game **Galactic Empire** (1988–1992) by Mike Murdock.
Real-time multiplayer space combat and economy in a 30×15 sector universe — text commands,
ASCII scan maps, persistent Cybertron AI, planet colonization, and midnight scoring.

**Stack**: NestJS · PostgreSQL 16 · Socket.io · React + Vite · Prisma ORM

---

## Quick start (Docker — recommended)

Bring up the full stack (PostgreSQL + backend + nginx/frontend) with one command:

```bash
docker compose up -d
```

- Frontend: [http://localhost:8080](http://localhost:8080)
- Backend API: [http://localhost:3000](http://localhost:3000)

On first boot the backend automatically runs Prisma migrations, seeds the 18 ship classes,
and generates the 30×15 galaxy. Subsequent boots detect no pending migrations and skip seeding
(seed uses `upsert`, so it is safe to re-run).

### Overriding JWT_SECRET for production

The default `JWT_SECRET` in `docker-compose.yml` is a dev placeholder. For any real deployment
set it via environment variable before starting:

```bash
JWT_SECRET=your-long-random-secret docker compose up -d
```

Or create a `.env` file at the repo root:

```
JWT_SECRET=your-long-random-secret
```

### Stopping the stack

```bash
docker compose down          # stops containers, keeps the data volume
docker compose down -v       # stops containers AND deletes all data
```

---

## Quick start (dev server)

### 1. Prerequisites

- Node.js 20+
- PostgreSQL 16+ running on `localhost:5432`

### 2. Clone and install

```bash
git clone <repo-url>
cd galactic-empire-reborn

# Backend
cd backend
npm install

# Frontend (separate terminal)
cd ../frontend
npm install
```

### 3. Create the databases

Create role `ge` and the two databases on your local Postgres:

```sql
CREATE ROLE ge WITH LOGIN PASSWORD 'ge' CREATEDB;
CREATE DATABASE ge OWNER ge;
CREATE DATABASE ge_test OWNER ge;
```

(`ge` is the dev DB; `ge_test` is reset on every `npm test` run.) The connection strings in
`backend/.env.example` assume these names and credentials.

### 4. Configure environment

```bash
cd backend
cp .env.example .env
```

The defaults work for local dev. Set `JWT_SECRET` to something real if you care about token security.

### 5. Run migrations and seed ship classes

```bash
cd backend
npx prisma migrate deploy
npx prisma db seed
```

Migrations create the schema. The seed populates the 18 ship classes. The galaxy generates
automatically on first server boot.

### 6. Start the backend

```bash
cd backend
npm run start:dev
```

The NestJS server starts on **port 3000**. On first boot it generates the 30×15 galaxy
(planets, wormholes, neutral zone) inside a single transaction — takes a few seconds.

### 7. Start the frontend

```bash
cd frontend
npm run dev
```

Vite starts on **port 5173**. Open [http://localhost:5173](http://localhost:5173).

---

## Playing the game

1. **Register** a new account via the auth screen
2. **Start in a class 1 Interceptor** — new pilots always receive one, along with 5,000 credits and
   3 flux pods (feature 021 restored the original `initshp` behaviour; there is no class picker).
   Upgrades are bought in-game with `new ship <N>` at Zygor-3 in sector 0,0. There are **nine**
   player classes (1-9); class 34 is the admin-only Sysopian Death Star.
3. **Name your ship**
4. **Type commands** in the terminal input

### Core commands

| Command | What it does |
|---------|-------------|
| `sca lo` | Local tactical scan (ships, planets, wormholes) |
| `sca ra 5` | Range radar at zoom level 5 |
| `sca se` | Sector close-up scan |
| `rep nav` | Navigation report (heading, speed, position) |
| `rep sys` | Systems report (energy, damage, shields) |
| `rot 180` | Rotate to heading 180° |
| `imp 50` | Set impulse power to 50% (0-99) |
| `war 10` | Engage warp 10 |
| `pha 0 1` | Fire phasers `<degree>` off current heading, `<focus>` 0-5 (0 = tightest, most damage) |
| `tor @` | Fire torpedo at locked target |
| `orb 1` | Orbit planet #1 in current sector |
| `pla` | List your owned planets |
| `ros` | Player roster (top scores) |
| `who` | Show all active ships |
| `hel` | In-game help |
| `set ?` | Show your option flags |

### Ship classes

Class 1 (Scout) cannot attack planets. Classes 2–10 can. Higher class numbers = heavier ships
with more firepower and cargo but lower warp speed.

---

## Game tuning (`backend/config/game.config.json`)

The original exposed 51 options to the sysop via `numopt(NAME, min, max)`, read at boot from a
`.cnf` file (`GEMAIN.C:459-524`). This port mirrors that in `backend/config/game.config.json`,
grouped by domain:

```json
{
  "weapons": { "PDAMMAX": 25, "TDAMMAX": 100 },
  "world":   { "UNIVMAX": 15, "PLODDS": 4 },
  "limits":  { "MAXPLRS": 256, "MAXSHIPS": 10 }
}
```

Any option can be overridden by an environment variable of the same name, which takes precedence —
handy for Docker and CI:

```bash
PDAMMAX=40 docker compose up
```

**Every value is clamped to the range the original enforced.** That distinction matters: the *value*
was never canon (it was each sysop's taste, and the `.cnf` files are not part of the reference
source), but the *bounds* are — a value outside them is one the original could never produce. Three
such defects were found by hand before this existed (torpedoes at twice the permitted maximum,
missiles at three times, jammers at twice), so the loader now clamps and warns rather than letting
one through silently. An unknown option name or a non-numeric value is a hard error, so a typo fails
loudly instead of looking like a setting that had no effect.

21 of the 51 currently back a live gameplay constant; the rest are declared in
`backend/src/game/config/game-config.ts` so their bounds are recorded and the gap is visible.

---

## Running the tests

```bash
cd backend
npm test               # full Jest suite (~2450 tests)
npm run test:manual    # manual smoke tests (requires live DB)
```

```bash
cd frontend
npm test               # Vitest suite
npm run test:e2e       # Playwright browser E2E (requires a live stack)
```

`npm run test:e2e` drives a real Chromium against the running app: register a pilot, complete
onboarding, round-trip commands, and assert the terminal UI renders correctly. **Postgres and the
backend must already be running** (`npm run start:dev` in `backend/`); Vite is started automatically
and an existing dev server is reused.

This layer exists for defects nothing else can see. The event log once collapsed the column padding
that `who`/`ros`/`pla` emit — destroying every ASCII table — and it was invisible to the backend
suite, the Vitest suite and the no-mock integration layer alike, because it was a CSS rule. That
specific regression is pinned in `frontend/e2e/gameplay.spec.ts`.

First run on a new machine needs the browser binary:

```bash
cd frontend && npx playwright install chromium
```

---

## Repository layout

```
galactic-empire-reborn/
  backend/             NestJS application (port 3000)
  frontend/            React + Vite terminal UI (port 5173)
  docs/                Architecture, decisions, progress, game mechanics
  specs/               spec-kit feature specs (001–020)
  reference/
    ge-source/         Original C source — READ ONLY
    wiki/              Game wiki reference
```

See `docs/ARCHITECTURE.md` for the full module map and `docs/GAME_MECHANICS.md` for
implemented mechanics with C source references.

DB=EjhA64ypfRm3%_md
