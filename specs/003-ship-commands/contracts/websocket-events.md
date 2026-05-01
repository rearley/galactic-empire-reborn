# WebSocket Event Contracts — feature 003

Transport: Socket.io 4 over the existing `GameGateway` (no separate namespace).

## Inbound (client → server)

### `command`

```
event:   "command"
payload: { input: string }
```

The raw text the player typed. The router lower-cases, trims, and tokenises on whitespace.
Empty / whitespace-only input is silently discarded (no `command:result`).

### `sector:join`, `sector:leave` (existing)

Unchanged from feature 002. Documented in `specs/002-tick-engine/contracts/`.

## Outbound (server → client)

### `command:result`

```
event:   "command:result"
payload: {
  lines:    { text: string, category: 'system' | 'info' | 'success' | 'combat' }[]
  scanGrid?: ScanCell[]   // present only on scan results
}
```

`lines` are appended to the event log in order received (FR-024). `scanGrid`, when
present, replaces the prior scan map (FR-026).

`ScanCell`:
```
{ x: number, y: number, type: 'ship' | 'planet' | 'wormhole', char: string }
```

`x` and `y` are integer cell coordinates inside a 10×10 intra-sector grid. Cells with no
contents are omitted from the array (FR-016).

### `error` (existing)

Unchanged from feature 002.

## Connection

The client connects with a hard-coded development `userid` in the handshake query
(FR-029):

```
io({ query: { userid: 'DEV' } })
```

In `handleConnection` the gateway:

1. Reads `client.handshake.query.userid` and stashes it on `client.data.userid`.
   Missing or non-string `userid` → `error { code: 'NO_USER', message: 'No userid in handshake.' }` then `disconnect(true)`.
2. Resolves the active ship per FR-030 (no in-game BOARD command exists in the original
   `GECMDS.C` — active-ship resolution is a handshake responsibility). The rule is
   exact; implementations have no latitude. Query `Ship` rows by `userid` ordered by
   `shipno` ASC, then:
   - **0 rows** → emit `error { code: 'NO_SHIP', message: 'No ship found for user.' }` then `disconnect(true)`. Do not create a `Ship` row (auto-creation is feature 005).
   - **1 row** → bind that row's `shipno` to `client.data.activeShipNo`.
   - **≥ 2 rows** → bind the **lowest `shipno`** (i.e. the first row of the ASC sort). Log exactly: `[ShipStateService] WARN multiple ships for userid=<id>, picked lowest shipno=<n>`. Do **not** reject the connection. Do **not** prompt the player. Multi-ship selection is a future feature; lowest-shipno is chosen because it is deterministic (same userid → same ship on every reconnect), the `Ship` model has no `lastActiveAt` column to drive an alternative, and `shipno` is part of the composite PK so it is always present and never tied within a `userid`.
3. Emits a `command:result` with a single `system`-category line `Welcome aboard, <shipname>.` so the client's event log records connection success.

Every `command` event is dispatched against `(client.data.userid, client.data.activeShipNo)`.
The active ship is connection-scoped and immutable for the lifetime of the socket — no in-scope
command changes it.

## Categories

| Category | Used for |
|----------|----------|
| `system` | Connection state, "command not recognised", framework errors |
| `info`   | `report` body lines, `scan` per-object descriptive lines |
| `success`| Confirmation lines (`NOWTURN`, `ENGFIRE`) |
| `combat` | Reserved for feature 006; no in-scope command emits this category |

## Error handling

Per FR-011, every command — successful, rejected, or unknown — produces exactly one
`command:result`. The server never silently drops a recognised input. A handler that
throws is caught at the gateway and converted to a `command:result` whose `lines` carry a
single `system`-category line "Internal error processing command." (this is a server bug
surface, not a player-visible error of the original game).
