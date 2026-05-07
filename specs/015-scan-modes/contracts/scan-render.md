# Contract — `scan:render` socket event & scantab API

## 1. Socket event: `scan:render`

**Direction**: Server → Client (unicast to the issuing socket only — never broadcast).

**Trigger**: Any of `sca ra <level>`, `sca se`, `sca lo`, `sca lo full` produced a `CommandResult` with a populated `scanGrid`.

### Event routing (canonical)

A successful scan command emits **both** events to the issuing socket. Their contents are strictly disjoint:

| Event            | Channel target | Content                                                                                                  |
|------------------|----------------|----------------------------------------------------------------------------------------------------------|
| `command:result` | EventLog       | Exactly one `info`-category line containing the header text (e.g. `"Range: 4500 — Sector 12,7"`). Nothing else — no grid, no side panel. |
| `scan:render`    | ScanPanel      | The full `ScanRenderEvent` payload — `kind`, `mode`, `cells[]`, `header`, optional `sidePanel[]`.        |

The header text is duplicated across both events deliberately: the EventLog needs a transcript line so the player can scroll back through what they scanned and when, and the ScanPanel needs the same string in-band so it can render a self-contained card.

On **failure** (player not in flight, dead, docked, etc.):

- Emit `command:result` with a single `system`-category error line.
- **Do not emit `scan:render`.**

Frontend contract: a missing `scan:render` event means "no update to the scan panel" — it MUST NOT be interpreted as "clear the panel". The previous scan card stays visible until the next successful scan replaces or appends to it.

**Payload**: `ScanRenderEvent` (see `data-model.md` §3).

```ts
interface ScanRenderEvent {
  kind: 'ra' | 'se' | 'lo' | 'lo-full';
  mode: 'overwrite' | 'append';
  cells: ScanCell[];
  header: string;
  sidePanel?: SidePanelRow[];
}
```

### Mode semantics

| `mode`      | Frontend behaviour                                               |
|-------------|------------------------------------------------------------------|
| `overwrite` | Replace the current scan-panel contents with this payload.       |
| `append`    | Append a new scan card below previous cards (scrollable list).   |

Mode is computed server-side by reading `ShipState.scanHome` (cached from `User.options[1]`). If `scanHome === true`, `mode = 'overwrite'`; otherwise `mode = 'append'`.

### Header conventions

| `kind`     | Header format                                                      |
|------------|--------------------------------------------------------------------|
| `ra`       | `"Range: <effective_range> — Sector <x>,<y>"`                      |
| `se`       | `"Sector <x>,<y>"`                                                 |
| `lo`       | `"Range: <scanrange*10> — Sector <x>,<y>"`                         |
| `lo-full`  | `"Range: <scanrange*10> — Sector <x>,<y>"` + side-panel suffix     |

Effective range for `ra` follows `scanrange / (10 - level)^2` (FR-002).

### Cells contract

- Sparse list — empty cells are omitted.
- `(x,y)` ∈ `[0,29] × [0,14]`.
- One cell per coordinate pair (collision-resolved server-side per data-model §"Cell collision precedence").
- `colour` is omitted for `type: 'mine'` and never appears for empty cells.

### Failure mode

See "Event routing (canonical)" above — failure emits only `command:result`; `scan:render` is suppressed.

---

## 2. Internal API: `buildScantab(ship, allShips, prevScantab) → Scantab`

Pure function (no I/O). Located in `backend/src/game/commands/handlers/helpers/scantab.ts`.

```ts
function buildScantab(
  self: ShipState,
  allShips: ReadonlyArray<ShipState>,
  prev: Scantab | null,
  scanRange: number,
): Scantab;
```

### Inputs

- `self` — the issuing ship.
- `allShips` — full snapshot from `ShipStateService.findAllShips()`.
- `prev` — previous scantab for this player (null on first call).
- `scanRange` — ship-class scan range in raw units (matches C `shipclass[].scanrange`).

### Output

- `Scantab` — array of up to 26 `ScantabEntry`, sorted by ascending `dist`, with `flag = 1` for occupied slots.

### Invariants

1. Excludes self.
2. Excludes cloaked ships (`cloak >= 10`).
3. Excludes ships out of range (`dist >= scanRange`).
4. Letter assignment: if `prev` has an entry for the same `shipKey`, the letter sticks. New ships fill remaining A..Z in order of first appearance within the new-ship subset.
5. Maximum 26 entries; if more than 26 ships qualify, the 26 nearest are kept (alphabet bound).
6. Returns a *new* Scantab — the input `prev` is not mutated.

### Reference

@see `GECMDS.C:2785 update_scantab`
@see `GECMDS.C:2895 pick_letter`

---

## 3. Internal API: scantab lifecycle hooks

`ScanHandlerService` exposes:

```ts
class ScanHandlerService {
  clearScantab(userid: string, shipno: number): void;
  // …
}
```

Called from:

- `GameGateway.handleDisconnect()` — on socket disconnect.
- `ShipDestroyedEvent` listener — on death (already wired by 008/014).
- Dock-back-to-base handler — on returning to a starbase.

Calling `clearScantab` for a non-existent key is a no-op (idempotent).

---

## 4. `set` command extensions

### `set <option> on|off`

Recognised options:

| Option       | Storage                | Cache field                  |
|--------------|------------------------|------------------------------|
| `auto-shield`| `ShipState.autoShield` | (existing)                   |
| `auto-repair`| `ShipState.autoRepair` | (existing)                   |
| `scannames`  | `User.options[0]`      | `ShipState.scanNames`        |
| `scanhome`   | `User.options[1]`      | `ShipState.scanHome`         |

Unknown option → `MessageId.SET_UNKNOWN` usage hint, no state change.
Bogus toggle value → `MessageId.SET_FMT` usage hint, no state change.

### `set ?`

Returns one info line per supported option with its current ON/OFF state, e.g.:

```
auto-shield: OFF | auto-repair: ON | scannames: ON | scanhome: OFF
```

### Persistence

Updates to `scannames` / `scanhome` write through to `User.options[]` immediately (single Prisma update — not deferred to the 30s flush cadence, because the player toggles these rarely and expects them to survive a hard kill).
