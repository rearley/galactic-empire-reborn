# Phase 1 Data Model — Mail Inbox

This feature introduces **no new persisted entities and no schema migration**.
All persistence uses the existing `MailStat` model (`backend/prisma/schema.prisma:372`).
The model below describes only the in-memory derived types used by
`MailInboxService` and the command handlers.

---

## Persistent: `MailStat` (existing, unchanged)

@see `backend/prisma/schema.prisma:372` and `reference/ge-source/GEMAIN.H:531`.

Composite primary key: `(userid, class, msgno)`.

| Field | Type | Used by | Notes |
|---|---|---|---|
| `userid` | `String` | filter | recipient; FK → `User.userid` |
| `class` | `Int` | label | 1=DISTRESS, 3=PRODRPT (others: generic label) |
| `msgno` | `BigInt` | sort tiebreaker | per-(userid, class) sequence |
| `type` | `Int` | detail | sub-type within a class (e.g. distress kind) |
| `stamp` | `Int` | sort key | Unix seconds; primary newest-first sort |
| `dtime` | `String` | sender | sender userid; resolved to display name (R3) |
| `topic` | `String` | list+detail | short subject line |
| `name1` | `String` | detail | planet name (prodrpt) / attacker shipname (distress) |
| `int1`, `int2` | `Int` | detail | class-specific scalars |
| `cash`, `debt`, `tax` | `BigInt` | detail (prodrpt) | financial figures |
| `itemqty` | `BigInt[]` | detail (prodrpt) | NUMITEMS=14 quantities |

**Validation**: enforced by Postgres FK and the existing schema. No new
constraints added by this feature.

**State transitions**: row exists → row deleted (by `del` or by midnight 7-day
purge). No intermediate states. No `readAt` field per FR-014.

---

## In-memory: `MailListEntry`

Derived row used in both list and detail views.

```ts
interface MailListEntry {
  /** 1-based position within the current sort order. */
  index: number;
  /** Composite key fields, used by rea/del to identify the source row. */
  userid: string;
  class: number;
  msgno: bigint;
  /** Class label string for the list view ("Production Report" / "Distress Signal" / "Message"). */
  classLabel: string;
  /** Resolved sender display name (R3 fallback chain). */
  sender: string;
  /** Topic/subject as stored. */
  topic: string;
  /** Stamp formatted for the list column (e.g. "2026-05-07"). */
  date: string;
  /** Stamp as raw Unix seconds, retained for tests and debug formatting. */
  stamp: number;
  /** Class-specific detail payload, materialised on demand by the renderer. */
  payload: ProductionReportPayload | DistressSignalPayload | GenericPayload;
}

interface ProductionReportPayload {
  kind: 'production_report';
  planetName: string;
  cash: bigint;
  debt: bigint;
  tax: bigint;
  itemqty: bigint[];
}

interface DistressSignalPayload {
  kind: 'distress_signal';
  attackerShipName: string;
  planetName: string;
  /** Sector coords as stored on the row (carried in int1/int2 by the writer). */
  sectorX: number;
  sectorY: number;
}

interface GenericPayload {
  kind: 'generic';
  /** Raw row reference for unrecognised classes — formatter renders best-effort. */
}
```

---

## In-memory: `MailListing`

Result of one `MailInboxService.list()` call.

```ts
interface MailListing {
  userid: string;
  /** Entries in newest-first order; index field equals 1..entries.length. */
  entries: MailListEntry[];
  /** True when entries.length === 0. */
  empty: boolean;
}
```

---

## Index resolution contract

Given a 1-based `index` from the player and a freshly produced `MailListing`:

- `index` is invalid if `index < 1 || index > entries.length || !Number.isInteger(index)`.
- Valid `index` resolves to `entries[index - 1]`. The composite key
  `(userid, class, msgno)` of that entry is the identifier handed to Prisma
  for `rea` (already in memory) or `del` (`prisma.mailStat.delete`).
- Re-resolution is mandatory for each command (R5). Two `del 2` calls in
  succession therefore target two different rows iff the first deletion
  succeeded — the second resolves against the post-delete listing.

---

## Class label table

| `class` | Label | Source |
|---|---|---|
| 1 | "Distress Signal" | FR-005, GEMAIN.H:220 |
| 3 | "Production Report" | FR-005, GEMAIN.H:222 |
| any other | "Message" | R1 fallback |
