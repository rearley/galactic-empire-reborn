# Contract — `scan lo` planet/wormhole projection (feature-003 deferred wire-up)

**Feature**: 004-galaxy-generator
**Replaces**: `TODO(004)` markers at `backend/src/game/commands/handlers/scan.handler.ts:103-104` and `:164`.

This contract pins the wire-format additions and behavioural changes that
land in feature 003's `scan.handler.ts`. The `command` / `command:result`
WebSocket events themselves are unchanged from feature 003 — only the
planet/wormhole branches of the `scanGrid` payload and `scan pl` text path
are filled in.

## `scan lo` — `scanGrid` cells added in 004

| Object | Char | Cell shape |
|---|---|---|
| Planet (any type) | `'O'` | `{ x, y, type: 'planet', char: 'O' }` |
| Wormhole (visible == 1) | `'W'` | `{ x, y, type: 'wormhole', char: 'W' }` |
| Wormhole (visible == 0) | — | (omitted; rendered as empty cell) |

Cells are projected onto the same 11×11 tactical grid as ships, using the
existing `projectRangeCell(ship, target, scanRange)` helper from
`backend/src/game/constants.ts`. The helper accepts any object with
`{ xcoord, ycoord }` floats — both `Planet` and `Wormhole` Prisma rows
satisfy this.

`ScanCell.type` widens from `'ship' | 'self'` to
`'ship' | 'self' | 'planet' | 'wormhole'`. The frontend's
`ScanMap.tsx` already renders unknown cell types as plain characters, so
no frontend change is strictly required for parity — though a
discriminator-aware Tailwind colour pass is straightforward for polish.

### Projection iteration order (deterministic for tests)

1. All in-memory ships (existing 003 logic), excluding self.
2. All planets in the player's current sector
   (`GalaxyService.getSectorPlanets(xsect, ysect)`).
3. All visible wormholes in the player's current sector
   (`GalaxyService.getSectorWormholes(...)` filtered by `visible === 1`).
4. Self-cell at `(MAXX/2, MAXY/2)` (existing 003 logic).

Order matters for test snapshots and for frontend overlay precedence.

## `scan pl <name>` — text response shape

Replaces the `'No planets found in range.'` stub from feature 003.

**Resolution**:
- `args.length === 0` → `formatMessage(MessageId.SCANFMT)` (existing 003).
- `GalaxyService.findPlanetByName(name)` → either a `Planet` or `null`.
- `null` → emit the original game's "no such planet" line. Pinned in
  `messages.md` as `MessageId.NO_SUCH_PLANET` (`"No planet by that name."`,
  derived from `GECMDS.C:2316 FOOLISH`-equivalent narrative text — not a
  recoverable `.MSG` string; documented inferred message).
- `Planet` → emit a status block, line shapes per `GECMDS.C:2326-2356`:

```
Planet #1: Zygor-3
-----------------
Owned by: <userid>      [omitted if unowned]
Bearing: 0   Distance: 0     [omitted when not in same sector — see below]
Environment: <Earth-like|Hostile|Toxic|Inferno-like>
Resources:   <Barren|Sparse|Rich|Abundant>
```

When the looked-up planet is in a sector other than the player's current
sector, the bearing/distance line is omitted (computing it across the
30×15 grid is cheap — but the original SCAN10 path assumed same-sector
proximity; emitting a long-distance bearing here would be a guess at
faithful behavior). Sector coordinates of the planet are appended on a
separate line:

```
Located in sector (X,Y).
```

The exact Environment/Resources string-table values come from
`GECMDS.C:2338-2356` (`SCAN12..SCAN16` aliased text). Pinned in
`messages.md`.

## Message catalogue additions (`backend/src/game/commands/messages.ts`)

New `MessageId` entries land in feature 004:

| ID | Source | String |
|---|---|---|
| `NO_SUCH_PLANET` | derived | `"No planet by that name."` |
| `SCAN08` | `GECMDS.C:2326` | `"Planet #%d: %s"` |
| `DASHES` | `GECMDS.C:2327` | `"-----------------"` |
| `SCAN09` | `GECMDS.C:2330` | `"Owned by: %s"` |
| `SCAN10` | `GECMDS.C:2332` | `"Bearing: %d   Distance: %s"` |
| `SCAN11` | `GECMDS.C:2337` | `"Environment: "` |
| `SCAN12` | `GECMDS.C:2339` | `"Earth-like"` |
| `SCAN13` | `GECMDS.C:2342` | `"Hostile"` |
| `SCAN14` | `GECMDS.C:2345` | `"Toxic"` |
| `SCAN15` | `GECMDS.C:2348` | `"Inferno-like"` |
| `SCAN16` | `GECMDS.C:2350` | `"Resources: "` |
| `SCAN_LOCATED_IN` | derived | `"Located in sector (%d,%d)."` |

`SCAN12..SCAN15` are reused for Resources output by index lookup, mirroring
the original's table-driven approach (`GECMDS.C:2351-2356`).

## Test parity hooks

These contracts are checked end-to-end by:

- `test/unit/handlers/scan.spec.ts` — extended with planet/wormhole
  projection cases (currently asserts only ships + self).
- `test/integration/command-roundtrip.spec.ts` — extended to seed a known
  galaxy via env-overridden seed and assert grid contents.

No new WebSocket events. No new event payload fields. No frontend protocol
break.
