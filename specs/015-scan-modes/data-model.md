# Data Model — Scan Modes & Display Options

## Overview

This feature introduces no new persistent entities. It adds an in-memory per-player **scantab**, formalises the existing `User.options Int[]` field's index map, and defines the `ScanRenderEvent` wire payload.

## Entities

### 1. Scantab (in-memory)

Per-player table of detected ships and their assigned grid letters. Lives on the `ScanHandlerService` singleton; not persisted.

**Key**: `${userid}#${shipno}` (string)

**Value**: `ScantabEntry[]` of length up to 26 (NOSCANTAB widened — see research D2).

```ts
interface ScantabEntry {
  /** Other ship's identity. Composite of WARSHP.userid + WARSHP.shipno. */
  shipKey: string;          // `${userid}#${shipno}`
  /** Distance in parsecs × 10000 (matches C `ddistance` units, GECMDS.C:2822). */
  dist: number;
  /** Sticky letter assignment — A..Z. Persists across consecutive scans within a session. */
  letter: string;
  /** Last computed bearing 0..359 (degrees). */
  bearing: number;
  /** Last computed heading 0..359 (degrees). */
  heading: number;
  /** Other ship's current speed (raw — pass to showarp() for display). */
  speed: number;
  /** True after update_scantab keeps this entry; false slots are unused. */
  flag: 0 | 1;
}
```

**Lifecycle** (research D5):
- **Init**: Lazy on first scan command after the player enters flight.
- **Clear**: On socket disconnect, ship destruction, dock-back-to-base.
- **Update**: Every `sca ra`, `sca se`, `sca lo` re-runs `buildScantab()`. The sort order is *ascending distance*; existing letter assignments stick to the same `shipKey` if that ship is still in range.

**Validation rules**:
- `letter` ∈ A..Z, unique within the table.
- `flag === 1` entries are sorted by `dist` ascending.
- Cloaked ships (`cloak >= 10`, `GECMDS.C:2824`) are excluded.
- Self is never an entry.

---

### 2. User.options index map (existing field, formalised)

The Prisma model `User.options Int[]` already exists. This feature commits to the index assignments below, mirroring `GEMAIN.H:233-238`:

| Index | Constant     | Meaning                              | Used by feature |
|-------|--------------|--------------------------------------|-----------------|
| 0     | `SCANNAMES`  | Show ship names in `sca lo full`     | 015 (this)      |
| 1     | `SCANHOME`   | Cursor-home / overwrite scan output  | 015 (this)      |
| 2     | `SCANFULL`   | (Original full-map flag — no-op)     | 015 stub only   |
| 3     | `MSG_FILTER` | Mail filter (out of scope)           | future          |
| 4     | `DUMMY1`     | Reserved                             | —               |
| 5     | `DUMMY2`     | Reserved                             | —               |

**Encoding**: 0 = OFF, 1 = ON. Default for all is 0 on user creation.

**Storage scope note**: `autoShield` / `autoRepair` (delivered earlier) are **not** stored in `User.options[]` — they live as separate direct boolean fields on the User row and are mirrored 1:1 onto `ShipState.autoShield` / `ShipState.autoRepair`. This deliberate split means the `User.options[]` index space (verified empty as of feature 015) is reserved for the C-source-canonical option flags from `GEMAIN.H:233-238`, and there is **no collision risk** when this feature claims indices 0 and 1. Future option work that maps to a `GEMAIN.H` constant SHOULD use `User.options[]`; new options without a C-source counterpart MAY use direct fields like `autoShield` did.

**Cache**: The two scan-relevant flags are read once per session and cached on `ShipState` as **non-optional** booleans (default `false` on hydration):

```ts
interface ShipState {
  // existing fields…
  scanNames: boolean;   // mirror of User.options[0] — SCANNAMES (GEMAIN.H:233)
  scanHome:  boolean;   // mirror of User.options[1] — SCANHOME  (GEMAIN.H:234)
}
```

The cache is populated on `ShipStateService.hydrate()` (login), refreshed on every successful `set scannames|scanhome on|off`, and discarded on disconnect alongside the rest of `ShipState`. The authoritative store remains `User.options[]`; the cache exists only to keep the scan-handler hot path off the database.

---

### 3. ScanRenderEvent (wire payload)

Emitted on the `scan:render` socket event. See `contracts/scan-render.md` for the full contract.

```ts
interface ScanRenderEvent {
  /** Which scan produced this. Drives header text and any mode-specific UI. */
  kind: 'ra' | 'se' | 'lo' | 'lo-full';
  /** SCANHOME-driven render mode. */
  mode: 'overwrite' | 'append';
  /** 30×15 character grid + colour. Sparse — only non-empty cells listed. */
  cells: ScanCell[];
  /** Header text (e.g. "Range: 4500 — Sector 12,7"). Pre-rendered server-side. */
  header: string;
  /** Side panel rows — present only on kind === 'lo-full'. */
  sidePanel?: SidePanelRow[];
}

interface ScanCell {
  x: number;                                    // 0..29
  y: number;                                    // 0..14
  type: 'ship' | 'planet' | 'mine' | 'self' | 'wormhole';
  char: string;                                 // 'A'..'Z' | '1'..'9' | '.' | '*' | 'W'
  colour?: 'self' | 'human' | 'ai' | 'planet';  // omitted for mines / empty
}

interface SidePanelRow {
  letter: string;       // 'A'..'Z'
  distance: number;     // integer parsecs
  bearing: number;      // 0..359
  heading: number;      // 0..359
  speedDisplay: string; // 'Warp 4.5' | 'Impulse' | 'Stopped' (showarp output)
  name?: string;        // present iff SCANNAMES on
}
```

---

## State transitions

### Scantab transitions

```
[empty] ──first sca command──▶ [populated]
[populated] ──any sca command──▶ [populated, refreshed]
[populated] ──disconnect / death / dock──▶ [cleared]
```

### Display option transitions

```
[OFF=0] ──set <opt> on──▶ [ON=1]   // updates User.options[i] + ShipState cache
[ON=1]  ──set <opt> off──▶ [OFF=0] // updates User.options[i] + ShipState cache
[ON|OFF] ──set <opt> bogus──▶ [unchanged] + usage hint
```

---

## Constraints & invariants

- **Letter uniqueness**: Within a single scantab snapshot, no two `flag=1` entries share a letter.
- **Letter stickiness**: If `shipKey` X had letter `C` on scan N and is still in range on scan N+1, X retains `C` on N+1. New ships fill empty letter slots (A..Z, in order of first appearance within the new-ship subset).
- **Self exclusion**: The player's own ship is never in the scantab and is rendered as `*` at the grid centre regardless of cell collisions.
- **Cell collision precedence**: Self > Ship > Planet > Mine > Wormhole. Last writer in this order wins for any single `(x,y)` cell.
- **Out-of-range zoom**: `sca ra <level>` with `level ∉ {1..9}` coerces to 1 (matches C `GECMDS.C:2505`).
- **Invalid state**: Any scan issued while not in flight returns a single `command:result` line with `category: 'system'` and **does not** emit `scan:render`.
