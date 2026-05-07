# Command Contracts: Ship Management

**Feature**: 013-ship-management
**Date**: 2026-05-06

All commands dispatch through `CommandRouterService.dispatch()` and follow the
existing `Command` interface (`{ keyword, aliases, minArgs, argMissingMessage,
handler }`). All return a `CommandResult` with `lines`, optional `broadcasts`,
and optional `events`. All require an active, non-abandoned ship (FR-803);
the router enforces this for every keyword in this feature.

---

## `cloak`

**Canonical**: `cmd_cloak` (GECMDS.C:3188), `cloakstat` (GEFUNCS.C:1366)

**Grammar**: `cloak <on|off>`
**Aliases**: `clo`
**minArgs**: `1`

| Sub-form | Pre-condition | Effect | Reply | Broadcast |
|---|---|---|---|---|
| `cloak on` | `cloak == 0`, `energy > CLENGUSE`, ship not in hyperspace (`where != 1`) | `cloak = 1`, `energy -= CLENGUSE` | "Cloaking device engaged." | none |
| `cloak on` | `cloak > 0` | none | "Cloaking device already engaged." | none |
| `cloak on` | `cloak == 0`, `energy <= CLENGUSE` | none | "Insufficient energy to engage cloak." | none |
| `cloak on` | `cloak < 0` (damaged) | none | "Cloaking device damaged." | none |
| `cloak on` | `where == 1` (hyperspace) | none | "Cannot cloak while in hyperspace." | none |
| `cloak off` | `cloak > 0` | `cloak = 0` | "Cloaking device disengaged." | sector: "{shipname} has decloaked." |
| `cloak off` | `cloak <= 0` | none | "Cloaking device already down." | none |
| anything else | — | none | "Usage: cloak <on\|off>" | none |

---

## `maint`

**Canonical**: `cmd_maint` (GECMDS.C:4452)

**Grammar**: `maint [password]`
**Aliases**: `mai`
**minArgs**: `0`

| Pre-condition | Effect | Reply |
|---|---|---|
| Ship not in orbit (`where < 10`) | none | "You must be orbiting a planet to perform maintenance." |
| Planet has password but `password` arg missing | none | "Maintenance requires a password." |
| Password mismatch | none | "Invalid maintenance password." |
| Planet uninhabited or `men < 25000` | none | "This planet has no maintenance facility." |
| `cantexit > 0` | none | "Cannot perform maintenance — ship is locked into combat." |
| In neutral zone but not Zygor planet 1 or 2 | none | "No maintenance available in the neutral zone except at Zygor." |
| `damage == 0` | none | "No maintenance is needed." |
| `cash < price` (200 normal, 2500 Zygor neutral) | none | "Insufficient funds for maintenance." |
| All checks pass | `cash -= price`, `repair = (damage / 3) + 1` | "Maintenance complete. Repair queue: {repair} units." |

---

## `transfer`

**Canonical**: `cmd_transfer` (GECMDS.C:3271) — semantics reinterpreted
(see research.md D1)

**Grammar**: `transfer <amt> <itemkw|gold> <target-shipid>`
**Aliases**: `tra`
**minArgs**: `3`

| Pre-condition | Effect | Reply |
|---|---|---|
| Target is self | none | "Cannot transfer to your own ship." |
| Target ship not online | none | "Target ship not online." |
| Target ship in different sector | none | "Target ship not in this sector." |
| Source quantity below requested amount | none | "Insufficient cargo." (or "Insufficient gold.") |
| All checks pass | source `items[i] -= amt` (or `items[I_GOLD] -= amt`), target `items[i] += amt` (atomic) | sender: "Transferred {amt} {item} to {target}." |

**Broadcast (recipient via per-user room)**: "{source-ship} transferred {amt} {item} to you."

`itemkw` matches the canonical `kwrd[]` table from `GEMAIN.H` (case-insensitive
prefix match per `genearas`). `gold` is a synonym for `I_GOLD = 12`.

---

## `jettison`

**Canonical**: `cmd_jettison` (GECMDS.C:6102), `jettison()` (GECMDS.C:6121)

**Grammar**: `jettison <amt|ALL> <itemkw>`
**Aliases**: `jet`
**minArgs**: `2`

| Pre-condition | Effect | Reply |
|---|---|---|
| Item keyword unknown | none | "Usage: jet <amt\|ALL> <item>" |
| `amt > items[i]` | none | "Insufficient cargo to jettison." |
| `amt <= 0` and not "ALL" | none | "Usage: jet <amt\|ALL> <item>" |
| All checks pass | `items[i] -= amt` (or `items[i] = 0` if "ALL") | "Jettisoned {amt} {item}." |

Jettisoned cargo is permanently lost. No planet, sector, or ship gains it
(FR-403).

---

## `set`

**Canonical**: `cmd_set` (GECMDS.C:5190) — option set deviates
(see research.md D4)

**Grammar**: `set <option> <on|off>` or `set ?`
**Aliases**: (none — `set` is not ambiguous in the router's three-letter prefix space)
**minArgs**: `1`

| Sub-form | Effect | Reply |
|---|---|---|
| `set ?` | none | listing of options and current values |
| `set auto-shield on` | `autoShield = true`, dirty flag set | "Option auto-shield set ON." |
| `set auto-shield off` | `autoShield = false`, dirty flag set | "Option auto-shield set OFF." |
| `set auto-repair on` | `autoRepair = true`, dirty flag set | "Option auto-repair set ON." |
| `set auto-repair off` | `autoRepair = false`, dirty flag set | "Option auto-repair set OFF." |
| any other option name | none | "Unknown option. Usage: set <auto-shield\|auto-repair> <on\|off>" |
| missing or invalid `<on\|off>` | none | "Usage: set <auto-shield\|auto-repair> <on\|off>" |

---

## `destruct`

**Canonical**: `cmd_destruct` (GECMDS.C:5025)

**Grammar**: `destruct`
**Aliases**: `des`
**minArgs**: `0`

| Pre-condition | Effect | Reply | Broadcast |
|---|---|---|---|
| In neutral zone | none | "Cannot self-destruct in the neutral zone." | none |
| `destruct > 0` | none | "Self-destruct already in progress." | none |
| `destruct == 0`, not in neutral zone | `destruct = COUNTDOWN (20)` | "Self-destruct sequence initiated." | sector: "{shipname} has initiated self-destruct sequence." |

---

## `abort`

**Canonical**: `cmd_abort` (GECMDS.C:5044)

**Grammar**: `abort`
**Aliases**: `abo`
**minArgs**: `0`

| Pre-condition | Effect | Reply | Broadcast |
|---|---|---|---|
| `destruct > 0` | `destruct = 0` | "Self-destruct sequence aborted." | sector (only if `destruct < 10` at time of abort): "{shipname} has aborted self-destruct." (matches canonical SELFD4A behavior) |
| `destruct == 0` | none | "No active self-destruct sequence." | none |

---

## `abandon`

**Canonical**: `cmd_abandon` (GECMDS.C:3420) — semantics reinterpreted
(see research.md D2)

**Grammar**: `abandon`
**Aliases**: `aba`
**minArgs**: `0`

| Pre-condition | Effect | Reply | Broadcast |
|---|---|---|---|
| Captain piloting any ship | ship `status` = abandoned, captain detached, gateway routes captain back through onboarding | "You have abandoned ship {shipname}." | sector: "{shipname} has been abandoned by its captain." |

After abandon, the captain remains authenticated but shipless; subsequent
gameplay commands return an "you have no active ship — please create one"
message until the onboarding flow assigns a new ship (FR-704).

---

## Command Router Registration

In `commands.module.ts`, the eight new handler services are added to the
`providers` array and to the `commands` array passed to
`CommandRouterService.register(...)`. No changes to `CommandRouterService`
itself.
