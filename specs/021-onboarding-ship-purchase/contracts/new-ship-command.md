# Contract: `new` Command & Onboarding Changes

## Onboarding WebSocket Events (changed)

### Removed event: `prompt:class-list`

This event is no longer emitted. The server goes directly to ship-name prompt.

### Modified event: `prompt:ship-name`

Emitted immediately when a new player connects (no class step first).

```jsonc
// Server → Client (emitted on new player connection)
{
  "step": "NAME",
  "rule": "1-19 printable ASCII"
  // Note: no `selectedClass` field anymore — class is fixed at 1
}
```

No change to the `prompt:reply` message structure. Client sends:
```jsonc
{ "value": "My Ship Name" }   // string, ship name
```

---

## In-Game Command: `new`

Handled by `NewShipHandlerService` for players with an active ship.

### `new` (no arguments)

**Response**: Usage help listing subcommands.

```
USAGE: new ship <class>  — purchase a ship at Zygor station
```

### `new ship` (no class)

**Response**: List of all purchasable PLAYER ship classes with prices.

```
Available ships at Zygor station:
  1  Interceptor        ........  5,000 cr
  2  Stealth Fighter    ........  50,000 cr
  3  ...
```

### `new ship <N>` — purchase

**Pre-conditions**:
1. Player is in sector (0,0) — neutral zone
2. Player is orbiting any planet (`ship.where >= 10`)
3. `N` is a valid PLAYER category class number
4. `User.cash >= shipClass.maxPrice`

**Success response**:
```
New <TypeName> purchased. Credits remaining: <cash>. Board her with `boa <shipno>`.
```

**Rejection responses**:

| Condition | Response |
|-----------|----------|
| Not in neutral zone | `You must be at Zygor station (neutral zone) to purchase a ship.` |
| Not orbiting | `You must be orbiting a planet at Zygor station.` |
| Invalid class (non-existent) | `Invalid ship class. Type 'new ship' to see available classes.` |
| AI/CPU class | `Invalid ship class. Type 'new ship' to see available classes.` |
| Insufficient credits | `Insufficient credits. You need <price> cr but have <cash> cr.` |

### `new shield <type>` (stub)

**Response**: Out-of-scope stub.
```
Shield upgrades are not yet available. Check back in a future update.
```

---

## Command Routing

The `new` keyword is handled at two levels:

| Player state | Handler |
|-------------|---------|
| No active ship (onboarding) | `GameGateway.handlePromptReply()` — only AWAITING_NAME step exists |
| Has active ship | `CommandRouterService` → `NewShipHandlerService` |

This matches FR-013: the gateway intercept for players with no ship is unchanged at the socket level.
