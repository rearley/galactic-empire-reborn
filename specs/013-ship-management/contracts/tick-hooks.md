# Tick Hook Contracts: Ship Management

**Feature**: 013-ship-management
**Date**: 2026-05-06

Two new callbacks are added to the existing physics tick (`TickService.physicsTick()`,
6-second cadence). Both iterate over `ShipStateService.activeShips()` and operate
on in-memory state only; the dirty flag is set so the existing async flush
captures any persistent changes.

No new schedulers, no `@Interval` decorators (Constitution III).

---

## `cloakTick(ship: ShipState): void`

**Canonical**: `cloakstat` (GEFUNCS.C:1366)

For each ship with `cloak > 0`:

1. If `energy < CLENGUSE`, set `cloak = 0`, emit a "cloak collapsed" event to
   the captain, mark dirty, return.
2. Decrement `energy -= CLENGUSE`, mark dirty.
3. If `cloak == 1`, set `cloak = 2`.
4. Else if `cloak == 2`, set `cloak = 10`.
5. Else (`cloak == 10`), no further transition.

For each ship with `cloak < 0` (damaged): increment by 1 toward 0; on reaching
0, emit no event (canonical behavior). Out of scope for command-side coverage
in this feature, but the tick callback handles it for completeness.

---

## `destructTick(ship: ShipState): void`

**Canonical**: `destruct()` (GEFUNCS.C:1820)

For each ship with `destruct > 0`:

1. Decrement `destruct -= 1`, mark dirty.
2. If `destruct == 0` after decrement: invoke the existing ship-destruction
   routine (which applies the score penalty, removes the ship from the active
   ship registry, and broadcasts a "destroyed" event to the sector).
3. Else (`destruct > 0` after decrement): broadcast a per-tick warning to the
   sector room. The text follows the canonical SELFD2 format ("{shipname}:
   {destruct} ticks until self-destruct"), with special canonical wording at
   the `10`, `5`, and `2` thresholds (SELFD3 / SELFD3 / SELFD3, see
   GEFUNCS.C:1833-1849).

---

## Wire-up

In `tick.service.ts`, the existing `physicsTick()` method gains two new calls
inside the per-ship loop:

```text
for each ship in activeShips:
  ... existing physics ...
  cloakTick(ship)
  destructTick(ship)
```

Both callbacks are pure functions on a `ShipState` plus an injected
`EventEmitter` for the per-captain and sector broadcasts. They are unit-testable
in isolation with a synthetic `ShipState` and a fake event emitter.

---

## Testing

| Scenario | Tick callback | Assertion |
|---|---|---|
| `cloak = 1`, energy sufficient | `cloakTick` | after one call: `cloak = 2`, energy debited; after two calls: `cloak = 10` |
| `cloak = 10`, energy = CLENGUSE - 1 | `cloakTick` | `cloak = 0`, "cloak collapsed" event emitted |
| `destruct = 3` | `destructTick` × 3 | first two calls: warning broadcast, `destruct` decrements; third call: ship destroyed, score penalty applied |
| `destruct = 1`, then `cmd_abort` | abort handler then `destructTick` | `destruct = 0` after abort; tick is a no-op; ship survives (SC-005) |
| `destruct = 20` over multiple ticks | `destructTick` × 20 | warnings broadcast on every tick (FR-604 / SC-004) |

All run with Jest `useFakeTimers()` to avoid real wall-clock waits per
Constitution III rationale (1).
