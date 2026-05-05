# Quickstart: Ephemeral Droid AI

A manual end-to-end verification recipe. The corresponding automated
flow lives in `test/game/integration/droid-end-to-end.spec.ts` — this
document is the human-readable companion.

## Prerequisites

- A clean `ge_test` database (or `ge_dev` is fine for visual
  verification).
- Backend built and runnable (`cd backend && npm run build && npm run start:dev`).
- A connected player ship (any frontend client or `wscat` against the
  game gateway). The Droid spawn loop is gated on ≥1 player online —
  with no players, the universe stays empty.
- The seeded `Random` adapter is **only** used in tests; production
  uses `Math.random`. For a manual run on dev, expect the spawn loop
  to take ~15 minutes wall clock to fill (see SC-001). To accelerate,
  use the dev-only debug controller endpoint
  `POST /debug/droid/force-spawn?class=11` to bypass the cadence.

## Steps

### 1. Verify clean DB state

Before starting:

```sql
SELECT COUNT(*) FROM "Ship" WHERE shpclass IN (10, 11, 12);
-- expect: 0
SELECT COUNT(*) FROM "User" WHERE userid LIKE '@Droid-%';
-- expect: 0
```

### 2. Start the server, log a player in

```bash
cd backend && npm run start:dev
# in a second terminal, connect a player ship (any standard client)
```

The Droid module's `onModuleInit` should log:

```
[DroidTickService] Subscribed to TickKind.PHYSICS
[DroidTickService] Spawn cadence: 30 ticks (~3 minutes wall clock)
```

### 3. Wait for spawn cadence rollover

After ~3 minutes (1 spawn cadence rollover), expect log lines:

```
[DroidSpawner] Spawned Lydorian Garbage Scow as @Droid-1 at (12.3, -4.7)
[DroidSpawner] Spawned Murdonian Transport as @Droid-2 at (-8.1, 9.4)
[DroidSpawner] Spawned Vakory Survey Drone as @Droid-3 at (0.5, -15.2)
```

After ~6 minutes (2 rollovers), the population should reach the cap of
6 (2 of each class). Per SC-001, the cap is reached within ~15
physics ticks of the first eligible spawn evaluation — note the
"physics ticks" unit (each is 6s); the wall clock is therefore ~15 ×
6 = ~90 seconds for the first 6 spawns IF all happen in a single
spawn round (the C source allows this; our implementation does too).

### 4. Confirm zero DB rows

While Droids are alive in memory:

```sql
SELECT COUNT(*) FROM "Ship" WHERE shpclass IN (10, 11, 12);
-- expect: 0  (FR-001 / SC-003)
SELECT COUNT(*) FROM "User" WHERE userid LIKE '@Droid-%';
-- expect: 0
```

The dev-only debug endpoint returns the current in-memory population:

```
GET /debug/droid/population
→ {
  "class10": ["@Droid-1"],
  "class11": ["@Droid-2", "@Droid-4"],
  "class12": ["@Droid-3", "@Droid-5"]
}
```

### 5. Scan and observe annoy chatter

Move the player ship into scan range of a Droid. Within ~4 evaluation
rolls (~12 minutes wall clock at 3-minute cadence — or instantly via
the debug-controller force-tick endpoint), the player should see a
chat line:

```
> Lydorian-243: Hey, watch where you're going pal!
```

(Actual messages are drawn from `droid-message-pool.ts`; the example
above is illustrative.)

### 6. Engage a Murdonian Transport

Fire phasers at a Murdonian Transport. On the next Droid action tick:

- The Murdonian emits a call-for-help annoy (DRDHLP11..15 pool).
- If both ships are in normal space, the Murdonian fires phasers back
  (visible as `combat.phaser-fired` event from the Murdonian to the
  player).
- On a 1-in-10 roll, the Murdonian alters its heading and speed
  (visible as `physics.ship-moved` events with new `head2b` and
  `speed2b`).

### 7. Kill the Murdonian and confirm cargo transfer

Continue firing until the Murdonian's `damage >= 100`. The 006b kill
chain runs:

- `combat.ship-destroyed` fires with `victimUserid: "@Droid-2"`,
  `attackerUserid: <player>`.
- 006b loot rule transfers the Murdonian's `items[]` to the attacker
  (gold, missiles, decoys, etc., per `droid_init` randomized loadout).
- `droid.killed` fires.
- `ShipStateService.removeFromGame({ userid: "@Droid-2", shipno: 1 })`
  removes the Murdonian from the in-memory map.
- The spawn slot for class 11 frees; on the next spawn cadence
  rollover, a fresh Murdonian spawns.

Confirm with:

```sql
SELECT COUNT(*) FROM "Ship" WHERE shpclass = 11;
-- expect: 0  (no row was ever created)
```

And on the player side, the player's `cash` and `items[]` reflect the
loot transfer (visible via `report` command output).

### 8. Restart the server

Stop the backend (Ctrl+C). Restart it (`npm run start:dev`).

The Droid module's boot sequence:

```
[DroidTickService] Hydrate skipped — Droids are ephemeral
[DroidTickService] Subscribed to TickKind.PHYSICS
[DroidTickService] Spawn cadence: 30 ticks
```

Confirm:

- In-memory population starts at 0 (`GET /debug/droid/population`).
- DB queries from step 4 still return 0 rows.
- Spawn loop refills the population on subsequent cadence rollovers.

### 9. Cybertron spawn-visibility regression (US4 / FR-032)

In a separate test session (already automated at
`test/game/cybertron/createSpawn-visibility.spec.ts`), force a
Cybertron spawn:

```
POST /debug/cybertron/force-spawn?class=3
```

Immediately query the in-memory ship state:

```
GET /debug/cybertron/in-memory?userid=Cybrg-1
→ { found: true, shipname: "Cybrg-1", classNumber: 3, ... }
```

The Cybertron MUST be present in the same logical operation — not
after a server restart. (This was the defect addressed in commit
e2c8c9a; the regression test pins it.)

## Pass criteria

| Criterion | Expected | Spec ref |
|-----------|----------|----------|
| Spawn fills to 6 within ~15 physics ticks | ✓ | SC-001 |
| Annoy rate within 15-35/100 | ✓ | SC-002 |
| Zero `Ship` rows for shpclass IN (10,11,12) at every checkpoint | ✓ | SC-003 / FR-001..004 |
| Murdonian cargo transfers to attacker on kill | ✓ | SC-004 |
| Cybertron visible in same tick as spawn | ✓ | SC-005 / FR-032 |
| Jammed Droid emits no annoy and fires no weapon | ✓ | SC-006 |
| Vakory at >75% damage deploys mine + jammer before flee | ✓ | SC-007 |
