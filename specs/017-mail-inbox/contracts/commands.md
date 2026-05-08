# Command Contracts — Mail Inbox

Three new commands wired into the existing `CommandRouterService`. All produce
`CommandResult { lines: { text, category }[] }` matching the established
command-handler shape (see `backend/src/game/commands/command.types.ts`).

---

## `mai` — list inbox (or maintenance gate)

**Keyword**: `mai`
**Aliases**: none
**Args**: 0 → list inbox · 1+ → maintenance gate (delegated)

### No-arg form (inbox listing)

**Pre-conditions**: command parser has resolved the calling `ShipState`.

**Behavior**:
1. Query `MailStat` where `userid = ship.userid`.
2. Sort by `stamp DESC, msgno DESC, class DESC` (R4).
3. Resolve sender display name per R3 for each row (batched user lookup +
   `ShipStateService` map).
4. Render header line, one row per entry (1-based index, class label, sender,
   topic, date), or single "no mail" line when empty.

**Output (non-empty, example)**:
```
You have 2 messages.
  1  Distress Signal   Klingon Cmdr  Planet Vega under attack   2026-05-07
  2  Production Report Vega Council  Production for cycle 142   2026-05-06
```

**Output (empty)**:
```
You have no mail.
```

**Errors**: none. Read-only.

### With-arg form (maintenance gate)

Delegates to existing `MaintHandlerService.handle(ship, args)` unchanged.
Output, errors, and side effects (cash debit, repair queue) are governed by
feature 014 — `mai`-as-inbox **MUST NOT** alter that path. SC-005 regression
test asserts identity.

### Acceptance mapping

| Spec scenario | Behavior |
|---|---|
| Story 1 #1 (zero rows) | empty branch above |
| Story 1 #2 (3 rows mixed) | non-empty branch, 1-based indices, class labels |
| Story 1 #3 (unknown sender) | R3 fallback to raw `dtime` |
| Story 1 #4 (`mai <pwd>`) | with-arg form delegates to maintenance |

---

## `rea <index>` — read message detail

**Keyword**: `rea`
**Aliases**: none
**Args**: 1 (positive integer)

**Behavior**:
1. Re-list and re-sort `MailStat` for `ship.userid` (same as `mai`).
2. Validate `index`:
   - missing → emit usage line, no state change
   - non-numeric / `index < 1` / `index > entries.length` → emit
     "invalid message" line, no state change
3. Render the class-specific detail view:
   - **Production Report (class 3)**: planet name, cash/debt/tax, 14-row
     itemqty table, date.
   - **Distress Signal (class 1)**: attacker ship name, planet under attack,
     sector coordinates `(x, y)`, date.
   - **Other classes**: generic best-effort (topic + raw scalar fields + date).
4. Read-only on `MailStat` (FR-013).

**Output (production report)**:
```
Message 1 — Production Report
From:   Vega Council
Topic:  Production for cycle 142
Date:   2026-05-06
Planet: Vega
Cash:   1,250,000   Debt: 0   Tax: 87,500
  Men: 12,500   Troops: 800   Fighters: 30   ...   (14 items)
```

**Output (distress signal)**:
```
Message 2 — Distress Signal
From:   Klingon Cmdr
Topic:  Planet Vega under attack
Date:   2026-05-07
Attacker: Klingon Cmdr (ship Black Sun)
Planet:   Vega   Sector: (12, 7)
```

**Output (usage)**:
```
Usage: rea <message-number>
```

**Output (invalid)**:
```
Invalid message.
```

**Errors**: invalid index (no state change). No DB write.

### Acceptance mapping

| Spec scenario | Behavior |
|---|---|
| Story 2 #1 (rea 1 prodrpt) | production-report branch |
| Story 2 #2 (rea 2 distress) | distress-signal branch |
| Story 2 #3 (rea no arg) | usage line |
| Story 2 #4 (rea 99 of 3) | invalid-message line |
| Story 2 #5 (rea 0 / -1) | invalid-message line |

---

## `del <index>` — delete message

**Keyword**: `del`
**Aliases**: none
**Args**: 1 (positive integer)

**Behavior**:
1. Re-list and re-sort `MailStat` for `ship.userid`.
2. Validate `index` (same rules as `rea`).
3. On valid index, call
   `prisma.mailStat.delete({ where: { userid_class_msgno: { userid, class, msgno } } })`
   using the entry's composite key.
4. Emit confirmation line.
5. The next `mai` invocation re-derives indices from the post-delete state
   (FR-010, R5).

**Output (success)**:
```
Message 2 deleted.
```

**Output (usage)**:
```
Usage: del <message-number>
```

**Output (invalid)**:
```
Invalid message.
```

**Errors**: invalid index (no DB write). Race with midnight purge: if Prisma
`delete` reports `P2025` (record not found) the handler emits "Invalid
message." rather than propagating the error.

### Acceptance mapping

| Spec scenario | Behavior |
|---|---|
| Story 3 #1 (del 2 of 3) | hard delete, confirmation |
| Story 3 #2 (mai after del) | re-listed with new indices |
| Story 3 #3 (del 99 of 3) | invalid-message line |
| Story 3 #4 (del no arg) | usage line |
| Edge — concurrent `del 2` ×2 | second targets new entry #2 (different row) |
| Edge — purged between mai and del | `P2025` mapped to invalid-message |

---

## Cross-command guarantees

- All three commands run on the player's `ship.userid` only — no cross-player
  access path exists in the contract.
- `mai` and `rea` perform no DB writes. `del` performs exactly one row delete
  per successful invocation.
- Output `CommandResult.lines[].category` follows existing conventions:
  `system` for usage/empty/invalid, `success` for delete confirmations,
  default for content rows.
