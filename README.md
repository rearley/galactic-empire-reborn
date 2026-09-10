# Galactic Empire Reborn

A faithful web port of the classic MajorBBS game **Galactic Empire** (1988–1992) by Mike Murdock.
Real-time multiplayer space combat and economy across a 201×201 sector galaxy — text commands,
ASCII scan maps, persistent Cybertron AI, planet colonization, and midnight scoring.

**Stack**: NestJS · PostgreSQL 16 · Socket.io · React + Vite · Prisma ORM

---

## What "faithful" means here

The original 1988–1992 distribution is authoritative for every value and behaviour. Where this
port and the classic game disagree, the classic game is right and this port is wrong — including
when our version is better balanced or pinned by a passing test.

That rule is enforced rather than aspired to:

- Gameplay constants carry `@see` citations to the C file and line they came from, and a test
  re-reads the original to check the quoted line is really there.
- Canon data — messages, the ship table, the help pages, the taunt catalogues — is **generated**
  from the shipped `.MSG` files by the scripts in `tools/`, never hand-typed.
- Deliberate differences are numbered entries in [`docs/DECISIONS.md`](docs/DECISIONS.md), tagged
  in the code, and checked in both directions. A deviation that is not written down is a bug.

The full original distribution is vendored read-only at `reference/`. See
[`NOTICE`](NOTICE) for what is embedded and under which licence, and
[`reference/CLAUDE.md`](reference/CLAUDE.md) for which copy of each data file is the real one.
That last point matters: the distribution ships several generations of the same configuration,
they look identical, and only one of them is what the shipped game actually loaded.

---

## Quick start (Docker — recommended)

Bring up the full stack (PostgreSQL + backend + nginx/frontend) with one command:

```bash
docker compose up -d
```

- Frontend: [http://localhost:8080](http://localhost:8080)
- Backend API: [http://localhost:3000](http://localhost:3000)

On first boot the backend runs Prisma migrations, seeds the 18 ship classes, and generates the
galaxy. Subsequent boots detect no pending migrations and skip seeding (the seed uses `upsert`,
so it is safe to re-run).

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

> **Never `prisma db push`, never `prisma migrate reset`.** Schema changes go through
> `prisma migrate dev --name <name>`, and migrations are committed rather than edited.
> See [`backend/prisma/CLAUDE.md`](backend/prisma/CLAUDE.md).

### 6. Start the backend

```bash
cd backend
npm run start:dev
```

The NestJS server starts on **port 3000**. On first boot it generates the galaxy — planets,
wormholes and the neutral zone — inside a single transaction, which takes a few seconds.

### 7. Start the frontend

```bash
cd frontend
npm run dev
```

Vite starts on **port 5173**. Open [http://localhost:5173](http://localhost:5173).

---

## Playing the game

1. **Register** a new account via the auth screen
2. **Start in a class 1 Interceptor** — new pilots always receive one, along with 100,000
   credits and 3 flux pods. There is no class picker; this restores the original's `initshp`
   behaviour. Upgrades are bought in-game with `new ship <N>` at Zygor-3 in sector 0,0.
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
| `hel` | In-game help — 61 pages, the original's own text |
| `set ?` | Show your option flags |

### Ship classes

Eighteen of the original's slots are real classes and are seeded; the rest are empty or stale
leftovers in the shipped table and are omitted.

| Range | Category | Notes |
|---|---|---|
| 1–9 | Player | Interceptor, Stealth Fighter, Heavy Freighter, Destroyer, Star Cruiser, Battle Cruiser, Frigate, Dreadnought, Freight Barge |
| 21–25 | Cybertron and Sarten | Persistent hunters; escalate with your kill count |
| 31–33 | Droids | Ephemeral. The Vakory Survey Drone (33) is the starter PvE target |
| 41 | Sysopian Death Star | Admin only |

The class 1 Interceptor cannot attack planets; every other player class can. Higher class numbers
are not uniformly heavier — the Freight Barge (9) is a hauler, not the top of a ladder. Type
`hel class` in game for the summary table, or `hel class <n>` for the original's own
specification page for a buyable hull.

---

## Galaxy size

The galaxy runs `-UNIVMAX..+UNIVMAX` on both axes. Canon defaults to 300; this port deploys at
100, giving 201×201 sectors. That is a declared deviation, and the Cybertron population is scaled
down with it so an encounter stays about as frequent as the original intended.

`MAXX=30` and `MAXY=15` are the ASCII scan map's dimensions **in characters**. They are the
viewport, not the galaxy, and anything measured in sectors is coupled to `UNIVMAX` instead.

Scan ranges are absolute, so map size and scan range have to be chosen together.

---

## Game tuning (`backend/config/game.config.json`)

The original exposed its options to the sysop via `numopt(NAME, min, max)`, read at boot from a
`.cnf` file (`GEMAIN.C:459-524`). Two things follow, and keeping them apart is the whole design:

- **The bounds are canon.** A value outside them is one the original could never produce, which
  makes it a fidelity defect rather than a preference.
- **The shipped default is also canon.** `MBMGEMSG.MSG` carries it inside the braces of every
  block, so it is recovered by `tools/extract-sysop-options.mjs` rather than guessed.

Both live in `backend/src/game/config/game-config.ts`, which declares 54 options, 48 of them
backing a live gameplay constant. The rest are declared so their bounds are recorded and the gap
is visible.

`backend/config/game.config.json` is therefore **deviations only**. Today it contains one entry:

```json
{ "world": { "UNIVMAX": 100 } }
```

List an option there only to run it away from canon on purpose, and record the reason in
`docs/DECISIONS.md`. Restating a value you did not choose defeats the point, because the file
then looks authoritative while silently overriding a corrected default.

Any option can also be overridden by an environment variable of the same name, which takes
precedence — handy for Docker and CI:

```bash
PDAMMAX=40 docker compose up
```

Every value is clamped to the range the original enforced, and an unknown option name or a
non-numeric value is a hard error, so a typo fails loudly instead of looking like a setting that
had no effect.

---

## Running the tests

```bash
cd backend
npm test               # full Jest suite (600+ suites, 6,000+ tests)
npm run test:manual    # manual smoke tests (requires live DB)
```

```bash
cd frontend
npm test               # Vitest suite
npm run test:e2e       # Playwright browser E2E (requires a live stack)
```

Testing is a first-class requirement here, not a coverage number. What the suite exists to do is
make change safe, and [`docs/TEST_STRATEGY.md`](docs/TEST_STRATEGY.md) sets out what is
deliberately left untested and why.

Two layers are worth knowing about:

**Balance specs** (`backend/test/balance/`) re-read the original distribution at test time rather
than asserting a remembered value. They fail if a constant drifts, if a citation quotes a line
that is not there, or if data is read from the wrong copy of a `.MSG` file.

**Playwright E2E** drives a real Chromium against the running app: register a pilot, complete
onboarding, round-trip commands, assert the terminal UI renders. **Postgres and the backend must
already be running** (`npm run start:dev` in `backend/`); Vite is started automatically and an
existing dev server is reused. This layer exists for defects no unit test can see, chiefly the
rendering of the ASCII tables that `who`, `ros` and `pla` emit, where a CSS rule can destroy a
correct payload.

First run on a new machine needs the browser binary:

```bash
cd frontend && npx playwright install chromium
```

### What runs in CI

`.github/workflows/ci.yml` runs on every push to master and on pull requests. The backend suite
runs against a real PostgreSQL 16 service container, the frontend suite and build run beside it,
and both must pass before any image is built or published. A push that changes only tests, docs
or tooling runs the suites but builds nothing, because those paths never reach an image and a
rebuild would restart the live game for no reason.

Two things run locally and not in CI, both deliberately:

- **The Playwright specs**, because they need a seeded database, a backend with the debug
  endpoints enabled and a real browser, to drive a real-time game on a 6-second tick. Run them
  against the dev stack.
- **The two wall-clock performance budgets**, in `physics/bench.spec.ts` and
  `midnight/perf-budget.spec.ts`. Both measure the machine they run on, and a shared runner is
  not a machine worth measuring. `CI_LOW_PERF=1` skips them; CI sets it.

---

## Repository layout

```
galactic-empire-reborn/
  backend/             NestJS application (port 3000)
  frontend/            React + Vite terminal UI (port 5173)
  docs/                Architecture, decisions, progress, game mechanics
  specs/               spec-kit feature specs (001–022, all shipped)
  tools/               Extractors that generate canon data from the .MSG files
  reference/
    ge-source/         Original C source — READ ONLY
    ge-upstream/       The full vendored 3.2e distribution
    wiki/              Community transcription — orientation only
```

`docs/` is living documentation, updated in the same commit as the change it describes:

| File | What it is for |
|---|---|
| [`ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Module map and how the pieces fit |
| [`DECISIONS.md`](docs/DECISIONS.md) | Every deliberate deviation and why, numbered |
| [`GAME_MECHANICS.md`](docs/GAME_MECHANICS.md) | Implemented mechanics with C source references |
| [`TEST_STRATEGY.md`](docs/TEST_STRATEGY.md) | What is tested, what is not, and the filter |
| [`PROGRESS.md`](docs/PROGRESS.md) | Where the work is |
| [`DATA_MODEL.md`](docs/DATA_MODEL.md) | Schema and the columns that were dropped |
| [`DEPLOYMENT.md`](docs/DEPLOYMENT.md) | How it runs in production |

---

## How this port was written

This port was written by Rick Earley in collaboration with **Claude**, Anthropic's AI coding
assistant, using Claude Code. Hundreds of the commits in this repository carry a
`Co-Authored-By: Claude` trailer, and the method is stated plainly rather than left to be
inferred from the history.

It is worth stating because the method is load-bearing. A faithful port is an exercise in reading
sixteen thousand lines of 1990s C and not getting a number wrong, and everything in the
"What faithful means" section above — generated canon data, quoted citations checked by a test,
numbered deviations, six thousand tests — exists because no single reading of that source is
trusted, human or otherwise.

None of it makes the port correct. It makes an error findable, which is the most any
reimplementation of a game this old can honestly promise. Where you find one, the original is
right and this is wrong. [`NOTICE`](NOTICE) says the same at more length.

---

## License and credits

Galactic Empire was written by **Michael B. Murdock** (© 1988–1992) and later released
by him under the GNU General Public License, version 2 or later. This port continues that
work and is licensed under the **GNU Affero General Public License, version 3 or later** —
see [`LICENSE`](LICENSE), and [`NOTICE`](NOTICE) for the full attribution.

The Affero variant is deliberate. The plain GPL asks nothing of someone who only runs a
public network service, and that is exactly what this is, so anyone playing is entitled to
the source of what they are playing.

**Elwynor Technologies** maintain Galactic Empire today, and are acknowledged as the game's
current stewards. **This is not their port.** Elwynor's own port, to 32-bit Worldgroup and
The Major BBS V10, is at [elwynor/elwge](https://github.com/elwynor/elwge), also AGPL; a
further fork, [manicpop/ge-next](https://github.com/manicpop/ge-next), is also AGPL. No
code, data or fix from either is used here. What this project reads is Murdock's original
DOS-era C source, under the licence he wrote into its headers. The `/provenance` page on the
running site says the same thing to players.
