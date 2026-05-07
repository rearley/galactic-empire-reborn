# Quickstart: Ship Management Commands

**Feature**: 013-ship-management
**Date**: 2026-05-06

End-to-end manual verification path against a running backend. Two captain
sessions are required for the transfer scenario.

## Prerequisites

- Backend running locally (`docker-compose up`).
- Two captains created via the feature-011 onboarding flow, both connected to
  the React frontend (or the CLI test client).
- Captains placed in the same sector for the transfer scenario.

---

## 1. Cloak

**Captain A** types:

```
cloak on
```

Expected: "Cloaking device engaged." Energy drops by `CLENGUSE`.

After ~12 seconds (two physics ticks), captain A's `report` shows their own
ship as cloaked. Captain B in the same sector running `report` does NOT see
captain A's ship.

```
cloak off
```

Expected: "Cloaking device disengaged." Captain B's `report` again lists
captain A's ship.

**Pass criteria** (SC-001): visibility is restored on decloak; energy debit
matches `CLENGUSE`.

---

## 2. Maintenance

Apply damage to captain A via the test harness (or take a phasor hit). Orbit a
friendly planet (the captain's home planet works).

```
maint
```

Expected: "Maintenance complete. Repair queue: {N} units." Cash balance drops
by `200` credits. After subsequent ticks, damage decrements.

**Pass criteria** (SC-002): cash debit matches the canonical `200` (or `2500`
on Zygor neutral); repair queue is `(damage / 3) + 1`.

---

## 3. Transfer

Place both captains in the same sector. Captain A has 1000 of `food`.

Captain A:

```
transfer 250 food <captain-B-shipid>
```

Expected on A: "Transferred 250 food to {B-shipname}."
Expected on B: "{A-shipname} transferred 250 food to you."

Captain A's `report` shows 750 food; captain B's shows 250 more than before.

**Pass criteria** (SC-003): total food across the two ships is conserved.

---

## 4. Jettison

Captain A:

```
jet 100 food
```

Expected: "Jettisoned 100 food." `report` shows 100 fewer.

```
jet ALL ore
```

Expected: "Jettisoned {N} ore." `report` shows 0 ore.

**Pass criteria** (FR-403): no other ship or planet anywhere in the universe
gains the jettisoned items.

---

## 5. Set

Captain A:

```
set auto-shield on
set auto-repair on
```

Each should reply with "Option … set ON."

```
set ?
```

Expected: listing showing both flags as ON.

Disconnect captain A and reconnect. After re-login, `set ?` still shows both
flags as ON.

**Pass criteria** (SC-006): flags persist across sessions.

---

## 6. Self-destruct and abort

Captain A in a non-neutral sector:

```
destruct
```

Expected: "Self-destruct sequence initiated." All captains in the sector see a
warning event.

Wait two physics ticks (~12 seconds). Watch sector log for per-tick
countdown warnings.

```
abort
```

Expected: "Self-destruct sequence aborted." Sector sees the abort message
(canonical SELFD4A) only if abort happened with `destruct < 10`.

Repeat — issue `destruct` and let it run to zero. Expected: ship is destroyed,
captain's `score` decreases by the canonical penalty.

**Pass criteria** (SC-004, SC-005): countdown advances correctly across at
least three ticks; abort prevents destruction; score penalty applied on
expiration.

---

## 7. Abandon

Captain A:

```
abandon
```

Expected: "You have abandoned ship {shipname}." Sector sees an "abandoned"
event. Captain A's session is now shipless.

Captain A attempts any gameplay command:

```
report
```

Expected: a message routing the captain back through the feature-011
onboarding flow. After completing onboarding, the captain has a fresh ship and
gameplay resumes.

**Pass criteria** (FR-704): captain remains authenticated, is shipless, and
must onboard before any further command is honored.

---

## Verification Summary

| User Story | Quickstart section | Acceptance |
|---|---|---|
| US1 Cloak | §1 | Visibility hidden; energy debited |
| US2 Maint | §2 | Cash debited; repair queued |
| US3 Transfer | §3 | Items moved; totals conserved |
| US4 Jettison | §4 | Items removed permanently |
| US5 Set | §5 | Flags persist across sessions |
| US6 Destruct/Abort | §6 | Countdown ticks; abort prevents; score penalty applied |
| US7 Abandon | §7 | Captain detached; routed through onboarding |
