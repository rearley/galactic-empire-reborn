# Feature Specification: Faithful Onboarding & Ship Purchase

**Feature Branch**: `021-onboarding-ship-purchase`
**Created**: 2026-05-08
**Status**: Draft

## Overview

New players currently pick any ship class at registration — including the most expensive
warships — for free. This contradicts the original game, where everyone starts with the
cheapest ship (Interceptor, class 1) and must earn enough credits to buy bigger ships at
Zygor station. This feature restores that progression and implements the in-game ship
purchase command faithfully.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — New player receives Interceptor automatically (Priority: P1)

A brand-new player registers, completes onboarding (username → ship name), and is placed
in the game flying an Interceptor with 5,000 credits and 3 flux pods. No ship class picker
is shown. This matches the original BBS experience where the starting ship was fixed by the
sysop and new players had no choice.

**Why this priority**: The class picker is the most obvious fidelity break — a new player
can currently pick a Dreadnought (2m credit ship) for free.

**Independent Test**: Register a new account, complete onboarding, verify `rep sys` shows
Interceptor class, `rep cargo` shows 3 flux pods, and player has 5,000 credits.

**Acceptance Scenarios**:

1. **Given** a new user with no ship, **When** they complete onboarding (name only), **Then** they receive an Interceptor (class 1), 5,000 starting credits, and 3 flux pods in cargo
2. **Given** a new user, **When** onboarding completes, **Then** no class-picker prompt is sent — they go directly from ship-name prompt to game
3. **Given** a new player with their Interceptor, **When** they type `rep sys`, **Then** the class line shows "Interceptor"

---

### User Story 2 — Player buys a new ship at Zygor-3 (Priority: P1)

An existing player who has earned enough credits flies to the neutral zone, orbits Zygor-3
(planet 1 at sector 0,0), and types `new ship 4` to purchase a Destroyer for 600,000 credits.
The credits are deducted and the new ship is created. The player can then board the new ship.

**Why this priority**: Without this command, there is no way to ever get a better ship, making
the game unwinnable past the Interceptor.

**Independent Test**: Seed a player with sufficient credits, orbit Zygor-3, run `new ship 4`,
verify credits deducted and new ship exists in the fleet.

**Acceptance Scenarios**:

1. **Given** a player orbiting Zygor-3 with 600,000+ credits, **When** they type `new ship 4`, **Then** 600,000 credits are deducted and a Destroyer is added to their fleet
2. **Given** a player with insufficient credits, **When** they type `new ship 4`, **Then** they receive a "not enough credits" message and no ship is created
3. **Given** a player NOT orbiting Zygor-3, **When** they type `new ship 4`, **Then** they receive a "must be at Zygor station" message
4. **Given** a player typing `new ship`, **Then** they receive a list of all purchasable ship classes with their prices
5. **Given** a player typing `new shield <type>`, **Then** they receive an upgrade-not-implemented notice (shield upgrades are out of scope for this feature)
6. **Given** a player orbiting Zygor-3, **When** they type `new ship 99` (invalid class), **Then** they receive an "invalid ship class" message

---

### User Story 3 — Starting ship, cash, and cargo are correct (Priority: P2)

The exact starting state matches the original C source: class 1 Interceptor, `STRTCASH` × 1000
credits (default 5,000), and exactly 3 flux pods in cargo with all other item slots at zero.

**Why this priority**: These values are pinned in the C source (`initshp` in GEFUNCS.C) and are
the foundation of the game's economy balance.

**Independent Test**: Register, verify exact item array via `rep cargo` and exact cash via `rep sys`.

**Acceptance Scenarios**:

1. **Given** a newly created ship, **When** player checks cargo, **Then** exactly 3 flux pods are shown and all other item quantities are zero
2. **Given** a newly created ship, **When** player checks nav/sys report, **Then** cash shows 5,000 credits
3. **Given** the balance regression test suite, **When** constants are checked, **Then** `START_CASH = 5000` and `START_FLUX_PODS = 3` are pinned

---

### Edge Cases

- Player tries to buy class 1 (Interceptor) — they already have one; the command still works since the original permits multiple ships
- Player tries to buy an AI ship class (21-25, 31-33) — rejected as invalid
- Player has exactly the right amount of credits — purchase succeeds (boundary: `>=` not `>`)
- `new` command with no subcommand or unknown subcommand shows usage help
- Player tries `new ship <class>` while not docked on any planet — rejected
- Player tries `new ship <class>` while docked on a non-Zygor planet — rejected (must be neutral zone planet 1)

## Requirements *(mandatory)*

### Functional Requirements

**Onboarding changes:**
- **FR-001**: Onboarding MUST NOT show a ship class picker — all new players receive class 1 (Interceptor) automatically
- **FR-002**: New players MUST start with exactly 5,000 credits (`START_CASH`)
- **FR-003**: New ships MUST be initialised with exactly 3 flux pods (index 4) and zero quantity for all other items (`START_FLUX_PODS = 3`)
- **FR-004**: The class-picker prompt and reply handler MUST be removed from the onboarding state machine; onboarding goes directly username → ship-name → done
- **FR-005**: The frontend class-picker component MUST be removed; onboarding sends only the ship-name prompt

**`new ship` command:**
- **FR-006**: Typing `new ship <classNumber>` MUST be handled as an in-game command available to players with an active ship
- **FR-007**: The command MUST require the player to be orbiting planet 1 at the neutral zone sector (0, 0) — i.e., Zygor-3
- **FR-008**: The command MUST validate that `classNumber` maps to a PLAYER category ship class
- **FR-009**: The command MUST check that the player has cash >= the ship's `maxPrice` before creating the ship
- **FR-010**: On success, `maxPrice` MUST be deducted from the player's cash and a new ship of the chosen class MUST be created with default starting loadout (3 flux pods, zero other items, full energy)
- **FR-011**: Typing `new ship` with no class number MUST list all purchasable player ship classes with their prices
- **FR-012**: Typing `new` with no subcommand MUST display usage help
- **FR-013**: The `new` keyword's onboarding intercept MUST continue to work for players who have no ship yet (first-time players connect → no ship → onboarding flow unchanged at the socket level)

### Key Entities

- **ShipClass**: classNumber, typeName, maxPrice, category — determines what can be purchased and at what cost
- **User**: cash — debited on purchase
- **Ship**: new row created on successful purchase; inherits default loadout from `initshp` semantics
- **START_CASH** constant: 5,000 credits — new player starting cash, pinned by balance regression test
- **START_FLUX_PODS** constant: 3 — starting flux pod count, pinned by balance regression test

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new player completes registration and enters the game as an Interceptor pilot in under 60 seconds — no class-picker step
- **SC-002**: A player with sufficient credits can purchase any valid ship class at Zygor-3 in a single `new ship <N>` command
- **SC-003**: All 6 rejection paths (wrong location, insufficient credits, invalid class, AI class, no subcommand, missing arg) return a clear message with no state change
- **SC-004**: `START_CASH` and `START_FLUX_PODS` are covered by balance regression tests that fail if either constant changes
- **SC-005**: Existing players with ships are unaffected by the onboarding changes — their session, state, and commands work identically

## Assumptions

- `STRTCASH` default in the original BBS config was 5 (× 1000 = 5,000 credits); this matches the approximate value implied by item prices and is used as the hardcoded default
- Shield upgrades (`new shield <type>`) are out of scope for this feature — the response is a stub message directing players to a future feature
- The `new` command's onboarding intercept (for players with no ship) stays at the gateway/onboarding-service level and is not routed through `CommandRouterService` — preserving the existing architecture
- Multiple ships per player are permitted by the original (player can own a fleet); this feature does not impose a cap (deferring `maxships` enforcement)
- The new ship starts at the neutral zone sector (0, 0) to match `initshp` which places ships near the starting area
- Starting energy for the new ship is `ENGYMAX` (65,000) per `initshp` in GEFUNCS.C
