# Data Model — 011-onboarding

This feature **modifies** the existing `User` model and adds DB-level
case-insensitive uniqueness on `User.username` and `Ship.shipname`. No new
tables. The `ShipClass` table is read by this feature but its schema is
unchanged from feature 001.

## Modified entity: User

| Field | Type | Constraints | Source / Why |
|-------|------|-------------|--------------|
| `userid` | `String` | `@id` (unchanged) | WARUSR.userid (existing PK) |
| `username` | `String` | NOT NULL; unique on `lower("username")` | New — player handle, case-insensitive unique, casing preserved (FR-003a). `username` is a separate column from `userid` so existing rows can be migrated by setting `username = userid` for the migration default. |
| `passwordHash` | `String` | NOT NULL | New — bcrypt hash of password (FR-003, FR-003b). Plaintext never stored. |
| `createdAt` | `DateTime` | `@default(now())` | New — audit field for registration timestamp |
| (existing fields) | … | unchanged | score, kills, cash, etc. — unchanged from feature 001 |

**Validation rules (enforced in service layer + DTO + DB)**:
- `username`: 3–16 printable ASCII characters (32–126), no whitespace
  flanking. Validation regex: `/^[\x21-\x7E]{3,16}$/`. Stored verbatim;
  uniqueness via `lower()` index.
- `passwordHash`: opaque string. Plaintext password input must be ≥ 8 chars
  and ≤ 72 bytes (bcrypt limit) at the DTO layer. No character-class rules.

**Indexes**:
- `@@index([username])` for fast handle lookup at login (case-insensitive
  query uses `mode: 'insensitive'`).
- Unique index on `lower("username")` declared via raw SQL in the migration
  (`CREATE UNIQUE INDEX "User_username_lower_idx" ON "User" (LOWER("username"));`).

**Migration safety for existing rows**:
- Add `username` as nullable in step 1, backfill `username = userid` for
  every row, then `ALTER COLUMN ... SET NOT NULL`.
- Add `passwordHash` as nullable in step 1; rows without a hash cannot log
  in (they cannot connect post-feature; this is acceptable because no
  production data exists yet — dev DBs are wiped freely. Document the
  policy in `docs/DECISIONS.md`).
- Apply the `lower("username")` unique index after backfill.

## Modified entity: Ship

No column changes. New unique index only:

- `CREATE UNIQUE INDEX "Ship_shipname_lower_idx" ON "Ship" (LOWER("shipname"));`

This enforces the case-insensitive uniqueness rule in FR-006 / FR-011 at
the DB level. Application-level validation must convert collision errors
(Postgres SQLSTATE `23505` on this index) into the user-facing "name taken"
message.

**One-ship-per-user constraint (already implicit, made explicit)**:
- Add `@@unique([userid])` on `Ship` to enforce the spec assumption that
  a user owns at most one ship in this scope. This converts the
  concurrent-`cmd_new` race into a deterministic single-winner outcome
  (SC-004).

## Read-only entity: ShipClass

Feature 001 already defines this; the seed at `prisma/seed/ship-classes.ts`
populates it with the original-game roster. This feature reads the
`category = 'PLAYER'` rows and projects each to a class-list payload. No
schema change.

**Projection used by `prompt:class-list`** (see contracts/websocket-events.md):

```ts
{
  classNumber: number;
  typeName: string;        // ShipClass.typeName
  description: string;     // synthesized from ShipClass.shipNameTemplate + key stats
  maxShields: number;
  maxPhaser: number;
  maxWarp: number;
  hasTorpedo: boolean;
  hasMissile: boolean;
}
```

## Onboarding state (transient, not persisted)

Held on `Socket.data.onboarding`:

```ts
type OnboardingState =
  | { step: 'AWAITING_CLASS' }
  | { step: 'AWAITING_NAME'; selectedClass: number };
```

Lifecycle: created when a JWT-authenticated socket connects with no
existing `Ship` row; destroyed when (a) finalize succeeds and the socket
transitions to bound, (b) the socket disconnects, (c) the socket is
replaced by a latest-wins handshake.

## State transitions

```text
[connect with JWT, no Ship row]
       │
       ▼
AWAITING_CLASS  ──┐
       │           │ invalid / unknown class → re-emit prompt:class-list
       │ valid     │
       ▼           │
AWAITING_NAME ─────┤ invalid charset / length → re-emit prompt:ship-name
       │           │ name taken (case-insensitive) → re-emit prompt:ship-name
       │ valid     │
       ▼           │
[Tx: create Ship + load into ShipStateService]
       │
       ▼
[bound — registered in ConnectedShipsRegistry]
       │
       ├── rename(valid, unique)  → update Ship row + ShipState; emit ship.renamed
       └── disconnect             → remove from registry (Ship persists)
```

## Validation rule cross-reference

| Rule | Source | Enforced where |
|------|--------|----------------|
| Ship name 1–19 printable ASCII | `GECMDS.C:5002` (`strncpy(..., margv[1], 19)`) | `name-validator.ts` + DB length |
| Ship name unique, case-insensitive | spec FR-006 / FR-011 | unique index on `lower("shipname")` + service layer pre-check for friendly errors |
| Username 3–16 printable ASCII | spec FR-003a | `register.dto.ts` regex |
| Username unique, case-insensitive | spec FR-003a | unique index on `lower("username")` |
| Password ≥ 8 chars, ≤ 72 bytes | spec FR-003b | `register.dto.ts` |
| One ship per user | spec assumption | `@@unique([userid])` on `Ship` |
| Spawn at neutral-zone origin | `GEFUNCS.C:neutral()` + spec assumption | `OnboardingService.finalize()` reads `ConfigService` (default `(0,0)`) |
