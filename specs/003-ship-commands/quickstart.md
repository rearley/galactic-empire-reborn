# Quickstart — Ship Commands & Terminal Frontend

End-to-end smoke for feature 003 from a clean checkout.

## Prerequisites

- Node 20.x, pnpm or npm
- Docker + Docker Compose (Postgres 16)
- Feature 001 schema migrated, feature 002 tick engine green:
  ```
  cd backend && npm install && npm run prisma:migrate && npm test
  ```
  All 288 backend tests should pass before starting.

## 1. Start Postgres + seed

```
docker-compose up -d postgres
cd backend
npm run prisma:migrate
npm run prisma:seed     # seeds 18 ShipClass rows + at least one Ship for DEV user
```

The seed must produce a `Ship` row with `userid = 'DEV'` so the dev frontend has
something to control. If absent, add it under `backend/prisma/seed/dev-ship.ts`.

## 2. Start the backend

```
cd backend
npm run start:dev
```

Watch the log for:
```
[ShipStateService] hydrated N ships
[TickService]     Started SHIP_UPDATE @1000ms, PHYSICS @6000ms
```

## 3. Start the frontend

```
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The connection indicator should turn green within ~250 ms.

## 4. Try the five commands

In the bottom input, type each:

| Input | Expected event log |
|-------|---------------------|
| `report nav` | Multi-line nav read-out — header, sector, speed, heading. |
| `scan sh` | Per-ship descriptive lines on the left; scan map on the right populates. |
| `rotate 45` | `Now turning to <new heading> degrees.` (no energy debit yet — TODO(006)) |
| `imp 50` | `Engines fired, new course <heading> degrees.` |
| `warp 5` | `Engines fired, new course <heading> degrees.` (or `WARP01` if class has no warp) |

## 5. Verify persistence cadence

- Issue `rotate 90`. Within 1 second the `Ship.degrees` column for `userid='DEV'` should
  read 90:
  ```
  psql -U galemp -d galemp -c "SELECT userid, shipno, degrees, percent FROM \"Ship\" WHERE userid='DEV';"
  ```
- Issue 5 commands rapidly. Open backend logs and confirm only one `prisma.ship.update`
  fires per heartbeat (one row, latest values) — not five.
- Sit idle 10 seconds. Confirm zero `prisma.ship.update` log lines (SC-003).

## 6. Verify error paths

| Input | Expected line |
|-------|---------------|
| `flarp` | `Unknown command. Type "help" for a list.` |
| `rotate` | `Usage: rotate <-180..180>` |
| `rotate abc` | `Number out of range (-180-180).` |
| `warp 999` | `Speed exceeds maximum allowed by 50%.` |
| `imp 200` | `Number out of range (0-99).` |

In every case, no DB write should occur (verify by query counter or log inspection).

## 7. Run the test suites

```
cd backend && npm test            # ≥ 35 new tests added by 003 (≥ 323 total)
cd frontend && npm test           # ≥ 6 frontend tests
```

A failing balance regression test means a constant changed — that is the test working as
intended; do **not** mute it without recording the deviation in the relevant spec.

## 8. Close out

When tasks.md is fully checked off and CI is green:
- Update `docs/PROGRESS.md` with the date, completed items, test counts, deferrals
  (rotation engine + gates → 006, movement physics → 006, full report cargo/wpns → 005/006).
- Update `docs/ARCHITECTURE.md` to add the `ShipStateService` and `CommandRouter` boxes.
- Update `docs/GAME_MECHANICS.md` with the five commands and their `GECMDS.C` anchors.
- `git push origin 003-ship-commands` and open a PR with the standard Constitution Check.
