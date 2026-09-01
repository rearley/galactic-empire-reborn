# Feature Specification: Planet Attack Commands

**Feature Branch**: `014-planet-attack`
**Created**: 2026-05-07
**Status**: Draft
**Input**: User description: Planetary assault (`att`), planet ownership listing (`pln`), price display (`pri`), and the deferred maintenance password gate (FR-210 from feature 013).

## Overview

This feature delivers the primary endgame loop of Galactic Empire: capturing
enemy planets through troop and fighter assaults. It also surfaces two
read-only commands captains use constantly during the assault loop (`pln` to
see what they own, `pri` to see what items cost at the orbited planet) and
closes a known fidelity gap from feature 013 by adding the password gate to
the existing `mai` (maintenance) command.

Behavior is faithful to the original C source. Combat math, message ordering,
the spy-mail roll, the planet-owner real-time alert, and the documented
`/* there is a bug here */` quirk in `attack_fig()` are all preserved.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Assault an enemy planet with troops (Priority: P1)

A captain in orbit around an enemy-owned planet types `att 5000 troops` to
land a ground invasion. Their troops disembark, planet defenders (fighters
and ground troops) engage, and the system reports kills on both sides. If
the captain overwhelms the defenders, ownership transfers to them and the
former owner receives a distress mail. If the defenders crush the assault,
surviving troops return to the captain's cargo and the former owner receives
a less alarming distress mail.

**Why this priority**: Without `att`, captured planets cannot change hands,
and the entire planet-ownership subsystem (built in feature 005, exercised
by midnight scoring in feature 009) has no player-facing path to actually
take a planet. This is *the* endgame loop — no other command in this
feature is meaningful without it.

**Independent Test**: Two captains, one orbiting the other's planet. Captain
A types `att 1000 troops`. Verify cargo deduction, combat narration,
defender attrition, planet state flushed to the database, real-time alert
delivered to captain B if online, and a distress mail queued otherwise.
Repeat with overwhelming numbers and verify ownership transfer plus the
captor's planet count increment.

**Acceptance Scenarios**:

1. **Given** a captain in orbit around a foreign planet with 1000 troops in
   cargo, **When** they issue `att 1000 troops`, **Then** the 1000 troops
   are removed from cargo, defender fighters fire first (if the planet has
   any), defender troops engage, kills on both sides are narrated, surviving
   attackers return to cargo, planet state is persisted, and the planet
   owner is notified.
2. **Given** an attacker whose surviving force vastly outnumbers defenders
   (`left2 > 0 && left2 < left1/4`), **When** the engagement resolves,
   **Then** the attacker is declared the winner, planet ownership transfers
   to the attacker's user id, the attacker's `planets` count increments,
   the attacker's `hostile` flag is cleared, and the former owner receives
   a `MESG03` planet-lost mail.
3. **Given** an attacker whose surviving force is dwarfed by defenders
   (`left1 > 0 && left1 < left2/4`), **When** the engagement resolves,
   **Then** the attack is reported as a retreat, the surviving troops are
   transferred to the planet's defenders (`plptr->items[I_TROOPS].qty +=
   left1`), and the attacker keeps zero returning troops.
4. **Given** an attacker who fully wipes out planet defenders (no surviving
   defender troops, defender fighters at zero, attacker still has any
   troops remaining), **When** the engagement resolves, **Then** the attack
   is declared a win.
5. **Given** an attack with `ratio > 2` and `left1 > left2/2`, **When** the
   engagement resolves, **Then** for each non-troop item type on the planet
   a random quantity (0–14, capped at the planet's current quantity) is
   destroyed and reported.
6. **Given** the planet owner is online and in a fight-capable state when
   an attack resolves, **When** the system processes the call-for-help
   step, **Then** a real-time alert is delivered to the planet owner's
   socket session naming the planet, sector, attacker user id, and ship
   name.
7. **Given** a captain attempts `att` while not in orbit (`ship.where < 10`),
   **When** the command is processed, **Then** the request is rejected with
   the orbit-required error message and no cargo changes occur.
8. **Given** a captain attempts `att` against their own planet, **When** the
   command is processed, **Then** the request is rejected with the
   self-attack error message.
9. **Given** a captain in the neutral zone attempts `att`, **When** the
   command is processed, **Then** the captain is "zapped" by the neutral
   zone defense (existing behavior from feature 005/006).
10. **Given** a captain attempts `att 0 troops` or `att N troops` where
    `N > cargo holdings`, **When** the command is processed, **Then** the
    request is rejected with the insufficient-troops error message.
11. **Given** a captain whose ship class has `max_attk == 0`, **When** they
    issue `att`, **Then** the request is rejected with the "this ship
    cannot attack planets" error message.
12. **Given** a captain orbits a wormhole planet entry, **When** they issue
    `att`, **Then** the request is rejected with the "cannot attack
    wormhole" error message.

---

### User Story 2 - Assault an enemy planet with fighters (Priority: P1)

A captain orbiting an enemy planet launches fighters with `att N fighters`.
Defender fighters engage in air-to-air combat, and if the planet has more
than 500 defending troops there is a chance ground troops also shoot down
attacking fighters. Surviving fighters return to cargo. Winning here means
no defender fighters remain *and* the planet has fewer than 5 defender
troops left.

**Why this priority**: Fighter assaults are the second canonical attack
mode and are required for ships and players that lean toward fighter-heavy
loadouts. They share the orbit/self/wormhole/neutral-zone preconditions
with troop assaults but have distinct combat math and a stricter win
condition. Equal priority with troop assault.

**Independent Test**: Captain A in orbit, planet has both fighters and
>500 troops. Captain A types `att 500 fighters`. Verify ground-troop
shootdown roll fires (the `gernd()%5-1 > 0` branch), defender fighters
shoot back, kills are narrated correctly, and surviving fighters return
to cargo. Repeat with planet troops < 5 and verify a win message and
ownership transfer.

**Acceptance Scenarios**:

1. **Given** a captain in orbit with N fighters and a planet with M
   defender fighters, **When** they issue `att N fighters`, **Then** the
   N fighters leave cargo, kill counts on both sides are computed using
   the documented planet-fighter ratio constants, surviving fighters
   return to cargo, and planet defender fighter count is updated.
2. **Given** the planet has more than 500 defender troops and the random
   ground-fire roll succeeds (`gernd() % 5 - 1 > 0`), **When** the
   engagement resolves, **Then** an additional kill count is applied to
   the attacker's fighters representing ground anti-air fire, narrated
   with the dedicated ground-troop-shootdown message.
3. **Given** the attack ends with at least one attacker fighter surviving,
   no defender fighters remaining, and fewer than 5 defender troops on
   the planet, **When** the win is determined, **Then** the captain is
   declared victor, planet ownership transfers, and the former owner
   receives a `MESG05` planet-lost mail.
4. **Given** the attack ratio exceeds 5%, **When** the engagement
   resolves, **Then** each non-fighter item on the planet has a random
   quantity (0–14, capped) destroyed.
5. **Given** a fighter attack on a planet with no fighters of its own,
   **When** the engagement resolves, **Then** defender return-fire and the
   counter-kill do not occur (both are gated on `left2 > 0` in C and remain
   so), but ground anti-air from the planet's TROOPS is applied to the
   attacking wing, and the raid counts as unopposed for item destruction,
   the owner alert and distress mail. **Superseded 2026-09-01** — this
   previously required preserving two defects in `attack_fig()`. See
   docs/DECISIONS.md.
6. **Given** the attacker has zero fighters in cargo or specifies an
   amount exceeding their holdings, **When** the command is parsed,
   **Then** the insufficient-fighters error message is returned and no
   state mutates.

---

### User Story 3 - List the planets I own (Priority: P2)

A captain wants to see at a glance every planet currently bearing their
user id. They type `pln` and receive a tabular list of name, sector
coordinates, and planet number per row. If they own no planets, a
"you don't own any planets" message is returned.

**Why this priority**: This is the most-used read-only planet command in
the original game and is essential context after any successful `att`.
It has no preconditions, no DB writes, and no tick coupling — it is the
simplest deliverable in this feature, but its value depends on `att`
being live first.

**Independent Test**: Seed the database with three planets owned by the
calling captain and several owned by others. Type `pln`. Verify exactly
three rows appear, sorted as the planet table iterates, with name,
xsect, ysect, and planet number columns. Repeat with zero owned planets
and verify the empty-state message.

**Acceptance Scenarios**:

1. **Given** a captain who owns three planets, **When** they type `pln`,
   **Then** the response lists all three planets with name, xsect,
   ysect, and plnum, and lists no planets owned by other captains.
2. **Given** a captain who owns zero planets, **When** they type `pln`,
   **Then** the empty-state message is returned.
3. **Given** the planet store is reachable, **When** `pln` runs, **Then**
   no planet state is mutated and no DB writes occur.

---

### User Story 4 - Show prices at the orbited planet (Priority: P2)

A captain orbiting a planet wants to confirm the cost of buying N of a
specific item before committing to the purchase. They type `pri 100 men`
and receive a price quote. The same precondition ladder as `buy` applies
(planet owned, sell flag, cargo capacity, reserve, cash), but no cash is
deducted and no inventory transfers.

**Why this priority**: `pri` is the natural pre-purchase query and pairs
directly with the buy/sell flow built in feature 005. It is read-only and
has no tick coupling. Low independent risk; included here because both
the original command table and the `cmd_price` source already exist
adjacent to attack code, making it a natural shipment slice.

**Independent Test**: Seed a planet with known item quantities and
markups. Captain orbits the planet and types `pri`. Verify the response
lists the price for every item, using the captain's appropriate price
view (base or markup). Repeat for `pri N <item>` to display the total
cost of buying N of one item without performing the purchase.

**Acceptance Scenarios**:

1. **Given** a captain in orbit around an owned planet who types
   `pri 100 men`, **When** the captain is the planet owner and all
   preconditions pass, **Then** the system returns the PRICE1 quote
   using `baseprice × 100` with no cash deduction.
2. **Given** a captain in orbit around a foreign planet where the item
   sell flag is `'Y'` and all other preconditions pass, **When** they
   type `pri 100 men`, **Then** the system returns the PRICE1 quote
   using `markup2a × 100`.
3. **Given** a foreign captain and the item's sell flag is not `'Y'`,
   **When** they type `pri 100 men`, **Then** BUY4 is returned and no
   quote is shown.
4. **Given** available stock after reserve subtraction is less than the
   requested amount, **When** the captain types `pri N <item>`, **Then**
   BUY3 is returned.
5. **Given** the captain has insufficient cash to afford the purchase,
   **When** they type `pri N <item>`, **Then** BUY2 is returned — even
   though no purchase would occur.
6. **Given** the captain's cargo has insufficient free capacity for N
   of the item, **When** they type `pri N <item>`, **Then** BUY8 is
   returned.
7. **Given** a bare `pri` with no arguments, **When** the command is
   processed, **Then** the system lists the price of every item at
   the orbited planet (one PRICE1 line per sellable item).
8. **Given** the orbited planet has no owner, **When** any
   `pri N <item>` is issued, **Then** BUY7 is returned.

---

### User Story 5 - Maintenance requires the planet password (Priority: P2)

A captain in orbit around a planet whose owner has set a password (any
value other than the literal `"none"`) must supply that password as an
argument to `mai` before repairs are performed and cash is debited.
Currently `mai` charges and repairs unconditionally — this story patches
the existing handler to enforce the password.

**Why this priority**: This was tracked as FR-210 in feature 013 and
deferred there. It is a one-line conditional in the original source
(GECMDS.C lines 4469–4482) and is required for fidelity: planets with
passwords are how owners restrict free repairs to allies. Patching this
is small but blocks the "planet defense" narrative — without it, any
captain can repair on any owned planet for free, which trivializes the
whole password mechanic.

**Independent Test**: Seed a planet with `password = "secret"`, owner
populated, men ≥ 25,000. Captain in orbit types `mai` (no arg) — verify
"password required" message and no cash deduction. Captain types `mai
wrong` — verify "incorrect password" message and no deduction. Captain
types `mai secret` — verify maintenance proceeds and cash is debited.
Captain orbits a planet whose password is the literal `"none"` — verify
maintenance proceeds without an argument.

**Acceptance Scenarios**:

1. **Given** a planet with a non-`"none"` password, **When** a captain
   issues `mai` with no argument, **Then** the password-required error is
   returned and no cash, energy, hull, or shield state changes.
2. **Given** a planet with password `"secret"`, **When** the captain
   issues `mai wrong`, **Then** the incorrect-password error is returned
   and no state changes.
3. **Given** a planet with password `"secret"`, **When** the captain
   issues `mai secret`, **Then** maintenance proceeds: the existing
   FR-013-series price/repair logic runs unchanged.
4. **Given** a planet with password `"none"`, **When** the captain issues
   `mai` with or without an argument, **Then** maintenance proceeds (the
   `"none"` literal is the documented "no password set" sentinel).
5. **Given** the orbited planet has no owner or fewer than 25,000 men,
   **When** the captain issues `mai` with the correct password, **Then**
   the existing "no maintenance available here" error fires (unchanged
   from feature 013).

---

### Edge Cases

- **Concurrent attacks on the same planet**: Two captains issue `att`
  simultaneously against the same planet. The per-planet mutex
  established in feature 005 (PlanetStateService) serializes the
  mutations: the second attacker **blocks waiting** for the lock, then
  on acquisition **re-runs state-dependent preconditions only (orbit,
  self-attack, cargo)** against the post-first-attack state before
  resolving — static preconditions (max_attk, wormhole, neutral zone)
  are not re-evaluated. If the first attack captured the planet, the
  second attacker's self-attack check now fires and the request is
  rejected (no cargo deduction). Otherwise the second attack resolves
  against the depleted defender state. Both successful resolutions
  produce their own mail/alert paths.
- **Planet owner logs out mid-combat**: If the owner is detected online
  at the start of `call_4_help` but disconnects before the alert is
  emitted, the alert is silently dropped (the socket room is empty —
  no fallback to mail in that race; mail is only sent on the original
  ratio-driven branches).
- **Attacker dies mid-attack**: If an unrelated combat event destroys
  the attacker's ship between the cargo deduction and the resolution
  step, the attack still resolves logically against the planet
  (defender state has already been mutated in the in-memory record);
  the surviving-troops return to cargo step is skipped because the
  ship no longer exists. This matches the original tick model.
- **Planet has zero defender fighters AND zero defender troops**: The
  win condition for a troop attack (`left1 > 0 && left2 <= 0 &&
  plptr->items[I_FIGHTER].qty <= 0`) is satisfied immediately and
  ownership transfers without combat narration beyond the standard
  kill-count messages (which will report zero kills).
- **`won == 0` after a fighter attack with `ratio <= 2`**: Per the
  original source, no mail is sent in this case (only `ratio > 2 ||
  won == 1` triggers mail). The real-time alert via `call_4_help` may
  still fire if `ratio > 1`. Preserve this asymmetry.
- **Spy mail roll**: `call_4_help(send_spy_mail=TRUE)` only sends spy
  intelligence mail when the planet has a `spyowner` set, the
  ratio-based gate has been passed, and either `won == 1` or the 1-in-6
  random check passes (`gernd() % 6 == 0`). All three conditions must
  hold; document this clearly so the test suite covers the gating.
- **Maintenance password equality is exact**: Per the source
  (`!sameas(plptr->password, margv[1])`), comparison is the existing
  case-insensitive `sameas` semantics — not strict byte equality. Apply
  the same comparison rule already used elsewhere in the codebase for
  password and userid comparison.

## Clarifications

### Session 2026-05-07

- Q: Bare `pri` (no args) — list all item prices, or return PRICEFMT usage? → A: List all item prices (FR-014-052 corrected to match `cmd_price` source; PRICEFMT reserved for malformed argument shapes)
- Q: Capture-notification delivery when owner disconnects mid-combat — fall back to mail or silent drop? → A: Silent drop; weaken SC-002 to exclude the disconnect-race window (no mail fallback in that path)
- Q: Exact `call_4_help` invocation matrix? → A: Match source literally. Troop: invoke iff `ratio > 1`, `send_spy_mail = (ratio > 5)`. Fighter: invoke iff `ratio > 1 || won == 1`, `send_spy_mail = (ratio > 5)`. Spy mail roll inside helper: requires `spyowner` set AND (`won == 1 || gernd()%6 == 0`). Rewrote FR-014-028/029, added FR-014-029a.
- Q: `pln` row ordering? → A: Sort by `plnum` ascending, matching original `plnts[]` array iteration in `cmd_pln`.
- Q: Concurrent-attack mutex behavior? → A: Queue (block-and-wait) on the per-planet mutex; second attacker re-runs all preconditions against post-first-attack state on lock acquisition. If first attack captured, second attack rejects via self-attack check (no cargo deduction).

## Requirements *(mandatory)*

### Functional Requirements

#### `att` — Planet Attack

- **FR-014-001**: System MUST require the captain to be in orbit
  (`ship.where >= 10`) before processing any `att` invocation; otherwise
  return the not-in-orbit error.
- **FR-014-002**: System MUST reject `att` if the captain's ship class
  has `max_attk == 0`, returning the ship-cannot-attack-planets error.
- **FR-014-003**: System MUST reject `att` if the orbited planet is a
  wormhole.
- **FR-014-004**: System MUST reject `att` if the orbited planet is
  owned by the captain (self-attack prevention).
- **FR-014-005**: System MUST trigger neutral-zone retaliation if the
  captain attempts `att` while inside the neutral zone (delegate to the
  existing `zaphim` path from features 005/006).
- **FR-014-006**: System MUST require an argument shape of `att <amount>
  <troops|fighters>` (matching the original's `margc == 3` plus
  `genearas("tro"|"fig", margv[2])` parsing). Other shapes return the
  attack-format usage message.
- **FR-014-007**: System MUST reject `att N troops` where `N == 0` or
  `N > attacker's troop cargo`, with the appropriate insufficient-troops
  message; same rule for fighters with the fighter cargo.
- **FR-014-008**: System MUST set `ship.hostile = ship.where` and
  `ship.cantexit = FIRETICKS` before resolving combat (locks the
  attacker in orbit for the duration).
- **FR-014-009**: System MUST deduct the requested attack quantity from
  the attacker's cargo before any combat math.
- **FR-014-010**: For troop attacks, the system MUST process planet
  fighter defensive fire first if `plptr->items[I_FIGHTER].qty > 1`,
  computing kills as `((gernd()%35)+9) * fighters`, capped at `left1`.
- **FR-014-011**: For troop attacks, the system MUST add ground-troop
  kills computed as `(unsigned long)(left2 * (rndm(plattrt1) + 0.25))`
  to `kill1`.
- **FR-014-012**: For troop attacks with `ratio > 2`, the system MUST
  compute attacker kills against defenders as `(unsigned long)(left1 *
  (rndm(plattrt2) + 0.1))`. Otherwise `kill2 = 0`.
- **FR-014-013**: For troop attacks, the system MUST cap `kill1` at
  `left1` and `kill2` at `left2` before applying.
- **FR-014-014**: For troop attacks, when `left2 > 0 && left2 <
  left1/4`, the system MUST mark `won = 1` and emit the dominance
  message.
- **FR-014-015**: For troop attacks, when `left1 > 0 && left1 <
  left2/4`, the system MUST emit the retreat message and add `left1`
  surviving attacker troops to `plptr->items[I_TROOPS].qty` (defectors
  to the defender), then set `left1 = 0`.
- **FR-014-016**: For troop attacks, when `ratio > 2 && left1 >
  left2/2`, the system MUST randomly destroy 0–14 (capped at planet
  quantity) of every non-troop item on the planet and narrate each
  destruction.
- **FR-014-017**: For troop attacks, when `left1 > 0 && left2 <= 0 &&
  plptr->items[I_FIGHTER].qty <= 0`, the system MUST set `won = 1`
  even if the dominance condition (FR-014-014) did not fire.
- **FR-014-018**: For troop attacks, the system MUST return surviving
  attacker troops (`left1`) to the attacker's cargo and persist
  `plptr->items[I_TROOPS].qty = left2`.
- **FR-014-019**: For fighter attacks, the system MUST compute
  `ratio = (left1 / left2) * 100` as floating-point math when
  `left2 > 0`. When `left2 == 0` and the attacker brought fighters, the
  raid is unopposed in the air and `ratio` MUST be treated as maximal;
  `ratio` is 0 only when there is no attack.

  **Superseded 2026-09-01.** This requirement previously mandated
  `ratio = 0` when `left2 == 0`, preserving the spot C's own source marks
  `/* there is a bug here */`. Every consequence of a fighter raid is
  gated on this number, so the strongest possible raid on a planet with
  no fighters destroyed nothing, alerted nobody and sent no mail. See
  docs/DECISIONS.md.
- **FR-014-020**: For fighter attacks, when `left1 > 0 &&
  plptr->items[I_TROOPS].qty > 500 && (gernd() % 5 - 1) > 0`, the
  system MUST add `(unsigned long)(left1 * (rndm(plattrf1) + 0.05))`
  to `kill1` (ground anti-air fire).
- **FR-014-021**: For fighter attacks with `left2 > 0`, defender
  fighters MUST add `(unsigned long)(left2 * (rndm(plattrf2) + 0.2))`
  to `kill1`.
- **FR-014-022**: For fighter attacks with `left2 > 0 && ratio > 1`,
  attackers MUST inflict `kill2 = (unsigned long)(left1 *
  (rndm(plattrf3) + 0.2))` on defender fighters; otherwise
  `kill2 = 0`.
- **FR-014-023**: For fighter attacks with `ratio > 5`, the system
  MUST randomly destroy 0–14 (capped) of each non-fighter item on the
  planet.
- **FR-014-024**: For fighter attacks, when `left1 > 0 && left2 <= 0
  && plptr->items[I_TROOPS].qty < 5`, the system MUST set `won = 1`
  and emit the fighter-victory message.
- **FR-014-025**: For fighter attacks, the system MUST return
  surviving attacker fighters (`left1`) to the attacker's cargo and
  persist `plptr->items[I_FIGHTER].qty = left2`.
- **FR-014-026**: On `won == 1`, the system MUST execute the
  ownership-transfer step: set `plptr->userid = attacker.userid`,
  reset `attacker.hostile = 0`, and increment `attacker.planets` (the
  `WARUSR.planets` counter).
- **FR-014-027**: After every `att` resolution, the system MUST flush
  the mutated planet state to the database under the per-planet
  mutex established in feature 005 (`PlanetStateService`).
- **FR-014-028**: For troop attacks, the system MUST invoke
  `call_4_help` if and only if `ratio > 1`. The `send_spy_mail`
  argument MUST be `true` if `ratio > 5`, otherwise `false`. When
  `ratio <= 1`, neither a real-time alert nor a spy-mail roll fires.
- **FR-014-029**: For fighter attacks, the system MUST invoke
  `call_4_help` if and only if `ratio > 1 || won == 1`. The
  `send_spy_mail` argument MUST be `true` if `ratio > 5`, otherwise
  `false`. When the trigger condition is not met, neither a real-time
  alert nor a spy-mail roll fires.
- **FR-014-029a**: Inside `call_4_help`, the real-time alert MUST fire
  when the owner is online at the moment of the call (subject to the
  documented disconnect-race silent-drop). When `send_spy_mail = true`
  AND `plptr->spyowner` is set, a spy intelligence mail MUST be queued
  if `won == 1` OR (`won == 0 && gernd() % 6 == 0`). Spy mail is
  independent of the real-time alert — both, either, or neither may
  fire depending on owner online state and the spy-mail roll.
- **FR-014-030**: For troop attacks with `ratio > 1`, the system
  MUST queue a planet-distress mail to the planet owner with type
  `MESG02` (lost defenders) or `MESG03` (lost the planet, on win).
- **FR-014-031**: For fighter attacks with `ratio > 2 || won == 1`,
  the system MUST queue a planet-distress mail to the planet owner
  with type `MESG04` (lost fighters) or `MESG05` (lost the planet,
  on win).
- **FR-014-032**: Distress mail MUST carry `MAIL_CLASS_DISTRESS`,
  the planet name, sector x/y, the attack quantity, the attacker's
  ship name, and the attacker's userid (matching the original mail
  fields).

#### `pln` — List Owned Planets

- **FR-014-040**: System MUST return every planet whose `userid`
  matches the calling captain's userid, displaying name, xsect, ysect,
  and plnum per row, sorted by `plnum` ascending (matching the
  original `plnts[]` array iteration order in `cmd_pln`).
- **FR-014-041**: System MUST return the empty-state message when the
  captain owns zero planets.
- **FR-014-042**: `pln` MUST NOT mutate any state.

#### `pri` — Show Prices

- **FR-014-050**: System MUST require the captain to be in orbit;
  otherwise return the not-in-orbit error (`BUY1` message in the
  original).
- **FR-014-051**: For `pri N <item>`, system MUST report the total cost
  of buying N of the named item: `baseprice × N` if the captain owns
  the planet, `markup2a × N` otherwise. No cash is deducted and no
  inventory transfers occur.
- **FR-014-052**: For bare `pri` with no arguments, system MUST list
  the price of every item at the orbited planet (iterating `kwrd[]`
  and emitting one PRICE1 line per sellable item), matching the
  original `cmd_price` no-args loop in GECMDS.C. The PRICEFMT usage
  message is reserved for malformed argument shapes such as `pri N`
  with no item or `pri <item>` with no amount.
- **FR-014-053**: System MUST run `pri N <item>` through the full buy
  precondition ladder: (a) planet has an owner — BUY7 if not;
  (b) amount > 0 — BUY5 if not; (c) captain is owner OR item sell flag
  is `'Y'` — BUY4 if not; (d) cargo capacity sufficient — BUY8 if not;
  (e) available stock (qty minus reserve for foreign callers) >=
  requested amount — BUY3 if not; (f) captain has sufficient cash —
  BUY2 if not. Only when all six pass is the PRICE1 quote emitted.

#### `mai` — Maintenance Password Gate (FR-210 closure)

- **FR-014-060**: When the orbited planet's password is not the
  literal `"none"` AND the captain provided no argument
  (`margc < 2`), system MUST return the password-required error
  (`MAINT2`) without performing maintenance or charging cash.
- **FR-014-061**: When the orbited planet's password is not the
  literal `"none"` AND the supplied argument does not match the
  password (using the existing case-insensitive `sameas` comparison),
  system MUST return the incorrect-password error (`MAINT3`) without
  performing maintenance or charging cash.
- **FR-014-062**: When the orbited planet's password is the literal
  `"none"`, the password gate MUST be bypassed regardless of whether
  an argument was supplied.
- **FR-014-063**: When the password gate passes, the existing
  feature-013 maintenance flow (price computation, cash debit, hull/
  shield/energy restoration, `cantexit` check, neutral-zone discount)
  MUST run unchanged.

### Combat Constants (DI tokens, fidelity-required)

The following constants from `GEMAIN.H` MUST be exposed as DI tokens
following the `CLOAK_ENERGY_USE` pattern from feature 013, so balance
tests can override them:

- `PLATTRT1` — troop ground-kill base (defender troop kill ratio)
- `PLATTRT2` — troop counter-kill base (attacker losses to defenders)
- `PLATTRF1` — fighter ground-anti-air base
- `PLATTRF2` — fighter defender-fighter kill base
- `PLATTRF3` — fighter attacker counter-kill base
- `FIRETICKS` — duration of `cantexit` lock after firing/attacking

Default values MUST match `GEMAIN.H`. A balance regression test MUST
fail if any default changes without an explicit code update.

### Key Entities *(include if feature involves data)*

- **Planet (existing)**: `userid` (owner) is the field mutated by
  `wonplnt`; `items[]` per-item `qty`, `sell`, `reserve`, `markup2a`,
  and `sold2a` are read by `pri` and mutated by `att`. `spyowner` is
  read by `call_4_help` to gate spy mail. `password` is read by `mai`
  to gate repairs. `name`, `xsect`, `ysect`, `plnum` are read by
  `pln`. No new fields required — schema is unchanged from feature 005.
- **Ship (existing)**: `where`, `userid`, `shpclass`, `hostile`,
  `cantexit`, `coord`, `items[I_TROOPS]`, `items[I_FIGHTER]`,
  `shipname` are all read or written. No new fields.
- **WarUser (existing)**: `planets` counter is incremented on
  successful capture. No new fields.
- **Mail (existing)**: Reused for `MESG02/03/04/05` distress messages
  and for spy intelligence reports. No new fields — distress class is
  `MAIL_CLASS_DISTRESS` (already defined in feature 005 schema).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The `att` handler (preconditions + combat math + mutex
  acquire + planet flush) completes in under 50 ms on the server,
  measured from command dispatch to CommandResult return, asserted in
  `attack-troop-math.spec.ts` and `attack-fighter-math.spec.ts` using
  `performance.now()` bracketing.
- **SC-002**: When a planet is captured, the former owner receives a
  notification — real-time alert if online and connected through
  resolution, distress mail if offline at resolution time. Captures
  where the owner is online at the start of `call_4_help` but
  disconnects before the alert is emitted produce zero notifications
  (documented disconnect-race; no mail fallback in that path).
- **SC-003**: Every `att` invocation produces exactly one persisted
  planet-state write (success or failure), verifiable by a database
  audit run after the test suite.
- **SC-004**: The full combat math implementation passes a
  byte-for-byte trace test against the original C source for a
  deterministic seed: given the same `gernd` sequence, attacker
  quantity, and starting planet state, the post-combat numbers (kills
  on each side, surviving attackers, surviving defenders, items
  destroyed, won/lost outcome) match the reference C implementation
  exactly.
- **SC-005**: `pln` returns results in under 200 ms for a captain
  owning up to 50 planets in a galaxy of 500 planets.
- **SC-006**: `pri N <item>` returns the correct price (`baseprice` for
  owner, `markup2a` for foreign) and the correct rejection message for
  all eight precondition-failure paths in 100% of test cases.
- **SC-007**: A captain attempting `mai` on a passworded planet
  without the correct password sees zero cash deduction in 100% of
  attempts; balance is unchanged before and after the rejected call.
- **SC-008**: The fidelity-flagged `attack_fig()` ratio bug is
  preserved: a regression test asserting the bugged behavior (ratio
  goes to 0 when defenders had no fighters, skipping the
  ground-fire and item-destruction branches) passes in CI.
- **SC-009**: 100% of `att` resolutions correctly update the
  attacker's `WARUSR.planets` counter (incremented by exactly 1 on
  win, unchanged on loss).

## Assumptions

- The PlanetStateService per-planet mutex established in feature 005
  is reused without modification for the per-attack flush.
- The `user:${userid}` Socket.io room established in feature 012 is
  the channel for the real-time owner alert (`call_4_help`'s online
  branch). No new room types are introduced.
- The `MailStat` write path used by the midnight job (feature 009) is
  reused for distress and spy mail. No new mail subsystem is built.
- The `gernd()` randomness source from feature 006 is reused. The
  `rndm(N)` helper (uniform `[0, N)`) is also assumed available; if
  not, it is trivial to add and considered part of this feature.
- Item indices `I_TROOPS`, `I_FIGHTER`, `I_MEN` are the same constants
  introduced in feature 005's planet system. No re-indexing.
- The `kwrd[]` keyword table used by `pri` parsing for item-name
  matching is the same one wired up in feature 005 for `buy`/`sell`.
- `PLTYPE_WORM` (wormhole planet type) is already represented in the
  Prisma schema; the `att` rejection check reuses that flag.
- `genearas` (case-insensitive prefix match), `sameas` (case-
  insensitive equality) are existing helpers from feature 003's
  command parsing layer.
- The `outprfge` print/flush pattern is the existing event-emit path
  used by every command since feature 003. No transport changes.
- `adm` (planet administration menu), `spy` deployment, planet
  revolt, and any change to `orb` are explicitly out of scope.
- The `attack_fig()` ratio-zero bug is intentional fidelity, not a
  defect, and MUST be preserved with a test that fails if it is
  "fixed."
- The `MAIL_CLASS_DISTRESS` mail class already routes correctly to
  the recipient's inbox per feature 009; no special handling.
- Ship-class `max_attk` capability is an existing Prisma field on
  the ShipClass record from feature 002.
