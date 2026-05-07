# Data Model — Feature 014 Planet Attack

**No schema changes.** This feature only reads and writes existing tables
established by features 001 (Prisma schema), 005 (planet system), 009
(midnight job mail), and 012 (social commands user-room). This document
catalogs which fields are touched and how, for implementer reference.

---

## Planet (existing table)

Read fields:
- `userid` — current owner; `att` rejects if equals attacker's userid (FR-014-004); `pln` filters by this; `pri` checks for owner-vs-foreign pricing.
- `password` — `mai` password gate compares against this (FR-014-060/061/062). The literal `"none"` is the no-password sentinel.
- `spyowner` — `call_4_help` reads to gate spy-intel mail (FR-014-029a).
- `name`, `xsect`, `ysect`, `plnum` — `pln` projects these; mail templates substitute `name`, `xsect`, `ysect`.
- `type` — wormhole rejection check for `att` (FR-014-003); `PLTYPE_WORM` flag.
- `items[].qty` — read for combat math (defender troops, defender fighters, every other item for the destruction path), buy precondition stock check.
- `items[].sell` — `pri` foreign-caller flag check (FR-014-053).
- `items[].reserve` — subtracted from available stock for foreign callers (FR-014-053 step e).
- `items[].markup2a`, `items[].baseprice` — `pri` price computation (FR-014-051).

Mutated fields (under per-planet mutex):
- `userid` — set to attacker's userid on `won == 1` (FR-014-026).
- `items[I_TROOPS].qty` — set to surviving defender troops (`left2`) for troop attack; defectors added on retreat (FR-014-018, FR-014-015).
- `items[I_FIGHTER].qty` — set to surviving defender fighters (`left2`) for fighter attack (FR-014-025).
- `items[*].qty` — for non-troop items on troop-attack high-ratio path (FR-014-016) and non-fighter items on fighter-attack high-ratio path (FR-014-023): `qty -= rndm(15)` clamped to ≥ 0.

No new columns. No migration.

---

## Ship (existing table)

Read fields:
- `where` — orbit gate (`>= 10` for `att`/`pri`/`mai`).
- `userid` — used for self-attack rejection and ownership transfer.
- `shpclass` — used to look up `max_attk` capability (FR-014-002).
- `coord` (`xcoord`, `ycoord`) — used to derive sector for planet lookup.
- `items[I_TROOPS].qty`, `items[I_FIGHTER].qty` — cargo sufficiency check (FR-014-007).
- `shipname` — substituted into distress mail templates.

Mutated fields:
- `hostile` — set to `where` (the orbit's plnum-with-offset value) at attack initiation; cleared to `0` on `won == 1` (FR-014-008, FR-014-026).
- `cantexit` — set to `FIRETICKS = 10` at attack initiation (FR-014-008).
- `items[I_TROOPS].qty` / `items[I_FIGHTER].qty` — `qty -= num` at deduction (FR-014-009); `qty += left1` at surviving-attacker return (FR-014-018, FR-014-025).

No new columns.

---

## ShipClass (existing table)

Read field only:
- `max_attk` — `att` rejection if `0` (FR-014-002).

No mutation.

---

## WarUser (existing table)

Mutated field only:
- `planets` — incremented by 1 for the attacker on `won == 1` (FR-014-026).

No new columns.

---

## User (existing table)

Read field only:
- `cash` — `pri` precondition ladder step (f) (BUY2 if insufficient).

No mutation in this feature (`pri` is read-only; `mai` cash debit was
already implemented in feature 013 and is unchanged here apart from the
password-gate guard).

---

## MailStat (existing table)

Insert-only:
- One row per distress event (MESG02/03/04/05) — populated with:
  - `class = MAIL_CLASS_DISTRESS` (1)
  - `recipient_userid = plptr->userid` (planet owner at attack time)
  - `sender_userid = attacker.userid`
  - `type` — one of MESG02..MESG05
  - `body` — formatted template per research.md D3
  - `created_at = now()`
- Optional spy-mail row inside `call_4_help` (per D4 / FR-014-029a):
  - `class = MAIL_CLASS_DISTRESS`
  - `recipient_userid = plptr->spyowner`
  - rest same payload as the owner mail

Reuses the existing write path used by `planet-economy.service.ts`.
No new mail class, no new schema column.

---

## In-memory state — `PlanetStateService.Map`

Authoritative source for planet items and owner during gameplay (per
Constitution III). All `att` mutations happen here first, marked dirty,
and async-flushed to `Planet` rows. The per-planet mutex (introduced in
feature 005) serializes all `att` invocations against the same plnum.

## In-memory state — `ShipStateService.Map`

Authoritative for ship cargo, `hostile`, `cantexit`. Mutations marked
dirty and async-flushed to `Ship` rows.

## In-memory state — Socket.io rooms

Reused (no new rooms):
- `user:${userid}` — established in feature 012; receives the
  `event.log` real-time owner alert from `call_4_help`.

---

## State transitions — planet capture (`won == 1`)

```
[OWNED by U_old]
  → att resolves with won=1
  → planet.userid := U_attacker
  → planet.items[*] mutated by combat math
  → ship.hostile := 0
  → WarUser(U_attacker).planets += 1
  → mail row inserted (recipient=U_old, type=MESG03 or MESG05)
  → call_4_help fires:
      → if U_old online: emit event.log to user:${U_old}
      → if spy roll passes & spyowner set: insert spy mail row
[OWNED by U_attacker]
```

## State transitions — attack rejected at re-validation (concurrent)

```
[OWNED by U_old, attacker A acquires lock]
[A in queue waits, B captures, releases lock]
[A acquires lock]
  → re-validate preconditions against fresh planet state
  → planet.userid now == A.userid → self-attack rejection
  → no cargo deduction, no combat, no mail
[OWNED by A] (state unchanged from B's capture)
```
