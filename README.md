# Galactic Empire Reborn

A faithful web port of the classic MajorBBS game **Galactic Empire** (1988–1992) by Mike Murdock.
Real-time multiplayer space combat and economy in a 30×15 sector universe — text commands,
ASCII scan maps, persistent Cybertron AI, planet colonization, and midnight scoring.

**Stack**: NestJS · PostgreSQL 16 · Socket.io · React + Vite · Prisma ORM

---

## Quick start (dev server)

### 1. Prerequisites

- Node.js 20+
- Docker + Docker Compose

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

### 3. Start the database

```bash
cd backend
npm run db:up
```

This starts a `postgres:16-alpine` container with the `ge` database (and a separate `ge_test`
database for the test suite).

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
2. **Choose a ship class** (1–10; class 2 Stealth Fighter or class 5 Star Cruiser recommended for new players)
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
| `imp 5000` | Set impulse speed to 5000 |
| `war 10` | Engage warp 10 |
| `pha 75 100` | Fire phasers at bearing 75°, 100% charge |
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

## Running the tests

```bash
cd backend
npm test               # full Jest suite (~2450 tests)
npm run test:manual    # manual smoke tests (requires live DB)
```

```bash
cd frontend
npm test               # Vitest suite
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
