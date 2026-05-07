# Data Model: Ship Management Commands

**Feature**: 013-ship-management
**Date**: 2026-05-06

## Schema Changes

### `Ship` (Prisma model)

Two new fields added; everything else (`cloak`, `damage`, `destruct`, `repair`,
`items`, `cantexit`) already exists.

| Field | Type | Default | Purpose |
|---|---|---|---|
| `autoShield` | `Boolean` | `false` | Set via `set auto-shield on`; consumed by future shield-tick logic. |
| `autoRepair` | `Boolean` | `false` | Set via `set auto-repair on`; consumed by future repair-tick logic. |

**Migration**: `20260506xxxxxx_ship_auto_flags` adds two `BOOLEAN NOT NULL DEFAULT false`
columns to the `Ship` table. No backfill needed (default applies to all rows).

No other Prisma changes. `User.cash` and `User.score` already exist and are
mutated by `maint` and `destruct` respectively.

---

## In-Memory `ShipState` Additions

| Field | Type | Mirror of |
|---|---|---|
| `autoShield` | `boolean` | `Ship.autoShield` |
| `autoRepair` | `boolean` | `Ship.autoRepair` |

Both flow through the existing dirty-flag flush cycle in
`ShipStateService.flush()`.

No new fields are needed for cloak (`cloak` exists, value `10` already used by
torpedo/report/Cybertron paths) or destruct (`destruct` exists as `Int`,
populated in seed data and Prisma schema).

---

## Entities Touched

| Entity | Operation | Write path |
|---|---|---|
| `ShipState.cloak` | set to `1` (cmd_cloak on), `0` (cmd_cloak off, auto-decloak), or transitioned `1→2→10` by `cloakTick` | `cloak.handler.ts`, `tick.service.ts:cloakTick` |
| `ShipState.energy` | debit `CLENGUSE` on cloak activation and per-tick while cloaked | `cloak.handler.ts`, `tick.service.ts:cloakTick` |
| `ShipState.destruct` | set to `COUNTDOWN=20` (cmd_destruct), decremented per physics tick, set to `0` (cmd_abort, expiration) | `destruct.handler.ts`, `abort.handler.ts`, `tick.service.ts:destructTick` |
| `ShipState.damage` | reduced indirectly via `repair` queue on `cmd_maint` | `maint.handler.ts` |
| `ShipState.repair` | set to `(damage/3) + 1` on `cmd_maint` success | `maint.handler.ts` |
| `ShipState.items[i]` | decremented on `cmd_jettison`, decremented on `cmd_transfer` source, incremented on `cmd_transfer` target | `jettison.handler.ts`, `transfer.handler.ts` |
| `ShipState.autoShield` / `autoRepair` | set via `cmd_set <opt> <on\|off>` | `set.handler.ts` |
| `ShipState.status` | set to "abandoned" marker on `cmd_abandon` (specific value defined in `_ship-management-constants.ts`) | `abandon.handler.ts` |
| `User.cash` | debited by maint price on `cmd_maint` success | `maint.handler.ts` |
| `User.score` | reduced by destruct penalty on countdown expiration | `tick.service.ts:destructTick` (via existing destruction routine) |
| `User`/`Ship` association | captain detached from ship on `cmd_abandon`; gateway routes future commands back through onboarding | `abandon.handler.ts`, gateway middleware |

---

## State Transitions

### Cloak

| From | Trigger | To | Side effects |
|---|---|---|---|
| `cloak == 0`, `energy > CLENGUSE` | `cmd_cloak on` | `cloak = 1`, `energy -= CLENGUSE` | "cloak engaged" event |
| `cloak == 0`, `energy <= CLENGUSE` | `cmd_cloak on` | unchanged | "insufficient energy" reply |
| `cloak == 1` | physics tick | `cloak = 2`, `energy -= CLENGUSE` | none (or auto-decloak if energy fails) |
| `cloak == 2` | physics tick | `cloak = 10`, `energy -= CLENGUSE` | none |
| `cloak == 10` | physics tick | `cloak = 10`, `energy -= CLENGUSE` | auto-decloak if energy < CLENGUSE → "cloak collapsed" event |
| `cloak > 0` | `cmd_cloak off` | `cloak = 0` | "cloak disengaged" event |
| `cloak < 0` | physics tick | `cloak += 1` (toward 0) | none — out of scope (combat-induced, not commanded) |

### Destruct

| From | Trigger | To | Side effects |
|---|---|---|---|
| `destruct == 0` | `cmd_destruct` | `destruct = COUNTDOWN (20)` | "destruct initiated" sector warning |
| `destruct > 0` | `cmd_destruct` | unchanged | "already counting down" reply |
| `destruct > 0` | physics tick | `destruct -= 1` | sector warning every tick (FR-604) |
| `destruct == 0` after decrement | physics tick | ship destroyed | destruction event, score penalty applied |
| `destruct > 0` | `cmd_abort` | `destruct = 0` | "abort" event |
| `destruct == 0` | `cmd_abort` | unchanged | "no active self-destruct" reply |

### Abandon

| From | Trigger | To | Side effects |
|---|---|---|---|
| ship active, captain piloting | `cmd_abandon` | ship `status` = abandoned, captain detached | sector "abandoned" event; gateway routes future commands through onboarding (FR-704) |
