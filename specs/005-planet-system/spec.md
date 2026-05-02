# Feature Specification: Planet System

**Feature Branch**: `005-planet-system`
**Created**: 2026-05-02
**Status**: Draft
**Input**: User description: "Colonization, economy, and planet management. First feature where the nameless planets generated in 004 become owned, named, and productive."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Claim a Planet by Landing (Priority: P1)

A pilot maneuvers their ship into a sector containing an unowned planet, enters orbit, lands on the surface, names the planet, and walks away as its owner. The planet now appears on scans bearing the player's name and team color.

**Why this priority**: This is the gateway moment of the entire feature. Without colonization, the rest of the planet economy (production, buy/sell, tax, admin) has no participants. It is also the only path through which a planet acquires an owner in the original game (no transfer or assignment exists).

**Independent Test**: A test pilot can fly to a sector with a known unowned planet, issue `orbit`, then `land`, supply a planet name, and verify on the next `scan` that the planet shows their name and team. Delivers the standalone value of "I own a place in the galaxy."

**Acceptance Scenarios**:

1. **Given** a pilot in a sector containing an unowned planet, **When** they enter orbit and land and provide a name, **Then** the planet is recorded as owned by that pilot with the supplied name and the change is visible on subsequent scans.
2. **Given** a pilot attempts to land on a planet they do not own, **When** the planet has an owner, **Then** the system requires the trade password (or refuses entry per original behavior) and does not transfer ownership.
3. **Given** a pilot is in a sector with no planet, **When** they issue `orbit`, **Then** the system informs them there is nothing to orbit.

---

### User Story 2 - Trade with a Planet (Priority: P1)

A pilot orbits and lands on a planet (their own or another's, with permission), inspects the inventory and prices, and trades items. Buy moves goods between planet inventory and ship cargo (with cash flowing the other way). Sell is a galactic-market action — items leave the ship and the universe at `baseprice` minus a small system fee; planet inventory is not affected by sells. All quantities and cash update in real time and persist.

**Why this priority**: Trade is what makes a galaxy of owned planets *worth* owning. Without buy/sell, planets are inert nameplates and the production tick has no purpose. The original game's entire economic loop (production → trade → cash → ship upgrades and warfare) hinges on this.

**Independent Test**: A pilot lands on a planet with a known inventory and a known price markup, buys a quantity of one item, and verifies (a) ship cargo increased, (b) ship cash decreased by quantity × planet price, (c) planet inventory decreased, (d) planet cash increased. Reverse direction for sell.

**Acceptance Scenarios**:

1. **Given** a pilot landed on a planet with sufficient inventory of an item, **When** they buy a quantity at the displayed price, **Then** ship cargo, ship cash, planet inventory, and planet cash all update consistently and the changes survive a restart.
2. **Given** a pilot landed on a planet that accepts the item (sell flag set), **When** they sell, **Then** ship cargo decreases, the pilot receives `proceeds − fee` where `proceeds = baseprice × qty` and `fee = 1 + proceeds/1000`, and the items are removed from the universe (galactic market model). Planet inventory and cash are unchanged.
3. **Given** a planet's inventory of an item is below its configured reserve, **When** the pilot attempts to buy more than the surplus, **Then** the system blocks the purchase or limits it to the surplus above reserve.

---

### User Story 3 - Productive Planet Economy Over Time (Priority: P1)

A planet a pilot owns continues to produce items even when no one is watching. Population grows, food and goods accumulate based on per-item production rates, and when the owner returns the inventory has changed in their absence.

**Why this priority**: Persistent production is what distinguishes a 24/7 universe from a session-based game. It is also a load-bearing source of long-term player wealth and the entire reason the planet tick exists in the original. P1 because Stories 1 and 2 only have meaning if the world *moves* between visits.

**Independent Test**: Set up a planet with a known population (`I_MEN.qty`) and a known production rate for one item. Advance the planet update tick a known number of times in a fake clock. Verify the item quantity grew per the documented production formula and that population also grew per its own rate.

**Acceptance Scenarios**:

1. **Given** an owned planet with a non-zero population and a non-zero rate for an item, **When** the planet update tick fires for that planet, **Then** the item quantity increases according to the production formula derived from the original `multiply()` routine.
2. **Given** a planet whose population is zero, **When** the planet update tick fires, **Then** no production occurs (a dead world produces nothing).
3. **Given** the system has N planets, **When** the planet tick is running, **Then** every planet is processed at least once within one full pass and the cadence of that full pass is governed by the configured planet lock time and planet count (not by the physics tick).

---

### User Story 4 - Owner Administration (Priority: P2)

A planet owner lands on their world and uses the admin menu to set per-item production rates, item markup, sell flag, and reserve; set a tax rate on visiting traders; set the beacon message visible to other ships in the sector; set or change the trade password; and withdraw accumulated tax cash to their ship.

**Why this priority**: The admin menu is what gives the owner agency — without it, planets are productive but not *configurable*, and there is no path for an owner to extract wealth from their world. P2 because the production loop and trade loop (P1 stories) function on default values; admin is the layer that turns ownership into a strategic tool.

**Independent Test**: An owner lands on their planet, opens the admin menu, changes the rate of one item from X to Y, and verifies (a) the change is reflected immediately on re-entry, (b) the next planet update tick uses the new rate, (c) the change persists after server restart.

**Acceptance Scenarios**:

1. **Given** the planet owner is landed, **When** they change an item's production rate, markup, sell flag, or reserve, **Then** subsequent ticks and trades use the new value.
2. **Given** the planet owner is landed, **When** they set a tax rate, **Then** subsequent planet-update ticks accrue `(taxrate/1200) * I_MEN.qty` into the planet's tax pool and apply `taxfact = 1 - (taxrate/120)` as a multiplier reducing production output. Buy transactions are unaffected.
3. **Given** the planet owner is landed, **When** they withdraw tax cash, **Then** the cash transfers from the planet's tax pool to the ship's cash and both balances update consistently.
4. **Given** the planet owner sets a beacon message, **When** another ship is in the same sector and scans, **Then** the beacon message is visible.
5. **Given** the planet owner sets a trade password, **When** a non-owner attempts to land or trade, **Then** the system requires the password.

---

### User Story 5 - Real Cargo Visibility (Priority: P2)

A pilot issues the `report cargo` command and sees the actual contents of their ship's hold (the 14-item inventory), with quantities matching what they have bought or sold.

**Why this priority**: This was deferred from feature 003. P2 because trade (P1) functions correctly without it — the player just cannot easily see what they have. Once Story 2 is in place, players need this to trade competently.

**Independent Test**: Buy a known quantity of one item on a planet, issue `report cargo`, and verify that the displayed cargo matches what was bought. Repeat after selling.

**Acceptance Scenarios**:

1. **Given** a pilot has cargo from prior trades, **When** they issue `report cargo`, **Then** the report shows their actual current per-item quantities, not placeholder values.

---

### Edge Cases

- A second pilot tries to land on a planet that another pilot is currently landed on or trading with — the system must serialize these interactions so quantities and cash do not drift (no double-spend, no negative inventory).
- A pilot issues `land` while in orbit at a planet whose owner has set a trade password they do not know — the system must refuse and not leak whether the password attempt was the failure mode versus the planet being closed.
- A pilot tries to buy more of an item than the planet has above reserve — purchase is limited or refused with a clear message; planet inventory never goes below reserve.
- A pilot tries to buy more than their ship cargo capacity allows — purchase is limited to capacity; ship cash is debited only for what was actually loaded.
- The planet update tick is processing planet P at the moment a pilot completes a trade on planet P — the system must not lose either change.
- A planet's population is reduced to zero by some external means (combat in feature 006) — production must immediately stop on that planet from the next tick onward.
- The server is restarted between the moment a planet was claimed and its first economic tick — the ownership and name must be present after restart.
- The planet update tick rate, derived from planet count and the planet lock time, must yield a sane interval even with very few planets (do not fire continuously) and with very many (do not starve any planet).
- A pilot tries to admin-edit a planet they do not own — refused.
- A pilot tries to `orbit` while warping or in combat — disallowed per ship state rules from prior features.

## Clarifications

### Session 2026-05-02

- Q: Can multiple pilots be landed on the same planet simultaneously? → A: Yes; mutations (buy/sell/admin/tick) are serialized per planet, but presence is not exclusive.
- Q: What constraints apply to planet names on claim? → A: Match the original C buffer widths exactly (planet name ≤19 chars + null per `char name[20]` in `GEMAIN.H`); printable ASCII; no galaxy-wide uniqueness check (duplicates allowed, matching original).
- Q: What planet count does SC-003 target? → A: The actual live count produced by feature 004's generator, queried at startup (mirroring the original's `cntrbtv()` count used by `plartia()`); cadence is derived from that count and the planet lock time. Tests verify the cadence formula, not a hardcoded planet ceiling — pinning a number like 450 would be fiction because generation is probabilistic.
- Q: When does planet economic state flush to durable storage? → A: Flush per mutation, matching original (`gesdb(GEUPDATE,...)` after each buy/sell/admin change), plus after each planet-update tick processes a planet, plus on graceful shutdown. Planet mutations are sparse (only on explicit player actions and the planet-update tick) so per-mutation I/O cost is acceptable and crash safety is maximal. The dirty-flush pattern used for ships does NOT apply to planets.
- Q: How are tax and sell semantics defined? → A: Match original `GEPLANET.C:multiply()` and `GECMDS.C:buy/sell` exactly: tax is NOT per-purchase — it accrues only on the planet-update tick as `plptr->tax += (taxrate/1200) * MEN.qty`, taxed against population, and additionally reduces production via `taxfact = 1 - taxrate/120`. Buy: planet cash receives the full `tot` (no skim); owner pays `baseprice`, non-owners pay `markup2a`; allowed if buyer is owner OR `items[item].sell == 'Y'`; in the neutral zone planet inventory is NOT decremented. Sell: items are removed from universe (galactic market), pilot paid `baseprice - fee` where `fee = 1 + doll/1000`; planet inventory and planet cash are NOT modified.

## Requirements *(mandatory)*

### Functional Requirements

**Planet ownership and identity**

- **FR-001**: System MUST allow a pilot in the same sector as an unowned planet to enter orbit and then land, supplying a name, and MUST record the pilot as the owner and the supplied name as the planet's name. The supplied name MUST be 1–19 printable ASCII characters (matching the original `char name[20]` buffer in `GEMAIN.H`, leaving room for the null terminator), trimmed of leading/trailing whitespace. Galaxy-wide uniqueness is NOT enforced (duplicate names are permitted, matching original behavior).
- **FR-002**: System MUST persist planet ownership and name to durable storage immediately upon claim, without waiting for the dirty-flush cadence used for economic state.
- **FR-003**: System MUST NOT provide any command path for transferring ownership, abandoning a planet, or renaming a planet after claim. (Ownership clears only via the destruction path delivered in feature 006.)
- **FR-004**: System MUST validate that a planet supplied for landing exists in the pilot's current sector and is in an orbit-able state.

**Orbit and landing**

- **FR-005**: Users MUST be able to enter and leave orbit around a planet in their current sector via an `orbit` command.
- **FR-006**: Users MUST be able to land on a planet they are orbiting via a `land` command, subject to ownership and trade-password rules.
- **FR-007**: System MUST require the planet's trade password (when set) for any non-owner attempting to land or trade.

**Trade and inventory**

- **FR-008**: Each planet MUST maintain an inventory of exactly the 14 item types defined in the original game (NUMITEMS=14), each with: quantity, production rate, sell flag, markup, reserve, and the two sold-counter fields used by the original economy.
- **FR-009**: Users MUST be able to buy items from a planet they are landed on, matching `GECMDS.C:buy()` exactly. Outside the neutral zone: planet inventory decreases by the bought amount, planet cash increases by the full transaction total `tot` (no skim/tax), ship cargo increases, and ship cash decreases. Inside the neutral zone: planet inventory and planet cash are NOT modified, but ship cargo and ship cash still update. Owner buying from own planet pays `baseprice[item]`; non-owner buyers pay `markup2a`. Buying is permitted only when the buyer is the planet's owner OR `items[item].sell == 'Y'`.
- **FR-010**: Users MUST be able to sell items at a planet they are landed on. Sells remove items from the universe (galactic market model); the selling pilot receives baseprice minus a fee (fee = 1 + amount/1000). Planet inventory and planet cash are NOT credited on sells. The planet's sell flag controls whether the planet accepts the transaction, not whether items are stored. Selling is permitted only at a neutral-zone planet whose `plnum=1` (galactic-market hub, Zygor-3 in the original game). Attempting to sell at any other planet MUST be refused. See research.md Decision 4 and `GECMDS.C:4115-4127`.
- **FR-011**: System MUST refuse or cap a purchase that would take an item below its configured reserve.
- **FR-012**: System MUST cap a purchase to the buying ship's available cargo capacity and only debit cash for the quantity actually transferred.
- **FR-013**: System MUST serialize concurrent trades, admin operations, and ticks against the same planet so quantities and cash cannot diverge from a single consistent ledger. Multiple pilots MAY be landed on the same planet at the same time; landing itself is not exclusive — only mutations are serialized.

**Production**

- **FR-014**: System MUST run a dedicated planet-update cadence, separate from the existing physics and ship-update ticks, that processes one planet per firing.
- **FR-015**: The planet-update cadence MUST be derived at startup from the configured planet lock time and the live planet count obtained by counting all planets currently in durable storage (mirroring the original's `cntrbtv()`-based count used by `plartia()`), such that a full pass through every planet completes within the configured lock time. The cadence formula — not any specific planet count — is the unit-test target.
- **FR-016**: For each planet processed, the system MUST apply the production formula derived from the original `multiply()` routine, growing each item according to its rate and the planet's population.
- **FR-017**: A planet whose population is zero MUST produce nothing.
- **FR-018**: Planet row state MUST be written to durable storage immediately after each mutation that changes the planet row — specifically: buy (outside neutral zone), admin changes, tax withdrawal, and the planet-update tick production pass. Sell does NOT mutate the planet row and therefore does NOT trigger a planet flush. In-memory state is the live read source; durable storage is kept current on every write, not batched.

**Owner administration**

- **FR-019**: Planet owners MUST be able to set, per item, the production rate, the markup, the sell flag, and the reserve.
- **FR-020**: Tax is a population levy collected on the planet-update tick: tax += (taxrate / 1200) * items[I_MEN].qty. Tax rate also applies a production penalty: taxfact = 1 - taxrate/120. Tax is not a per-purchase surcharge on visitors.
- **FR-021**: Planet owners MUST be able to set a beacon message visible to other ships in the same sector.
- **FR-022**: Planet owners MUST be able to set or change the trade password.
- **FR-023**: Planet owners MUST be able to withdraw accumulated tax cash from the planet's tax pool to their ship's cash, with both balances updated consistently.
- **FR-024**: System MUST refuse all admin operations to a non-owner.

**Cargo reporting**

- **FR-025**: The `report cargo` command MUST return the ship's actual per-item cargo quantities (replacing the deferred placeholder behavior from feature 003).

**State and lifecycle**

- **FR-026**: On startup, the planet state service MUST hydrate its in-memory map from the galaxy read model produced in feature 004.
- **FR-027**: The read path for any landed pilot MUST consult the in-memory planet state, not durable storage, so reads reflect the up-to-the-moment ledger.
- **FR-028**: Balance constants from the original source — at minimum NUMITEMS, the planet lock time constant, and per-item production rate constants — MUST be preserved exactly and pinned by regression tests that fail on any change.

### Key Entities

- **Planet**: A celestial body in a sector. Identified by sector x/y plus an in-sector index. Holds: owner reference (nullable), name, beacon message, trade password, tax rate, accumulated tax pool, debt, cash, and a 14-slot item inventory.
- **PlanetItem (one of 14 per planet)**: One slot in the planet inventory. Holds: quantity, production rate, sell flag (does the planet buy this item from traders?), markup (the multiplier applied to base price for buyers), reserve (the floor below which buyers cannot deplete it), and the two running sold-counter fields used by the original economy.
- **Ship cargo (one of 14 per ship)**: Already exists in the data model; this feature is the first to read and write it for real via trade and `report cargo`.
- **Tick: Planet Update**: A new third tick kind, distinct from the physics and ship-update ticks. Cadence is derived dynamically from planet count and a configured lock time. Each firing processes exactly one planet.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new pilot can claim, name, and verify ownership of an unowned planet in a single uninterrupted session in under one minute of clock time.
- **SC-002**: Cash conservation across a buy followed by a sell of the same item on the same planet is fully accounted: ship cash + planet cash + the system fee deducted on sell = the starting total, with no unexplained leakage or creation, verified by a closed-book accounting test. Item count is NOT conserved across sells (sells remove items from the universe by design — galactic market model); the item-count invariant applies only across buys.
- **SC-003**: With the actual planet count produced by feature 004's generator on the live database, every planet receives at least one production update within the configured planet lock time, with no planet starved across a 24-hour soak. The cadence formula `interval = lock_time / planet_count` is verified independently by a unit test for arbitrary inputs.
- **SC-004**: After a server restart, every claimed planet retains its owner, name, beacon, password, tax rate, tax pool, and per-item inventory and rates exactly as they were after the last completed mutation. Per FR-018 (per-mutation flush), at most the single in-flight operation at the moment of crash may be lost.
- **SC-005**: Concurrent buy operations from two pilots against the same item on the same planet produce a final state that matches a serial replay of those two operations in some order — never a state that could not arise from any serial order.
- **SC-006**: Production output for a known population and rate over a known number of ticks matches the original game's `multiply()` formula to the unit, verified by a unit test using a fake clock.
- **SC-007**: 100% of the original game's 14 item types are represented and traded; an audit test fails if any slot is missing or duplicated.
- **SC-008**: Owner-only admin operations attempted by non-owners are refused 100% of the time; verified by an exhaustive negative test across every admin operation.

## Assumptions

- The galaxy generated in feature 004 already places planets in sectors and exposes them via the galaxy read model. This feature consumes that read model and does not regenerate or relocate planets.
- Ship cargo storage already exists in the data model from feature 001; this feature is the first to populate it through actual trade.
- A landed pilot's session reads from in-memory planet state. Durable storage is written on every mutation so crash recovery loses at most the current in-flight operation, not a full tick's worth of trades.
- The original game's `plarti`/`plartia` timer model is faithfully represented as a third tick kind ("planet update"), distinct in cadence and purpose from the existing 6-second physics tick and 1-second ship-update tick. The cadence is derived at startup from the planet count and the original `PLANTOCK` lock-time constant.
- The midnight job (feature 009) — not this feature — handles end-of-day planet scoring and the production-report mail. This feature must leave behind the data those jobs need (per-planet production accumulators, ownership, item state).
- The `check_spy()` behavior referenced in the original `plartia()` code path is part of feature 006 (combat / planetary defense) and is intentionally not implemented here; the planet update tick in this feature does production only.
- Admin and trade UX is text-command driven, in keeping with the project's fidelity to the original interface — no graphical admin panel.
- Concurrency control is achieved by the in-memory planet state service serializing all reads and writes for a given planet through a single owner thread of execution; durable writes happen on the planet-update tick. No external lock service is assumed.
- "Trade password" matches original semantics: a per-planet shared secret set by the owner, presented by visitors who wish to land/trade. It is not a per-user authentication system.
