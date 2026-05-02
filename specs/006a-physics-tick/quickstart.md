# Quickstart — Physics Tick Activation

Manual verification recipe for the 006a feature. Run after `/speckit-implement`
finishes and the test suite is green.

## Prerequisites

- Backend builds (`pnpm --filter backend build` is clean).
- Postgres is up and migrated (`docker compose up -d db && pnpm --filter backend prisma migrate deploy`).
- `ShipClass` seed has run (`pnpm --filter backend prisma db seed`).

## 1 — Boot the backend

```bash
cd backend && pnpm start:dev
```

Confirm in the logs:

```
[Nest] LOG [TickService]     Started SHIP_UPDATE @1000ms, PHYSICS @6000ms
[Nest] LOG [ShipStateService] Hydrated N ships from Postgres
[Nest] LOG [PhysicsTickService] Subscribed to PHYSICS tick
[Nest] LOG [ShipClassCacheService] Hydrated K ship classes
```

## 2 — Seed two ships from a Prisma REPL

In a second terminal:

```bash
cd backend && pnpm prisma studio
```

Create or edit two ships:

| ship | userid | shipno | shpclass | xcoord | ycoord | heading | speed | speed2b | head2b | energy | status | where |
|------|--------|--------|----------|--------|--------|---------|-------|---------|--------|--------|--------|-------|
| Player | `pilotA` | 1 | a class with `maxAcceleration = 5000`, `maxWarp = 10` | 5.0 | 5.0 | 90 | 0 | 1000 | 90 | 50000 | 1 | 0 |
| AI | `cybA` | 1 | the Cybertron class | 10.0 | 5.0 | 270 | 0 | 500 | 270 | 50000 | 2 | 0 |

(`status = 1` for player, `2` for Cybertron.) Restart the backend so they
hydrate into `ShipStateService`.

## 3 — Watch the physics tick

Tail the backend log. Within 6 seconds you should see:

- A `physics.hyperspace` event for ship `pilotA:1` (direction `enter`,
  speed `1000`) — Cybertron does **not** cross because its target is 500.
- Successive ticks advancing both ships' coordinates along their headings.
- Within ~30 seconds, ship `pilotA:1` crosses from sector `(5, 5)` to
  `(6, 5)` (or similar depending on exact heading), and a
  `physics.sector-transition` event fires.

## 4 — Verify energy decrement asymmetry

Pause the seed REPL, requery both ships' energy after 60 seconds. Expected:

- `pilotA` energy is below 50000 (debited `MOVENGUSE = 10` per tick × 10
  ticks = 100 from maintenance, plus one `ACCENGAMT = 120` step on the
  warp-boundary crossing → ~49880).
- `cybA` energy is **still 50000** (AI ships skip the maintenance debit).

If the Cybertron's energy dropped, AI-ship gating regressed.

## 5 — Verify orbit/dock skip

Set `pilotA.where = 13` (orbit around planet 3 in this sector) via Studio
without restarting. Wait 18 seconds (3 ticks). Expected:

- `pilotA.xcoord` / `ycoord` did NOT change.
- `pilotA.hypha` and `pilotA.cantexit` are decremented if they were >0
  (countdowns still tick when in orbit).

## 6 — Verify warp command gate (SC-006)

Open the WebSocket REPL or the gateway sandbox. Issue, in order:

| Command | Expected |
|---------|----------|
| `warp 5` | `Engines firing... heading 90` (no warning) |
| `warp 11` | `Warning: speed exceeds rated maximum of warp 10.` then engines firing |
| `warp 16` | `Excessive warp factor!` (WARP03 — 16 > 10 + 5 hard cap) |
| (set `topspeed = 0` then) `warp 5` | `Your warp drive is offline.` (WARPSPD2) |
| (set `shpclass` to a no-warp class then) `warp 5` | `Your ship has no warp drive.` (WARP01) |
| `warp -1` | WARP02 negative refusal |

## 7 — Failure isolation smoke test

Mutate one ship's state to deliberately trigger a math fault (e.g., set
`speed` to `NaN`). Wait one tick. Expected:

- A single error log: `[PhysicsTickService] ship pilotA:1 fault on tick N: …`
  with stack trace.
- The other ship advanced normally.
- The fault counter exposed at `GET /debug/ticks` incremented by 1.
- Next tick, the faulted ship is re-tried (after you reset `speed` to a
  finite number, it advances again — no quarantine).

## 8 — Performance budget

Stop the backend. Run the bench unit:

```bash
cd backend && pnpm test physics-math.bench
```

Expected: 100 ships through one `advanceAll()` call in `< 50 ms` on the
project's CI runner.

---

If any of steps 3–8 deviate, the implementation does not match the spec
and 006b combat will inherit broken physics. Report the deviation in the
PR before merging.
