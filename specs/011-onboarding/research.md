# Phase 0 Research — 011-onboarding

All clarifications from spec.md §Clarifications are already resolved in the
spec itself. This document records the technical decisions made to satisfy
those clarifications.

## R1 — BBS login replaces sysop provisioning

**Decision**: Username + password registration via `POST /auth/register`,
JWT issued at `POST /auth/login`. Frontend stores JWT in `localStorage` and
presents it as the Socket.io handshake `auth: { token }` payload.

**Rationale**: The original Galactic Empire was hosted inside MajorBBS, which
provided user provisioning, identity, and login. We do not have MajorBBS, so
authentication must live inside our app. JWT is stateless (no server-side
session store, consistent with "no Redis" architecture rule), survives
WebSocket reconnects without a re-auth round-trip, and the 30-day expiry
matches the BBS-era "log in once a session" feel.

**Alternatives considered**:
- *Session cookies*: rejected — requires same-origin coupling between API and
  frontend, complicates Socket.io auth, and adds CSRF concerns.
- *OAuth / external IDP*: rejected as overkill for a hobby/dev-phase port;
  no email or external-identity dependency required. Spec explicitly
  excludes account recovery.
- *Long-lived JWT with refresh token*: rejected — out of scope per FR-003c;
  30-day fixed expiry is acceptable given a "log in again" recovery model.

## R2 — bcrypt for password hashing

**Decision**: `bcrypt` (Node binding, npm `bcrypt`) with cost factor 12.
Stored on `User.passwordHash` as a string. Plaintext passwords are never
logged, never returned in any DTO, and never persisted.

**Rationale**: bcrypt is the standard for password storage on small Node
backends, has a tunable work factor, and is built into common NestJS auth
recipes. Cost factor 12 gives ~250 ms on a modern CPU — high enough to slow
brute force, low enough to not block the request loop noticeably. 72-byte
input limit is acknowledged in FR-003b.

**Alternatives considered**:
- *argon2*: marginally stronger but adds a native build step that has burned
  us in the past on Hetzner Docker images; bcrypt is sufficient for dev-phase
  threat model.
- *scrypt*: standard-library option but tuning is awkward and ecosystem
  examples are thinner than bcrypt's.

## R3 — JWT library choice

**Decision**: `@nestjs/jwt` (issue/verify) plus `@nestjs/passport` +
`passport-jwt` (HTTP route guard). For Socket.io handshake, a small custom
guard reads `socket.handshake.auth.token` and reuses `JwtService.verifyAsync`
directly — no passport machinery on the WS side.

**Rationale**: `@nestjs/jwt` is the canonical NestJS choice and integrates
with DI (`JwtModule.registerAsync` lets us load the secret from `ConfigService`
at boot). Passport-jwt is overkill for WS but is the cleanest fit for the
two HTTP routes. Sharing `JwtService` between HTTP and WS means a single
secret-loading code path.

**Alternatives considered**:
- *Hand-rolled `jsonwebtoken` calls*: rejected — `@nestjs/jwt` is a thin
  wrapper around it with DI ergonomics.
- *Passport on the socket too*: rejected — passport's request-shaped middleware
  doesn't compose cleanly with Socket.io's connection lifecycle.

## R4 — Case-insensitive uniqueness in Postgres

**Decision**: Add a unique partial index on `lower("username")` for `User`
and on `lower("shipname")` for `Ship`. Continue to store the player-entered
casing verbatim in the `username` / `shipname` column.

**Rationale**: A `lower(...)` unique index is a stable, well-supported pattern
in Postgres and avoids the overhead and migration risk of converting columns
to `citext`. It also keeps the schema readable — the field type stays
`String` and casing is obviously preserved. Lookups go through
`where: { username: { equals: input, mode: 'insensitive' } }` (Prisma) or
explicit `LOWER(...)` predicates in raw queries; uniqueness is enforced by
the index.

**Alternatives considered**:
- *`citext` extension*: works but requires `CREATE EXTENSION` in the migration
  and changes the column type, which complicates index strategy and is a
  heavier schema change than necessary.
- *Application-level uniqueness check + retry*: rejected — race conditions
  produce orphaned rows; only a DB-level unique constraint prevents the
  10-concurrent-request collision case (SC-004).

## R5 — Latest-wins single-session enforcement

**Decision**: Reuse the existing `ConnectedShipsRegistry.upsert(shipId, socketId)`
mechanism. On a new authenticated connection for a user that already owns
the bound `shipId`, the registry returns the prior socket id; the gateway
emits `error { code: 'SESSION_REPLACED' }` to that prior socket and
disconnects it before completing the new handshake. The existing
`player.left` → snapshot → `player.joined` event sequence (FR-025a) is
preserved.

**Rationale**: The mechanism is already wired and tested for ship-id-keyed
duplicate connections; this feature only changes the *reason* for the
duplicate (was: same `userid` query param; now: same JWT subject). No new
state structure is needed.

**Alternatives considered**:
- *Reject the new connection*: rejected — spec clarification answer
  explicitly chose "latest-wins".
- *Allow both connections*: rejected — would let a user double-issue
  commands and break tick-broadcast assumptions (one socket per shipId in
  the sector room).

## R6 — Onboarding flow state lives on the socket

**Decision**: While a player is mid-onboarding, the socket holds
`client.data.onboarding = { step: 'CLASS' | 'NAME', selectedClass?: number }`
and is **not** registered in `ConnectedShipsRegistry`. Disconnect during
onboarding drops the socket-local state cleanly (no DB rows yet). On
`prompt:reply` the `OnboardingService` advances or re-prompts.

**Rationale**: Avoids introducing a new persistent in-memory store for
ephemeral pre-ship state. Disconnect-mid-flow becomes trivially correct
(the spec edge case): nothing to clean up because nothing was persisted.
Concurrent-cmd_new-from-same-identity is prevented by the DB transaction at
finalization (one ship per user enforced by unique index on
`Ship.userid`).

**Alternatives considered**:
- *Persist a "draft ship" row*: rejected — adds a state column and orphan
  cleanup obligations for no observable benefit.
- *In-memory `Map<userId, OnboardingState>` singleton*: rejected — duplicates
  what `client.data` already gives us; harder to clean up on disconnect.

## R7 — `ShipClass` seed idempotency

**Decision**: The existing `prisma/seed/ship-classes.ts` is already
authoritative and uses `upsert` keyed on `classNumber`. Verify it satisfies
"re-running produces no changes" via a test that runs the seed twice and
asserts the row set and timestamps (or update-counts via `prisma._engine`
debug log) are unchanged. If `upsert` causes a no-op `UPDATE` even when
fields match, switch to compare-then-upsert.

**Rationale**: The spec requires idempotency, and the seed already exists
from feature 001. We confirm it and add a regression test rather than
rewriting.

**Alternatives considered**:
- *DB-level `INSERT ... ON CONFLICT DO NOTHING`*: rejected — Prisma's
  `upsert` is closer to intent ("insert if missing, update if drifted")
  and lets the seed double as a corrective tool.

## R8 — Spawn sector configuration

**Decision**: Read `ONBOARDING_SPAWN_SECTOR_X` and
`ONBOARDING_SPAWN_SECTOR_Y` from `ConfigService` (env), defaulting to
`(0, 0)` — the neutral-zone origin per `neutral()` in `GEFUNCS.C`. On boot,
verify the sector exists in the generated galaxy; missing → fail-fast log
and 500 on first onboarding attempt (matches edge case in spec).

**Rationale**: Server-configurable per spec assumption; environment variable
is the existing config pattern in this repo. Fail-fast on missing sector
prevents the silent-fallback pitfall the spec explicitly calls out.

**Alternatives considered**:
- *Pick a random non-neutral sector*: rejected — neutral zone is the
  fidelity-correct spawn area (PvE-safe, matches BBS-era new-player
  experience). Random spawn would make new players combat-killable
  immediately.
