# Quickstart — Mail Inbox

End-to-end smoke test for the three new commands, runnable against a local
backend with a seeded `MailStat` row set.

## Prereqs

- Backend running: `docker compose up backend postgres`
- A logged-in player session with userid (e.g. `RICK`)
- Two `MailStat` rows seeded for that user:
  - class=3 (production report) with topic "Production for cycle 142"
  - class=1 (distress signal) with topic "Planet Vega under attack"

Seed script (psql, replace userid):

```sql
INSERT INTO "MailStat" (userid, class, msgno, type, stamp, dtime, topic, name1,
                       int1, int2, cash, debt, tax, itemqty)
VALUES
 ('RICK', 3, 1, 0, EXTRACT(EPOCH FROM NOW())::int - 86400,
  'COUNCIL', 'Production for cycle 142', 'Vega',
  0, 0, 1250000, 0, 87500,
  ARRAY[12500,800,30,0,0,0,0,0,0,0,0,0,0,0]::bigint[]),
 ('RICK', 1, 1, 0, EXTRACT(EPOCH FROM NOW())::int,
  'KLINGON', 'Planet Vega under attack', 'Black Sun',
  12, 7, 0, 0, 0,
  ARRAY[0,0,0,0,0,0,0,0,0,0,0,0,0,0]::bigint[]);
```

## Walkthrough

### 1. List the inbox

Type:
```
mai
```

Expected:
```
You have 2 messages.
  1  Distress Signal   Black Sun     Planet Vega under attack   2026-05-07
  2  Production Report COUNCIL       Production for cycle 142   2026-05-06
```
Verify newest first (distress is index 1; stamp is more recent).

### 2. Read the distress signal

```
rea 1
```

Expected detail block including attacker ship name "Black Sun", planet "Vega",
sector "(12, 7)", and the 2026-05-07 date.

### 3. Read the production report

```
rea 2
```

Expected detail block including planet "Vega", cash 1,250,000, debt 0,
tax 87,500, and a 14-entry item table with men=12500.

### 4. Reject invalid indices

```
rea
rea 0
rea 99
del
del 99
```

Each should produce a usage or invalid-message line; no rows removed
(re-run `mai` and confirm count is still 2).

### 5. Delete and re-list

```
del 2
mai
```

Expected: confirmation `Message 2 deleted.`, then `mai` shows a single
remaining message at index 1 (the distress signal). Confirm via psql:

```sql
SELECT class, msgno, topic FROM "MailStat" WHERE userid = 'RICK';
```

Only the distress row remains.

### 6. Maintenance regression (FR-012, SC-005)

In orbit at a friendly inhabited planet with a maintenance password, type:

```
mai
mai wrongpwd
mai correctpwd
```

Expected: same outputs as feature 014 — `mai` with no arg should now list the
**inbox** (not the maintenance "password required" message), but `mai <arg>`
must continue to drive the maintenance gate. Cash debit and repair behaviour
unchanged.

> If the player has no maintenance facility / not in orbit, `mai` no-arg still
> lists the inbox; `mai <arg>` returns the existing maintenance error path
> (e.g. "no maintenance facility here").

## Pass criteria

- All five list/read/delete steps render expected output.
- DB state matches expectations after `del`.
- Maintenance flow (step 6) is byte-for-byte identical to feature 014's
  behaviour with `maint <arg>` (re-tested via the existing `maint` keyword
  alias in the same session for parity).
