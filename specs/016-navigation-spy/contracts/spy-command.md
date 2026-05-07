# Contract — `spy` command

**Source**: `GECMDS.C:6040 cmd_spy`
**Handler**: `backend/src/game/commands/handlers/spy.handler.ts` (new)
**Keyword**: `spy`  ·  **Aliases**: none  ·  **MinArgs**: `0`

## Form

`spy` — no arguments. Plants the issuing player as the spy on the
currently-orbited planet.

## Validation (in original-source order)

| # | Check | Original line | Reject message |
|---|---|---|---|
| 1 | `ship.where >= 10` | `GECMDS.C:6044` | `SPY1`: `"You must be in orbit of a planet to plant a spy."` |
| 2 | Resolve `plnum = ship.where - 10`, fetch `PlanetState` for `(xsect, ysect, plnum)`. | `GECMDS.C:6051-6053` | (no message; if planet not found, fall through to internal error path) |
| 3 | `planet.type !== PLTYPE_WORM` | `GECMDS.C:6055` | `SPY0B`: `"You cannot plant a spy on a wormhole."` |
| 4 | `planet.userid.toLowerCase() !== ship.userid.toLowerCase()` (case-insensitive userid match per existing `sameas` pattern) | `GECMDS.C:6063` | `SPY0`: `"You already own this planet."` |
| 5 | not in neutral zone (`Math.floor(ship.xcoord) === 0 && Math.floor(ship.ycoord) === 0` is the canonical NZ test in this codebase) | `GECMDS.C:6070` | `SPY0C`: `"Spies cannot operate in the neutral zone."` |
| 6 | `ship.items[I_SPY] > 0n` | `GECMDS.C:6077` | `SPYM0`: `"You have no spy equipment aboard."` |

## Effects on success

```ts
ship.items[I_SPY] = ship.items[I_SPY] - 1n;
ship.dirty = true;
planet.spyowner = ship.userid;
planet.dirty = true; // existing pattern; PlanetStateService flush picks it up
```

Emit `SPYM1`: `"Spy successfully planted on {planetName}."` (single
`success` line).

## Scan-render gating (D3)

In `scan.handler.ts:scanPl`, after the existing planet-owner branch
emits the per-item inventory block, add an `else if` branch:

```ts
else if (planet.spyowner !== ''
    && planet.spyowner.toLowerCase() === ship.userid.toLowerCase()) {
  // emit the same per-item inventory block as the owner branch
}
```

The block matches the GECMDS.C:2367-2375 owner output shape (one line
per non-zero item: `"<Item-name><dots><qty>"`).

## Messages added

| ID | Template |
|---|---|
| `SPY1` | `You must be in orbit of a planet to plant a spy.` |
| `SPY0` | `You already own this planet.` |
| `SPY0B` | `You cannot plant a spy on a wormhole.` |
| `SPY0C` | `Spies cannot operate in the neutral zone.` |
| `SPYM0` | `You have no spy equipment aboard.` |
| `SPYM1` | `Spy successfully planted on {0}.` |

## Test coverage required

- `spy.handler.spec.ts`: each rejection branch (not-in-orbit, wormhole, self-owned, neutral zone, no-spy-equipment) — assert message + zero state change. Success path — assert `items[I_SPY]` decremented by `1n`, `planet.spyowner` set, dirty flags true.
- Scan reveal test: planet with `spyowner = "alice"`, viewer `alice` runs `sca pl <name>` → output contains item lines. Viewer `bob` runs same → only aggregate description.
- `nav-spy.balance.spec.ts`: assert `I_SPY === 13`.
