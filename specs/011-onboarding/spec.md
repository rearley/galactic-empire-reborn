# Feature Specification: Player Onboarding — cmd_new, cmd_rename, auth identity

**Feature Branch**: `011-onboarding`
**Created**: 2026-05-06
**Status**: Draft
**Input**: User description: "Implement the player onboarding flow: new ship creation (cmd_new), ship rename (cmd_rename), and the auth/identity wiring that replaces the hardcoded LOCAL_USERID = 'DEV' in socketClient.ts."

## Clarifications

### Session 2026-05-06

- Q: What is the wire-protocol shape of the `cmd_new` flow? → A: Server-driven multi-step prompts — server emits `prompt:class-list` then `prompt:ship-name`; client renders prompts and replies with free-text; validation errors re-emit the same prompt. Mirrors original `GECMDS.C:cmd_new` semantics.
- Q: What happens when the same identity (token) connects from a second socket while a prior socket is still live? → A: Latest-wins — the new connect replaces the prior socket; the prior socket is disconnected with a "session replaced" message. Matches BBS single-session semantics.
- Q: Is ship-name uniqueness case-sensitive? → A: Case-insensitive uniqueness; player-entered casing is preserved for display. Implemented via Postgres `citext` or a unique index on `lower(name)`.
- Q: What is the identity / authentication model? → A: Username + password authentication. Pre-connect HTTP flow: `POST /auth/register` and `POST /auth/login` return a JWT. The frontend stores the JWT and presents it as the Socket.io handshake auth payload. Unauthenticated sockets are rejected. Passwords are stored as bcrypt hashes on the `User` row. Losing browser storage is not a problem — the player logs in again. Matches BBS login semantics.
- Q: What seeds the `ShipClass` catalog that `prompt:class-list` reads? → A: Full original-game roster from `GEMAIN.H` / `GECMDS.C`, loaded via an idempotent Prisma seed script (re-running produces no changes). All starting stats trace to original constants. Seeding is a prerequisite of this feature; if a prior feature has not already seeded the table, this feature includes the seed work.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - First-time player creates a ship (Priority: P1)

A new player connects to the game with no prior ship. The server recognises
they have no ship bound, presents the available ship classes, and walks them
through choosing a class and a unique ship name. On completion, their ship
is in the universe at the spawn point and they are fully bound to it for
real-time play.

**Why this priority**: Without this flow, no new player can ever join the
game. It is the gate to every other feature already built (movement, combat,
trade). It is the MVP of onboarding.

**Independent Test**: Connect a fresh client (no stored identity), verify
the class list is presented, submit a class choice and ship name, and
confirm the ship appears in `ShipStateService` at the spawn sector and that
subsequent commands (e.g. `report`, `scan`) work without re-handshake.

**Acceptance Scenarios**:

1. **Given** a client connects with no existing identity, **When** the
   server detects no ship is bound, **Then** the player is shown the list
   of available ship classes (name, description, summary stats).
2. **Given** the class list is displayed, **When** the player selects a
   valid class and submits a ship name that is 1–19 printable ASCII and
   not in use, **Then** a Ship and User row are created in Postgres, the
   ship is loaded into `ShipStateService`, placed at the spawn sector with
   the class's initial loadout, and the socket becomes fully handshaken.
3. **Given** the player submits a ship name that is already taken, **When**
   the server validates uniqueness, **Then** the player receives a clear
   "name taken" message and is prompted to enter another name without
   losing their class selection.
4. **Given** the player submits a name with invalid characters or wrong
   length, **When** validation runs, **Then** the player is told the rule
   (1–19 printable ASCII) and re-prompted.

---

### User Story 2 - Returning player resumes their ship (Priority: P1)

A player who already has a ship reconnects. The server identifies them,
loads their existing ship into `ShipStateService` if not already active,
and completes the handshake — no `cmd_new` flow.

**Why this priority**: Equal P1 with US1 — without this, every reconnect
would create a new ship, which destroys persistence and is unacceptable.

**Independent Test**: Create a ship via US1, disconnect, reconnect with the
same identity, and verify the same ship (same name, same sector, same
loadout) is bound to the new socket without prompting for class/name.

**Acceptance Scenarios**:

1. **Given** an identified player has an existing ship, **When** they
   connect, **Then** the server skips the new-ship flow and binds the
   socket directly to the existing ship.
2. **Given** the player's ship is not currently in `ShipStateService`,
   **When** they connect, **Then** the ship is hydrated from Postgres into
   memory before the handshake completes.

---

### User Story 3 - Player renames their ship (Priority: P2)

A bound player issues `rename <new-name>`. The server validates the new
name, updates Postgres and in-memory state, and broadcasts the change so
other players in the same sector see the rename in real time.

**Why this priority**: Quality-of-life feature. Useful but not gating —
players can play with their starting name. Should ship in the same release
because the validation logic mirrors `cmd_new`.

**Independent Test**: With a bound ship, send `rename Goliath`, verify the
Ship row, the in-memory `ShipState`, and that other clients in the same
sector receive a rename event with both old and new names.

**Acceptance Scenarios**:

1. **Given** a bound player, **When** they submit a valid, unused name,
   **Then** the ship's name is updated in Postgres and `ShipStateService`,
   and a rename event is broadcast to the sector room.
2. **Given** a bound player, **When** they submit a name that is already
   taken by another ship, **Then** the rename is rejected with a clear
   message and no state changes.
3. **Given** the rename succeeds, **When** another client in the same
   sector receives the broadcast, **Then** any UI showing the renamed ship
   updates to the new name without requiring a full sector refresh.

---

### Edge Cases

- A player disconnects mid-onboarding (after class selection, before name
  submission) — partial state must not persist, and reconnect must restart
  the flow cleanly.
- Two players race to claim the same ship name — exactly one succeeds; the
  other gets a uniqueness error.
- A player issues `rename` to the same name they already have — treated as
  a no-op success (no broadcast, no DB write).
- A player tries `rename` before the handshake completes (no ship bound) —
  rejected with "no ship".
- The configured spawn sector is missing from the galaxy — onboarding
  fails fast with a server error rather than silently placing the ship
  at a fallback location.
- Concurrent `cmd_new` requests from the same identity — only one ship is
  created; the second is rejected because the user already has a ship.
- A second socket connects with a token whose first socket is still live —
  the prior socket is disconnected with a "session replaced" message
  before the new socket completes its handshake. Only one socket per user
  is bound to `ShipStateService` at any moment.

## Requirements *(mandatory)*

### Functional Requirements

**Identity & handshake**

- **FR-001**: The system MUST replace the hardcoded `LOCAL_USERID = 'DEV'`
  in the frontend socket client with the authenticated user's identity
  (carried in the JWT presented at handshake).
- **FR-002**: The system MUST distinguish, at handshake, between an
  authenticated user with no ship (route to `cmd_new` flow) and an
  authenticated user with an existing ship (route to normal play
  handshake). Unauthenticated sockets MUST be rejected before either
  branch is reached.
- **FR-003**: The system MUST establish identity via a pre-connect
  username + password authentication flow over HTTP, with the following
  endpoints and rules:
  - `POST /auth/register` — accepts a username and password, creates a
    new `User` row with the password stored as a bcrypt hash, and returns
    a signed JWT bound to that user's id.
  - `POST /auth/login` — accepts a username and password, verifies the
    bcrypt hash, and returns a signed JWT bound to the user's id.
  - The frontend MUST store the JWT (browser local storage) and present
    it as the Socket.io handshake auth payload (`{ token: <jwt> }`) on
    every connect.
  - The server MUST verify the JWT signature and load the corresponding
    `User` row before completing the handshake. Invalid, expired, or
    missing JWTs MUST cause the socket connect to be rejected.
  - No session cookies are used. Player handle (= username) is set during
    registration; ship name is chosen later in the `cmd_new` flow and is
    distinct from username.
- **FR-003a**: Username rules MUST be: 3–16 printable ASCII characters,
  uniqueness enforced case-insensitively (matching the same rule applied
  to ship names). Username case is preserved for display.
- **FR-003b**: Password rules MUST be: minimum 8 characters, no maximum
  length floor below bcrypt's 72-byte limit, no character-class
  requirements. Passwords are never logged, never returned in any API
  response, and never stored unhashed.
- **FR-003c**: JWTs MUST be signed with a server-side secret loaded from
  configuration (not hardcoded), carry the user's id as the subject
  claim, and have an expiry of 30 days. Token rotation, revocation, and
  refresh-token flows are out of scope for this feature.

**cmd_new (new ship creation)**

- **FR-004**: When a connected client has no bound ship, the system MUST
  drive a server-side multi-step prompt sequence: first emit a
  `prompt:class-list` event carrying the list of available ship classes
  (name, description, key stats from the `ShipClass` table), then on a
  valid class reply emit a `prompt:ship-name` event. The frontend MUST NOT
  fetch the class list independently and MUST NOT submit class and name in
  a single combined event.
- **FR-005**: The system MUST accept a class selection reply, validate it
  refers to an active `ShipClass` row, and on failure re-emit
  `prompt:class-list` with an error message rather than advancing.
- **FR-006**: The system MUST accept a ship-name reply and validate it is
  1–19 printable ASCII characters and is not currently in use by any other
  ship. Uniqueness MUST be case-insensitive (e.g., "Goliath" collides with
  "GOLIATH"), while the player-entered casing is preserved verbatim for
  display. On failure, re-emit `prompt:ship-name` with the specific error
  message (length/charset vs. uniqueness) without losing the previously
  accepted class selection.
- **FR-007**: On valid input, the system MUST create the Ship row within a
  single Postgres transaction (the User row already exists from
  registration) and load the resulting `ShipState` into `ShipStateService`
  before the handshake completes. If the configured spawn sector is not
  present in the galaxy, the transaction MUST fail fast with a defined
  server error rather than silently placing the ship at a fallback
  location (see edge case "configured spawn sector is missing").
- **FR-008**: The system MUST place the new ship at the configured spawn
  sector (defaulting to the neutral zone at the galaxy origin) with the
  initial loadout values defined by the chosen `ShipClass` and the
  balance constants in `GEMAIN.H`. No magic numbers — every starting
  value must trace to either `ShipClass` data or a `GEMAIN.H` constant.
- **FR-009**: After successful creation, the socket MUST be fully bound to
  the new ship such that subsequent commands operate on it without any
  additional handshake step.

**cmd_rename**

- **FR-010**: The system MUST allow a bound player to rename their ship
  via the `rename` command.
- **FR-011**: The new name MUST satisfy the same 1–19 printable ASCII
  rule and the same case-insensitive uniqueness rule as `cmd_new`,
  excluding the player's own current ship from the uniqueness check. A
  rename to a casing-only variant of the player's existing name (e.g.,
  "goliath" → "Goliath") is allowed and updates only the displayed casing.
- **FR-012**: A successful rename MUST update both the Ship row in
  Postgres and the in-memory `ShipState` atomically with respect to other
  game ticks (no observer can see one without the other).
- **FR-013**: The system MUST broadcast a rename event to the bound
  ship's current sector room so co-located players' clients can update
  their displays.

**Visibility & consistency**

- **FR-014**: All newly created Ship and User rows MUST be immediately
  visible via `ShipStateService` (same in-memory-first pattern used by the
  Cybertron spawn fix in feature 007).

### Key Entities

- **User**: A persistent identity for a human player. Stores the
  username (player handle, case-insensitively unique, casing preserved
  for display) and the bcrypt-hashed password. One user has at most one
  ship in this scope (multi-ship support is explicitly out of scope).
- **Ship**: A persistent ship record bound to a user. Holds class, name,
  current sector, energy, shields, and other state mirrored into
  `ShipState`.
- **ShipClass**: A reference table of ship templates, each with a name,
  description, and starting stats used as the initial loadout when a new
  ship of that class is created.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new player can go from first connect to issuing their
  first gameplay command in under 60 seconds, assuming they read the class
  list and pick a name.
- **SC-002**: 100% of returning players reconnect to their existing ship
  without seeing the class-selection flow.
- **SC-003**: 0% of onboarding attempts result in orphaned database rows
  (e.g., a User without a Ship, or a Ship not present in
  `ShipStateService`) under both happy-path and disconnect-mid-flow
  scenarios.
- **SC-004**: Ship-name uniqueness is preserved under at least 10
  concurrent `cmd_new` or `rename` requests targeting the same name —
  exactly one succeeds, the rest receive a clear uniqueness error.
- **SC-005**: After a successful `rename`, every other connected client
  in the same sector reflects the new name within one physics tick (6 s).

## Assumptions

- The original Galactic Empire `cmd_new` and `cmd_rename` semantics from
  `GECMDS.C` are the canonical reference for behavior, including the
  1–19-character name length and printable-ASCII restriction.
- The `ShipClass` table is populated from the full original-game class
  roster sourced from `GEMAIN.H` and `GECMDS.C` via an idempotent Prisma
  seed script. If an earlier feature has not already seeded the table,
  authoring and running that seed is in scope of this feature as a
  prerequisite. Re-running the seed MUST NOT duplicate or mutate
  existing rows.
- The spawn sector defaults to the neutral zone at the galaxy origin
  (s00) but is a server-side configurable value.
- Account recovery (forgotten password reset) and admin/sysop tooling are
  explicitly out of scope. A player who forgets their password loses
  access to their ship; this is acceptable for the development phase.
- Multi-ship-per-user is out of scope; the original game permitted it but
  this feature enforces one-ship-per-user.
- The client-side handshake message format will change to carry the JWT;
  coordinated frontend/backend changes are expected. The frontend will
  also gain login and registration screens that precede the terminal UI.
- JWT rotation, refresh tokens, server-side revocation lists, and
  cross-device session management are out of scope for this feature. A
  JWT is valid until its 30-day expiry, after which the player must log
  in again.
