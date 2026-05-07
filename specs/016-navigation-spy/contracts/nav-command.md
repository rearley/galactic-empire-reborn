# Contract — `nav` command

**Source**: `GECMDS.C:5109 cmd_navigate` (deviated: original was one-shot bearing report; we hook autopilot — see research D1)
**Handler**: `backend/src/game/commands/handlers/nav.handler.ts` (new)
**Keyword**: `nav`  ·  **Aliases**: none  ·  **MinArgs**: `0`

## Forms

### `nav` (no arguments) — status

| Condition | Output (single `system`/`info` line) |
|---|---|
| `holdcourse === 0` (or undefined) | `NAV_INACTIVE`: `"Autopilot inactive."` |
| `holdcourse > 0` | `NAV_STATUS`: `"Autopilot active — target ({x},{y}), distance {dist}, bearing {bearing}."` |

`dist` and `bearing` are computed live from current ship coords using
existing helpers (the same math as the active form).

### `nav <x> <y>` — engage / replace

Argument validation (in order):

1. `args.length !== 2` → `NAVFMT`: `"Usage: nav <x> <y>"`.
2. `x = parseInt(args[0], 10)`, `y = parseInt(args[1], 10)`. Either
   non-integer → `NAVFMT`.
3. `Math.abs(x) > UNIVMAX || Math.abs(y) > UNIVMAX` → `NAVFMT`.
4. `Math.floor(ship.xcoord) === x && Math.floor(ship.ycoord) === y` →
   `NAV_ALREADY_THERE`: `"Already at target sector."` ; **no state change**.

If validation passes:

- If `ship.where >= 10` (in orbit): `ship.where = 1` (auto-break orbit, D7).
- `ship.navTargetX = x; ship.navTargetY = y; ship.holdcourse = 1;`
- Compute `bearing = cbearing(ship.coord, target.coord, ship.heading)` (rounded), `distance = cdistance(ship.coord, target.coord) * 10000`.
- Emit `NAV01`: `"Course set for ({x},{y}), bearing {bearing}, distance {distance}."` (matches original NAV01 fields).
- Mark `ship.dirty = true`.

Re-issue while active (D6): same path runs; target replaced silently.

## Per-tick behaviour (PhysicsTickService branch)

For each ship `s` in the in-memory map where `s.holdcourse > 0`:

1. **Arrival check** (D8): if
   `Math.floor(s.xcoord) === s.navTargetX && Math.floor(s.ycoord) === s.navTargetY`:
    - `s.holdcourse = 0; s.navTargetX = null; s.navTargetY = null; s.dirty = true;`
    - emit `NAV_ARRIVED`: `"Autopilot disengaged — arrived at ({x},{y})."` to `user:${s.userid}` room as a `command:result` line.
    - **continue** (do not steer this tick).
2. **Steer**: `s.head2b = cbearing({x: s.xcoord, y: s.ycoord}, {x: s.navTargetX + 0.5, y: s.navTargetY + 0.5}, s.heading)`.
   The `+0.5` matches the original `cmd_navigate:5136` convention.
3. The pre-existing rotation step (`rotationStep(s.heading, s.head2b, maxAccel)`) consumes `head2b` as before.

## Manual cancel (rot / imp / war)

The three handlers gain a one-line preamble:

```ts
if (ship.holdcourse > 0) {
  ship.holdcourse = 0;
  ship.navTargetX = null;
  ship.navTargetY = null;
}
```

Silent — no `nav-cancelled` event (per spec FR-005).

## Messages added

| ID | Template |
|---|---|
| `NAVFMT` | `Usage: nav <x> <y>` |
| `NAV01` | `Course set for ({0},{1}), bearing {2}, distance {3}.` |
| `NAV_INACTIVE` | `Autopilot inactive.` |
| `NAV_STATUS` | `Autopilot active — target ({0},{1}), distance {2}, bearing {3}.` |
| `NAV_ARRIVED` | `Autopilot disengaged — arrived at ({0},{1}).` |
| `NAV_ALREADY_THERE` | `Already at target sector.` |

## Test coverage required

- `nav.handler.spec.ts`: bounds rejection (±UNIVMAX edge cases), already-there short-circuit, replace-while-active, in-orbit auto-break, status form (active and inactive).
- `nav-autopilot.integration.spec.ts`: with fake clock, advance physics ticks; assert `head2b` updates each tick, ship rotates, eventually arrives, autopilot disengages, arrival event delivered exactly once.
- `nav-cancel.integration.spec.ts`: with autopilot active, issue `rot 30` → `holdcourse === 0`, `navTargetX === null`, `navTargetY === null`, manual rotate takes effect.
- `nav-spy.balance.spec.ts`: assert `UNIVMAX === 15`.
