# Feature Specification: Tick Engine & Real-time Foundation

**Feature Branch**: `002-tick-engine`
**Created**: 2026-05-01
**Status**: Draft
**Input**: User description: "002-tick-engine — NestJS application foundation, PrismaService, GameGateway skeleton, TickService"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Server starts and stays alive (Priority: P1)

The operator boots the backend server. The application connects to the database, opens a real-time connection endpoint, and begins firing the recurring 1-second and 6-second internal heartbeats that future game systems will subscribe to. The server keeps running until shut down cleanly.

**Why this priority**: Nothing else in the game can exist without a running server, an open database connection, an open real-time channel, and a reliable heartbeat. This is the foundational layer feature 003 onwards will build on.

**Independent Test**: The server can be started in isolation, observed to log connection success and tick output at the expected cadence, then shut down cleanly without errors. No other game subsystems are required to validate this.

**Acceptance Scenarios**:

1. **Given** a configured database is reachable, **When** the server boots, **Then** it connects to the database, opens its real-time port, and begins emitting 1-second and 6-second heartbeats.
2. **Given** the server is running, **When** the process receives a shutdown signal, **Then** it stops the heartbeats, closes the database connection, and exits without leaving lingering timers or open handles.
3. **Given** the server has been running for 60 seconds, **When** internal tick counters are inspected, **Then** the 1-second heartbeat has fired roughly 60 times and the 6-second heartbeat roughly 10 times.

---

### User Story 2 - Client joins and leaves a sector room (Priority: P1)

A connected client tells the server which galactic sector it currently cares about. The server places that client into a logical group keyed by sector coordinates so that — in future features — only events relevant to that sector are delivered to that client. When the client moves to a different sector, it can leave the old grouping and join the new one. When the client disconnects entirely, all its groupings are released automatically.

**Why this priority**: Sector-scoped event delivery is the model the entire real-time experience depends on. Establishing the join/leave/disconnect lifecycle now — even before any events are broadcast — locks in the contract and lets feature 003+ broadcast against it without rework.

**Independent Test**: A test client can connect, request to join a sector group, be confirmed as a member of that group, request to leave, be confirmed as no longer a member, and disconnect — with no game state required.

**Acceptance Scenarios**:

1. **Given** a connected client, **When** it requests to join sector (X, Y), **Then** the server records the client as a member of the group for that sector.
2. **Given** a client is in a sector group, **When** it requests to leave that sector, **Then** the server removes the client from the group.
3. **Given** a client is in one or more sector groups, **When** the client disconnects, **Then** the server releases all of that client's group memberships automatically.
4. **Given** a client requests to join a sector with coordinates outside the legal galaxy bounds, **When** the request is processed, **Then** the server rejects the request and the client is not placed in any group.

---

### User Story 3 - Future systems can subscribe to the heartbeat (Priority: P2)

A future game system (ship updates, physics, combat, AI) needs to run on the existing 1-second or 6-second heartbeat. It can register a callback to be invoked on each heartbeat without anyone modifying the heartbeat component itself.

**Why this priority**: Avoids forcing every future feature to edit the tick engine. It is not a P1 because no real subscriber exists yet — but the extension point must be designed in now or feature 003 will require rework.

**Independent Test**: A test subscriber registers against each heartbeat, runs for a known duration, and is observed to have been invoked the expected number of times — without any source modification of the tick engine.

**Acceptance Scenarios**:

1. **Given** the tick engine is running, **When** a new subscriber registers for the 1-second heartbeat, **Then** that subscriber is invoked on every subsequent 1-second heartbeat.
2. **Given** a subscriber is registered, **When** it is unregistered, **Then** it is no longer invoked on subsequent heartbeats.
3. **Given** a subscriber throws an error during a heartbeat, **When** the heartbeat fires again, **Then** other subscribers still execute and the heartbeat continues firing on schedule.

---

### Edge Cases

- The heartbeat must not drift permanently if a single tick takes longer than expected — the next tick fires on its own schedule rather than piling up.
- If the database is unreachable at boot, the server must fail fast with a clear error rather than starting in a half-broken state.
- If a client requests to leave a sector group it never joined, the server must handle it as a no-op without error.
- If the same client requests to join the same sector group twice in a row, no duplicate membership or duplicate event delivery occurs.
- Process shutdown must clear both heartbeats — no orphan timers may continue running after the application stops.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The server MUST establish a connection to the persistent data store on startup and close it cleanly on shutdown.
- **FR-002**: The server MUST expose a real-time connection endpoint that clients can connect to and disconnect from.
- **FR-003**: The server MUST fire a recurring 1-second heartbeat for ship-update-class work, and a recurring 6-second heartbeat for physics-class work, matching the original game's tick cadence.
- **FR-004**: Heartbeats MUST start when the server starts and stop when the server stops, with no timers leaking past shutdown.
- **FR-005**: Heartbeat counters MUST reset on each server start; persistence of tick counts is not required.
- **FR-006**: The real-time layer MUST allow a client to join a logical group identified by sector coordinates.
- **FR-007**: The real-time layer MUST allow a client to leave a sector group it has joined.
- **FR-008**: The real-time layer MUST automatically release all of a client's sector group memberships when the client disconnects.
- **FR-009**: The real-time layer MUST reject sector group join requests for coordinates outside the legal 30 × 15 galaxy bounds.
- **FR-010**: The tick engine MUST allow new heartbeat subscribers to register and unregister without modification of the tick engine itself.
- **FR-011**: A subscriber error during one heartbeat MUST NOT prevent other subscribers from running, nor stop subsequent heartbeats from firing.
- **FR-012**: Each heartbeat's next firing time MUST be based on its own schedule, not chained off completion of prior work, so a slow tick does not accumulate drift.
- **FR-013**: Bootstrap failure (e.g., unreachable data store) MUST cause the server to exit with a clear error rather than silently degrade.

### Key Entities

- **Sector Group**: A logical grouping of connected clients identified by integer sector coordinates (X, Y). Used as the addressable unit for future scoped real-time event delivery.
- **Heartbeat Subscriber**: A registered callback that is invoked on every firing of a specific heartbeat (1-second or 6-second).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A fresh server boot reaches "ready to accept clients" in under 5 seconds on developer hardware.
- **SC-002**: Over a 10-minute soak run, the 1-second heartbeat fires within ±5% of 600 invocations and the 6-second heartbeat within ±5% of 100 invocations.
- **SC-003**: After a clean shutdown signal, the process exits within 3 seconds with no orphaned timers and no unclosed database connection.
- **SC-004**: A test client can join a sector group, leave it, and disconnect across at least 100 join/leave cycles with zero leaked memberships.
- **SC-005**: A subscriber that throws on every invocation does not reduce the firing rate of the heartbeat measured over a 1-minute window.
- **SC-006**: 100% of automated tests covering tick cadence, sector room lifecycle, data-store lifecycle hooks, and end-to-end boot pass before this feature is considered complete.

## Assumptions

- Single-process deployment for now — no clustering or multi-node coordination is required at this layer.
- The data store referenced is the same Postgres instance used by feature 001's schema; no schema changes are introduced by this feature.
- Sector coordinate bounds (X: 1–30, Y: 1–15) come from the original game's `MAXX`/`MAXY` constants and are treated as fixed for the lifetime of this feature.
- The 1-second and 6-second cadences are derived from the original game and are not configurable in this feature.
- Authentication, player identity, in-memory ship state, async DB flush, game logic, galaxy generation, and the nightly maintenance job are all explicitly out of scope and will arrive in later features (003+).
- Operators are responsible for providing required environment configuration (database URL, port) prior to boot.
