# Command Contracts — Feature 014

Grammar, args, errors, and emitted events for the four commands shipped
in this feature. Mirrors the structure of feature 013's
`contracts/commands.md`.

---

## `att` — Planet Attack

### Grammar

```
att <amount> <troops|fighters>
```

- `<amount>`: positive integer; matched via the existing numeric arg
  parser (decimal only).
- `<troops|fighters>`: keyword matched by `genearas("tro"|"fig", arg)`
  (case-insensitive prefix match). The shortest accepted prefixes are
  `tro` and `fig`.

Aliases: none (canonical `att` only).

### Preconditions (in source order — first failure short-circuits)

| # | Check                                  | Failure message       | C anchor                   |
| - | -------------------------------------- | --------------------- | -------------------------- |
| 1 | `ship.where >= 10` (in orbit)          | `MessageId.ATT_NOT_ORBIT`     | GECMDS.C:3515 cmd_attack   |
| 2 | `ship.shpclass.max_attk != 0`          | `MessageId.ATT_NO_CAPABILITY` | GECMDS.C:~3520             |
| 3 | planet `type != PLTYPE_WORM`           | `MessageId.ATT_WORMHOLE`      | GECMDS.C:~3525             |
| 4 | not in neutral zone (else `zaphim`)    | (zap path; no message)        | GECMDS.C:~3530             |
| 5 | planet `userid != ship.userid`         | `MessageId.ATT_SELF`          | GECMDS.C:~3535             |
| 6 | `margc == 3 && genearas("tro"\|"fig")` | `MessageId.ATT_FORMAT`        | GECMDS.C:~3540             |
| 7 | `num > 0 && num <= ship cargo`         | `MessageId.ATT_NO_TROOPS` / `ATT_NO_FIGHTERS` | GECMDS.C:~3550 |

After acquiring the per-planet mutex, all checks 1–7 are re-run against
the post-lock planet state (research.md D1).

### Mutations (success path)

1. `ship.hostile := ship.where`
2. `ship.cantexit := FIRETICKS` (DI token, default 10)
3. `ship.items[I_TROOPS or I_FIGHTER].qty -= num`
4. Combat math runs (see `combat-math.md`).
5. `planet.items[I_TROOPS or I_FIGHTER].qty := left2`
6. `ship.items[I_TROOPS or I_FIGHTER].qty += left1` (surviving attackers)
7. On `won == 1`: `planet.userid := ship.userid`,
   `ship.hostile := 0`, `WarUser(ship.userid).planets += 1`.
8. On the high-ratio item-destruction path: each non-attacking-item
   `qty -= rndm(15)` clamped to ≥ 0.
9. Distress mail inserted (see Mail section below).
10. `call_4_help` invoked per gating in FR-014-028 / FR-014-029.

### Emitted events (Socket.io `event.log`)

To attacker (per existing handler-result line emission pattern):
- One line per kill narration (defender fighter return-fire,
  ground-troop kills, attacker counter-kills) — one per applicable
  branch.
- One line per item-destruction event (`KILLITM` style).
- One result line: `MESG_ATT_WIN` / `MESG_ATT_RETREAT` /
  `MESG_ATT_STANDOFF`.
- One persistence-confirmation line: `MESG_ATT_RESOLVED`.

To planet owner (when online at `call_4_help` time):
- Single `event.log` line broadcast to room `user:${planet.userid}`:
  `"ALERT: %s (sector %d,%d) is under attack by %s commanded by %s"`
  with planet name, xsect, ysect, attacker ship name, attacker userid.

To attacker's sector room: none (combat is private to the planet
participants in this feature; sector-wide combat broadcasts are
out of scope).

### Mail rows inserted

| Branch                              | Mail type | Recipient        |
| ----------------------------------- | --------- | ---------------- |
| Troop attack, `ratio > 1`, `won=0`  | MESG02    | planet.userid    |
| Troop attack, `ratio > 1`, `won=1`  | MESG03    | planet.userid    |
| Fighter attack, `ratio>2 \|\| won=1`, `won=0` | MESG04 | planet.userid    |
| Fighter attack, `ratio>2 \|\| won=1`, `won=1` | MESG05 | planet.userid    |
| Spy mail (D4 gate)                  | (reuses MESG02/04 body) | planet.spyowner |

All mail rows use `class = MAIL_CLASS_DISTRESS = 1`.

---

## `pln` — List Owned Planets

### Grammar

```
pln
```

No arguments. Aliases: none.

### Preconditions

None.

### Behavior

Query: `SELECT name, xsect, ysect, plnum FROM Planet WHERE userid = $1
ORDER BY plnum ASC`.

If 0 rows: emit `MessageId.PLN_NONE` (empty-state line).

If ≥ 1 row: emit one tabular line per planet, format:
`"%-20s  (%2d,%2d)  #%3d"` — name (left-padded 20), xsect, ysect,
plnum. Header line: `"PLANETS  YOU  OWN:"`.

No state mutation. No DB writes.

### Emitted events

Returned as `CommandResult.lines` only. No Socket.io broadcasts.

---

## `pri` — Show Prices

### Grammar

```
pri                          # bare — list every item's price
pri <amount> <itemkw>        # quote total cost of buying <amount> of item
```

`<itemkw>` matched against `kwrd[]` (the existing item-keyword table
from feature 005). Aliases: none.

### Preconditions

| # | Check                                                | Failure message |
| - | ---------------------------------------------------- | --------------- |
| 1 | `ship.where >= 10` (in orbit)                        | `BUY1`          |
| 2 | argument shape valid (bare OR `<amount> <itemkw>`)   | `PRICEFMT`      |

For `pri <amount> <itemkw>`, then in source order from `cmd_price`:

| # | Check                                                | Failure message |
| - | ---------------------------------------------------- | --------------- |
| a | planet has owner (`planet.userid != ""`)             | `BUY7`          |
| b | `amount > 0`                                         | `BUY5`          |
| c | captain is owner OR `item.sell == 'Y'`               | `BUY4`          |
| d | ship cargo capacity sufficient for `amount`          | `BUY8`          |
| e | available stock (qty − reserve for foreign) ≥ amount | `BUY3`          |
| f | captain cash ≥ `amount × price`                      | `BUY2`          |

Only when all six pass: emit `PRICE1` line:
`"%d %s @ %d cr ea = %d cr total"` (amount, item name, unit price,
total).

For bare `pri`: iterate `kwrd[]` and emit one `PRICE1` line per
`item.sell == 'Y'` entry, plus owner-priced items if captain owns the
planet. No precondition errors apart from BUY1 (orbit) and PRICEFMT
(malformed args).

### Mutations

None. `pri` is strictly read-only.

### Emitted events

Returned as `CommandResult.lines` only. No Socket.io broadcasts.

---

## `mai` — Maintenance (FR-210 password gate addition)

### Grammar (UPDATED)

```
mai                # only if planet password is "none"
mai <password>     # required when planet password is set
```

The existing handler accepted only the bare form. This feature adds
optional positional `<password>`.

### NEW preconditions (inserted between FR-209 and FR-204 in
`maint.handler.ts`)

| #            | Check                                                      | Failure message |
| ------------ | ---------------------------------------------------------- | --------------- |
| FR-014-060   | If `planet.password != "none"` AND no arg provided         | `MAINT2`        |
| FR-014-061   | If `planet.password != "none"` AND `!sameas(planet.password, arg)` | `MAINT3` |
| FR-014-062   | If `planet.password == "none"` — bypass gate (any arg ok)  | (proceed)       |

All other preconditions (FR-206/207/208/209/204/205) and the success
path are unchanged from feature 013.

### Behavior

`sameas` is the existing case-insensitive equality helper from feature
003. The `"none"` comparison is byte-exact (lowercase) — the literal
sentinel is treated as "no password set" and is reserved by the
canonical message file.

### Emitted events

Same as feature 013. No new events.

---

## Common error categories

Per the existing `CommandResult.lines[].category` convention:

- `'system'` — all rejection messages (preconditions failed).
- `'success'` — successful resolution lines (`MESG_ATT_WIN`, `PRICE1`,
  `pln` listings, `MAINT_OK`).
- `'event'` — combat narration lines (kill counts, item destructions);
  these are also routed to the attacker's connection only.
