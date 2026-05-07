# Quickstart — Scan Modes & Display Options

A manual smoke test exercising the three new scan modes and the two new display options end-to-end. Run after `/speckit-implement` completes.

## Prerequisites

- Backend running: `docker compose up backend postgres`
- Frontend running: `cd frontend && npm run dev`
- A test account logged in and spawned into flight (ship class with `scanrange` of at least 25,000)
- At least one other ship — e.g. a Murdonian Transport (droid class 11) or a second player session — within scan range
- At least one planet in the player's current sector (use the dev seed if running fresh)

## 1. Range scan with zoom (FR-001 / FR-002 / FR-003)

```
sca ra 1
sca ra 5
sca ra 9
```

**Expected**:
- Each command renders a 30×15 grid with `*` at the centre.
- Detected ships appear as letters A, B, C… in ascending distance order.
- Live mines (if any in range) appear as `.`.
- Header reports the effective range and the player's current sector.
- The effective range grows monotonically: `sca ra 9` shows the widest area; `sca ra 1` the tightest.
- Same ship retains the same letter across the three scans (scantab stickiness).
- The colour channel marks the player as `self`, human ships as `human`, and AI/droids as `ai`. Mines have no colour.

## 2. Sector scan (FR-004 / FR-005)

```
sca se
```

**Expected**:
- Grid bounded to the current sector — only ships, mines, and planets in this sector appear.
- Player ship as `*`, other ships as letters, planets as digits `1`..`9`, mines as `.`.
- Colour channel includes a fourth category: `planet` for planet cells.

## 3. Local scan with side panel (FR-006 / FR-007)

```
sca lo
sca lo full
set scannames on
sca lo full
set scannames off
sca lo full
```

**Expected**:
- `sca lo` — grid uses scantab letters (not `+`/`=`); same letters as `sca ra`/`sca se` for the same ships.
- `sca lo full` — adds a right-hand side panel listing each detected ship's letter, distance (integer parsecs), bearing (0–359), heading (0–359), and speed (`Warp X.X` / `Impulse` / `Stopped`).
- After `set scannames on`, the side panel includes a second line under each ship row showing the ship's display name.
- After `set scannames off`, the name line disappears.

## 4. SCANHOME mode (FR-010)

```
set scanhome off
sca ra 5
sca ra 5
set scanhome on
sca ra 5
sca ra 5
```

**Expected**:
- With SCANHOME off: each `sca ra 5` appends a new card below the previous one in the scan panel (`mode: "append"` on the wire).
- With SCANHOME on: each `sca ra 5` replaces the panel contents in-place (`mode: "overwrite"`).
- Inspect the network tab — every scan command emits a `scan:render` event with `mode` reflecting the SCANHOME state.

## 5. Option persistence (FR-008 / SC-005)

```
set scanhome on
set scannames on
```

Then **log out** and **log back in**.

```
set ?
```

**Expected**:
- `set ?` reports `scanhome: ON` and `scannames: ON` after re-login.
- `User.options` array in the DB reflects `[1, 1, 0, 0, …]`.

## 6. `set ?` listing (FR-009)

```
set ?
```

**Expected**: A single info line listing every supported option with its current ON/OFF state, including at minimum `auto-shield`, `auto-repair`, `scannames`, `scanhome`.

## 7. Failure modes (FR-011 / SC-006)

While docked at a starbase or after death:

```
sca ra 5
sca se
sca lo full
```

**Expected**: Each command returns a user-readable error message (`category: 'system'`). **No `scan:render` event is emitted.** The frontend scan panel does not change.

## 8. Edge cases

```
sca ra 0
sca ra 10
sca ra abc
sca ra
set frobnicate on
set scannames bogus
```

**Expected**:
- `sca ra 0`, `sca ra 10`, `sca ra abc`, `sca ra` (missing) all coerce to level 1 and render.
- `set frobnicate on` returns the `set` usage hint without touching state.
- `set scannames bogus` returns the `set` usage hint; `scannames` value is unchanged.
