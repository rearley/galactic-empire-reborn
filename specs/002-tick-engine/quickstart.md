# Quickstart — Tick Engine & Real-time Foundation

How to boot the backend, verify the heartbeats, and run the manual 10-minute soak referenced
by SC-002.

---

## Prerequisites

- Node.js 20+
- Docker (for Postgres)
- Repo cloned, on branch `002-tick-engine`

## First-time setup

```bash
cd backend
npm install
npm run db:up           # starts Postgres in Docker, waits for ready
npm run prisma:generate
npm run prisma:push     # applies feature 001's schema
```

## Boot the server

```bash
cd backend
npm run start:dev       # nest start --watch — added by this feature
```

Expected log output within 5 seconds (SC-001):

```
[Nest] LOG [PrismaService]   Connected to PostgreSQL
[Nest] LOG [GameGateway]     Socket.io listening on /socket.io
[Nest] LOG [TickService]     Started SHIP_UPDATE @1000ms, PHYSICS @6000ms
[Nest] LOG [Bootstrap]       Listening on http://localhost:3000
```

## Verify heartbeats with a tiny client

```bash
node -e "
  const io = require('socket.io-client');
  const s = io('http://localhost:3000');
  s.on('connect', () => {
    console.log('connected', s.id);
    s.emit('sector:join', { x: 5, y: 5 });
  });
  s.on('sector:joined', console.log);
  s.on('error', console.error);
"
```

Expected:
```
connected <socket-id>
{ x: 5, y: 5, room: 'sector:5:5' }
```

Try an out-of-bounds join to verify FR-009:
```bash
node -e "
  const io = require('socket.io-client');
  const s = io('http://localhost:3000');
  s.on('connect', () => s.emit('sector:join', { x: 99, y: 99 }));
  s.on('error', e => { console.log('error:', e); process.exit(0); });
"
```

Expected:
```
error: { event: 'sector:join', code: 'OUT_OF_BOUNDS', message: 'Sector (X,Y) is outside galaxy bounds [1..30, 1..15]' }
```

## Run the automated test suite

```bash
cd backend
npm test
```

This runs:
- Existing 250 Prisma schema tests (unchanged by this feature).
- New unit tests for `TickService` cadence + subscriber isolation (fake timers, < 1s).
- New integration tests for `PrismaService` lifecycle and `GameGateway` join/leave/disconnect.
- New e2e boot test.

All MUST pass (SC-006).

---

## Manual 10-minute soak (SC-002)

This is **not** an automated CI gate — it's an operator smoke test you run before claiming
the feature is shippable.

1. Boot the server (`npm run start:dev`).
2. Open a second terminal and start the heartbeat counter:
   ```bash
   curl -N http://localhost:3000/debug/tick-stats
   ```
   (Feature exposes a debug endpoint that returns the current SHIP_UPDATE / PHYSICS tick
   counts. Returned as JSON; poll or use SSE if implemented.)
3. Note `tickNumber` for both kinds.
4. Wait 10 minutes by the clock.
5. Note `tickNumber` again. The deltas MUST be:
   - `SHIP_UPDATE`: 600 ± 30 (±5%)
   - `PHYSICS`: 100 ± 5 (±5%)
6. Send `SIGTERM` (`Ctrl+C`). Process MUST exit within 3 seconds (SC-003) with no orphaned
   timers — verify with `lsof -p <pid>` showing no DB connections lingering.

---

## Shutdown

```
Ctrl+C
```

Expected:
```
[Nest] LOG [TickService]     Stopped SHIP_UPDATE, PHYSICS
[Nest] LOG [PrismaService]   Disconnected from PostgreSQL
[Nest] LOG [Bootstrap]       Goodbye
```

Process exits 0 within 3 seconds.
