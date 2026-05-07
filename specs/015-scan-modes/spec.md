# Feature Specification: Scan Modes & Display Options

**Feature Branch**: `015-scan-modes`
**Created**: 2026-05-07
**Status**: Draft
**Input**: User description: "Scan modes & display options — sca ra, sca se, sca lo full, and per-user SCANNAMES / SCANHOME display options"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Range radar scan (Priority: P1)

A captain in deep space wants to see all detectable ships and mines centered on their own position, with the ability to zoom in or out so they can either survey the surrounding area or focus on nearby contacts.

**Why this priority**: Range radar is the primary tactical awareness tool when a ship is far from any sector edge. Without zoom-able awareness, players cannot judge whether to engage, evade, or pursue contacts that fall outside the current sector.

**Independent Test**: Issue `sca ra 1` through `sca ra 9` from a populated area; verify a 30×15 ASCII grid is returned, the player ship appears as `*` at the center, ships are lettered by ascending distance (A nearest, then B, C…), live mines appear as `.`, and the effective range expands monotonically as the zoom level increases (level 1 = scanrange/81, level 9 = scanrange) per the formula in FR-002.

**Acceptance Scenarios**:

1. **Given** the captain is in flight with several ships and mines within their ship class scan range, **When** they type `sca ra 1`, **Then** the system returns a 30×15 grid with `*` at the center cell, each detected ship plotted with a unique letter assigned by ascending distance, each live mine plotted as `.`, and a header reporting the effective range and current sector.
2. **Given** the captain has detected ships visible at zoom level 9 (full scanrange window), **When** they re-issue `sca ra 1`, **Then** the same ships are replotted using a much smaller effective range window (scanrange/81) so closer ships fill more of the grid and distant ships drop off the edges.
3. **Given** a captain types `sca ra 0` or `sca ra 10` (out of range) or `sca ra` with no level, **When** the command runs, **Then** the system either rejects with the documented usage hint or treats the level as the default (1), matching original behaviour, without producing an empty or corrupt grid.
4. **Given** a captain has the SCANHOME display option enabled, **When** they issue `sca ra 3`, **Then** the rendered output is positioned consistently for terminal redraw (cursor-home behaviour) rather than appended below previous output.

---

### User Story 2 - Sector radar scan (Priority: P2)

A captain wants a high-resolution view of just the sector they are in, showing every ship, mine, and planet in that sector with type-based colour coding so they can quickly identify friend vs. foe and orbit-able targets.

**Why this priority**: Sector radar is the close-quarters tactical view used during combat, mine fields, and planet approach. It is depended on whenever the captain is fighting, evading, or maneuvering for orbit, but it is only useful once the player is already inside an interesting sector — so it ranks below long-range awareness.

**Independent Test**: Position the player ship in a sector that contains another player, an AI ship, a planet, and a mine; issue `sca se`; verify the grid shows the player as `*`, the other player ship and the AI ship using letters with distinct colour codes, the planet as a digit `1`–`9`, and the mine as `.`.

**Acceptance Scenarios**:

1. **Given** the captain is in a sector that contains other ships, mines, and at least one planet, **When** they issue `sca se`, **Then** the system returns a 30×15 grid limited to the current sector: the player ship as `*`, other ships lettered by distance, AI/Cybertron/Droid ships colour-coded distinctly from human players, mines as `.`, and planets as their numeric index `1`–`9`.
2. **Given** the captain is in an empty sector, **When** they issue `sca se`, **Then** the system returns the grid with only `*` at the player position and no other markers, plus the sector coordinates in the header.
3. **Given** the captain has SCANHOME enabled, **When** they issue `sca se`, **Then** the output is rendered with cursor-home positioning so consecutive scans overwrite the same screen region.

---

### User Story 3 - Extended local scan & display options (Priority: P3)

A captain wants a long-form local scan that includes a side panel listing each detected ship's letter, distance, bearing, heading, and speed, and they want to toggle two personal display preferences (`SCANNAMES`, `SCANHOME`) that persist across sessions.

**Why this priority**: The existing `sca lo` already returns a basic local map (delivered in feature 003/004). Extending it with the side-panel ("full") layout and persisting the SCANNAMES / SCANHOME preferences is a quality-of-life refinement, not core combat capability.

**Independent Test**: Set SCANNAMES on; issue `sca lo full`; verify the right-hand side of each row shows letter / distance / bearing / heading / speed for each detected ship and that ship names appear on a second row beneath each entry. Toggle SCANNAMES off via `set scannames off`; re-issue `sca lo full`; confirm the name lines disappear and the option survives logout/login.

**Acceptance Scenarios**:

1. **Given** several ships are within the captain's ship class scan range, **When** the captain issues `sca lo full`, **Then** the system returns the local-scan grid with a side panel listing detected ships row-by-row showing letter, distance, bearing, heading, and speed per the original layout.
2. **Given** SCANNAMES is on, **When** `sca lo full` renders, **Then** each ship's name is printed on its own line directly below that ship's row in the side panel; **And** when SCANNAMES is off, the name lines are suppressed and rows pack tightly.
3. **Given** the captain types `set ?`, **When** the command runs, **Then** the system lists every supported option (at minimum: `scannames`, `scanhome`, plus existing options like `autoshield`/`autorepair`) along with each option's current ON/OFF state.
4. **Given** the captain types `set scanhome on`, logs out, and logs back in, **When** they type `set ?`, **Then** SCANHOME is reported as ON, confirming the preference is persisted to the player record.
5. **Given** the captain types `set scannames bogus`, **When** the command runs, **Then** the system returns the documented usage hint without changing the stored value.

---

### Edge Cases

- **Out-of-range zoom level**: `sca ra 0`, `sca ra 10`, `sca ra abc`, `sca ra` (missing) — system must coerce or reject deterministically (matching original: invalid level falls back to 1).
- **Two ships on the same grid cell**: When two contacts map to the same grid cell, deterministic last-write-wins per the original ordering (ships plotted after mines, distance order within ships).
- **Mine and ship in the same cell**: The ship plot replaces the mine plot.
- **Captain ship at exact grid centre**: `*` always overwrites whatever else might land on the centre cell.
- **Out-of-galaxy or non-flight state**: Scans issued while not in flight (e.g., docked, dead) must return a sensible "cannot scan" message rather than an empty grid.
- **More than 26 detected ships**: Only the 26 nearest receive letters (alphabet exhausted); behavior must match original.
- **Empty sector for `sca se`**: Returns grid with only `*` and the sector header.
- **Setting an unknown option name** (`set frobnicate on`): Returns usage hint, does not silently create new options.
- **SCANHOME on a non-ANSI client**: Cursor-home escape must degrade gracefully so the output is at worst noisy, never broken.

## Clarifications

### Session 2026-05-07

- Q: Color channel categories for `sca se` (the parallel `mapc` grid) — how many distinct codes? → A: Four categories — `self`, `human-player`, `AI`, `planet`. Mines remain uncolored (the `.` glyph is unambiguous). This extends the original two-code scheme (`AI` vs everything-else) but adds zero backend cost and improves UI readability.
- Q: Should `sca ra` also populate a colour channel? → A: Yes, but with three categories only — `self`, `human-player`, `AI`. Planets do not appear on `sca ra`, so the planet category is omitted. Mines remain uncoloured. Keeps the gateway payload consistent with `sca se` without dead weight.
- Q: `sca lo full` — the original `scan_lo()` parses the `full` argument but ignores it, plots ships as `+`/`=` (no letters), and never renders a side panel. How do we reconcile this with the spec? → A: Deliberate deviation from the original. `sca lo` and `sca lo full` MUST use scantab letters consistent with `sca ra`/`sca se` (the `+`/`=` plot is a BBS-era limitation, not a design virtue). `sca lo full` MUST render the side panel as specified. This is the only way FR-012's "shared scan table across all three scans" is meaningful.
- Q: Side-panel field formatting for `sca lo full` (drives SC-004 fixture matching)? → A: Match the original `scan_sh` style — integer distance (parsecs), integer bearing and heading (degrees, 0–359), and the existing `showarp()` formatter for speed (warp string with one decimal, or `Impulse`/`Stopped`). Reuses formatting shipped in feature 003 for `sca sh`, so fixtures stay stable.
- Q: Zoom-level direction for `sca ra` — User Story 1 acceptance scenario #2 said `sca ra 9` produces a "much smaller window," which contradicts the formula and the C source. Which is right? → A: The formula is correct (it matches `scan_ra()` line 2510). `sca ra 1` is the most zoomed-IN view (window = scanrange/81; closer ships fill the grid), and `sca ra 9` is the most zoomed-OUT view (window = scanrange; everything in scanrange is visible). The narrative in Acceptance Scenario #2 has been corrected accordingly.
- Q: SCANHOME concrete behaviour on the web client (the original ANSI cursor-home sequence has no direct web equivalent)? → A: The gateway emits a dedicated `scan:render` socket event whose payload includes a `mode` field — `"overwrite"` when SCANHOME is on for that player, `"append"` when off. The React frontend mounts a dedicated scan panel that replaces its content on `mode: "overwrite"` and appends a new scan card on `mode: "append"`. The text-grid and colour-grid payload itself is identical regardless of mode.
- Q: Scantab lifecycle — when is the per-player letter-assignment table initialised and when is it cleared? → A: **Initialised lazily** on the first scan command after the player enters flight (an empty scantab returns no letters until `update_scantab` runs). **Cleared** on any of: (i) player disconnect, (ii) ship destruction / death, (iii) docking back to base or otherwise leaving the game. This matches the C source's *effective* behaviour while preventing a new occupant of the same `shipId` slot from inheriting the previous player's letter assignments.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a `sca ra <level>` command where `<level>` is an integer 1–9. Invalid or missing levels MUST coerce to level 1 (matching original behavior).
- **FR-002**: `sca ra` MUST render a 30×15 ASCII grid centered on the player's ship, using the formula `effective_range = ship_class_scan_range / ((10 - level)^2)` to determine the window covered by the grid.
- **FR-003**: `sca ra` MUST plot the player's ship as `*` at the centre cell, plot each detected ship using a letter A–Z assigned in ascending distance order, plot each live mine as `.`, and report the effective range plus current sector in a header. The parallel colour channel MUST be populated with three category codes — `self`, `human-player`, `AI` — for ship cells; mines and empty cells receive no colour code.
- **FR-004**: System MUST provide a `sca se` command that renders a 30×15 grid bounded to the player's current sector. The grid MUST plot the player ship as `*`, other ships as their distance-ordered letters, mines as `.`, and planets as their numeric index `1`–`9`.
- **FR-005**: `sca se` MUST populate the parallel colour-channel grid (`mapc`) with exactly four category codes: `self` (the captain's own `*`), `human-player`, `AI` (Cybertrons, Droids — `GESTAT_AUTO`), and `planet`. Mines are not colour-coded; their `.` glyph is unambiguous.
- **FR-006**: System MUST extend the existing local-scan command to accept the `full` modifier (`sca lo full`), producing a side panel that lists each detected ship's letter, distance, bearing, heading, and speed on a row-per-ship basis, aligned to the grid. Field formatting MUST match the original `scan_sh` style: integer distance in parsecs, integer bearing and heading in degrees (0–359), and speed rendered via the existing `showarp()` formatter (warp number with one decimal, or `Impulse`/`Stopped`).
- **FR-007**: When the player option SCANNAMES is on, `sca lo full` MUST emit each detected ship's display name on its own line directly beneath the ship's stat row in the side panel. When off, the side panel MUST suppress name rows.
- **FR-008**: System MUST persist per-player display options including at minimum `scannames` and `scanhome`, alongside any options already managed (e.g., `autoshield`, `autorepair`). Options MUST survive logout and reload.
- **FR-009**: System MUST extend the `set` command so that `set <option> on|off` toggles the named option and `set ?` lists every supported option with its current ON/OFF state. Unknown option names or malformed arguments MUST return the documented usage hint without modifying state.
- **FR-010**: All scan commands (`sca ra`, `sca se`, `sca lo`/`sca lo full`) MUST be delivered to the client via a dedicated `scan:render` socket event whose payload carries a `mode` field. When SCANHOME is on for the issuing player, `mode = "overwrite"`; when off, `mode = "append"`. The React scan panel replaces its current content on `overwrite` and appends a new entry on `append`. The text-grid and colour-grid payload is mode-independent.
- **FR-014**: The per-player scan table (scantab) MUST be initialised lazily on the first scan command after the player enters flight, and MUST be cleared on player disconnect, ship destruction, and docking/leaving the game. Cleared scantab state MUST NOT leak to a new player who reuses the same ship slot.
- **FR-011**: All three scans MUST fail gracefully (with a player-readable message) when issued in a state where scanning is not permitted (e.g., not in flight).
- **FR-012**: The shared "scan table" of detected ships and their assigned letters MUST be updated consistently across `sca ra`, `sca se`, and `sca lo` so that a given other ship retains the same letter across consecutive scans within the same session, matching the original behaviour.
- **FR-013**: All scan output MUST be deliverable through the existing socket gateway / event log channel used by other ship commands, so a connected client receives the rendered grid synchronously with command acknowledgement.

### Key Entities *(include if feature involves data)*

- **Player display options**: A small per-player record of boolean preferences (`scannames`, `scanhome`, plus existing `autoshield` / `autorepair`). Persisted with the player so they survive disconnects.
- **Scan table entry**: An in-memory mapping of `{ otherShipId → assignedLetter, lastKnownDistance, lastKnownBearing, lastKnownHeading, lastKnownSpeed, isStillVisible }` maintained per player; updated each time a scan command runs.
- **Rendered scan grid**: A 30×15 character grid plus a parallel colour-channel grid (used by `sca se` to encode AI vs. player vs. planet colour categories) that the front-end maps to actual colours.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A captain can issue `sca ra 1` through `sca ra 9` and observe the effective range widening monotonically as the level increases (level 1 = scanrange/81, level 9 = scanrange), verified by automated tests across all nine levels.
- **SC-002**: With three other ships placed at known coordinates, `sca ra` returns a grid where each ship's letter cell maps to within ±1 grid cell of the algebraically-expected position, for every zoom level 1–9.
- **SC-003**: `sca se` correctly renders a grid containing each combination of player ship, AI ship, mine, and planet, with the colour channel populated as expected, in 100% of automated scenario tests.
- **SC-004**: `sca lo full` with SCANNAMES on produces side-panel output whose row count and content (letter, distance, bearing, heading, speed, optional name line) matches a fixture for at least three populated test scenarios.
- **SC-005**: `set scannames on` followed by player logout/login preserves the value, verified by an integration test that reloads the player from the durable store and re-checks the option.
- **SC-006**: Issuing any of the three scan commands while in an invalid state (not in flight, dead, etc.) returns a user-readable error and never returns a partially-rendered grid, verified across all invalid states.
- **SC-007**: Existing `sca lo` behaviour delivered in feature 003/004 is not regressed: every previously-passing scan test for `sca lo` continues to pass after this feature lands.

## Assumptions

- The existing `ScanHandlerService` from features 003/004 will be extended (not replaced) to add the `ra`, `se`, and `lo full` modes — the dispatcher and grid rendering helper(s) are reused.
- `sca lo` will be migrated from the original `+`/`=` plot symbols to scantab letters (matching `sca ra`/`sca se`), and the existing 003/004 `sca lo` tests will be updated accordingly. SC-007's "no regression" applies to *behavior intent* (range, sector header, fail-on-invalid-state), not to the literal plot characters, which deliberately change.
- "Letters by distance" follows the original behaviour: A is the nearest detected ship, then B, C… If the same ship is detected on consecutive scans, it keeps its previous letter when slots permit, matching the original `update_scantab` logic.
- Player display options are stored on the existing User record. The two new flags (`scannames`, `scanhome`) are persisted in the existing `User.options Int[]` array at indices 0 and 1 respectively, mirroring the canonical `GEMAIN.H:233-234` constants (`SCANNAMES=0`, `SCANHOME=1`). The previously-shipped `autoShield` / `autoRepair` flags live as separate direct boolean fields on the same User row (not in `options[]`) — this split is intentional and is documented in `data-model.md` §2. `User.options[]` is otherwise empty as of this feature, so indices 0 and 1 are free; no collision exists. No new entity is introduced and no schema migration is required.
- The original options `scanfull` and `filter` exist in the source-code option list but are out of scope for this feature; they may be defined as no-op stubs to preserve the option-list shape, but they will not change rendering behaviour.
- Front-end colour rendering for `sca se` is delivered through a parallel character-grid colour channel that the React UI already consumes; this feature populates that channel for sector scans but does not redesign it.
- SCANHOME is implemented at the socket-event layer, not via raw ANSI. The gateway emits a `scan:render` event with `mode: "overwrite" | "append"`; the React client renders into a dedicated scan panel. No ANSI cursor-home byte stream is ever sent to the browser — the original terminal-control approach is replaced wholesale by the typed event contract.
- Mines rendering for `sca ra` and `sca se` assumes the mine layer (delivered in feature 006b) is the source of truth for live-mine positions. No changes to the mine model are required.
- Planet plotting in `sca se` reuses planet location data already maintained by the planet system (feature 005); no schema change is required.
