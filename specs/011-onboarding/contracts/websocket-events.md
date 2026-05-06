# Contract — WebSocket Events (additions for 011-onboarding)

Extends `specs/003-ship-commands/contracts/websocket-events.md`. Only the
new and modified events are listed here.

## Connection handshake — MODIFIED

The existing `query: { userid }` path is **removed**. Clients MUST present
the JWT in the Socket.io `auth` payload:

```ts
io({ auth: { token: '<jwt>' } });
```

**Server behavior on connect**:

1. Read `socket.handshake.auth.token`. Missing/invalid/expired →
   `emit('error', { code: 'AUTH_REQUIRED', message: '...' })` then
   `disconnect(true)`.
2. Verify with `JwtService`. Set `client.data.userid = payload.sub`.
3. Look up the user's existing `Ship` row.
   - **No ship**: enter onboarding. Set
     `client.data.onboarding = { step: 'AWAITING_CLASS' }`. Emit
     `prompt:class-list`. **Do not** register in
     `ConnectedShipsRegistry` and **do not** join any sector room.
   - **Ship exists**: hydrate into `ShipStateService` if not already
     loaded; resolve `activeShipNo`; check `ConnectedShipsRegistry` for a
     prior socket on the same `shipId`. If present, emit
     `error { code: 'SESSION_REPLACED' }` to the prior socket and
     `disconnect(true)` it; emit the existing `player.left` for it.
     Then run the existing welcome sequence (welcome `command:result`,
     `player.snapshot`, `player.joined`).

## Event: `prompt:class-list` (server → client) — NEW

Emitted when an authenticated socket has no bound ship, or in response to
an invalid `prompt:reply` from `AWAITING_CLASS`.

**Payload**:
```ts
{
  step: 'CLASS';
  classes: Array<{
    classNumber: number;
    typeName: string;
    description: string;
    maxShields: number;
    maxPhaser: number;
    maxWarp: number;
    hasTorpedo: boolean;
    hasMissile: boolean;
  }>;
  error?: string; // present only on re-prompt
}
```

## Event: `prompt:ship-name` (server → client) — NEW

Emitted after a valid class selection, or in response to an invalid
`prompt:reply` from `AWAITING_NAME`.

**Payload**:
```ts
{
  step: 'NAME';
  selectedClass: number;
  rule: '1-19 printable ASCII';
  error?: string; // present only on re-prompt: 'name-taken' | 'invalid-format'
}
```

## Event: `prompt:reply` (client → server) — NEW

Single client→server channel for both onboarding steps. The shape is
discriminated by the current server-side `step`.

**Payloads**:
```ts
// During AWAITING_CLASS
{ value: number }            // classNumber

// During AWAITING_NAME
{ value: string }            // ship name
```

**Server behavior**:
- If socket has no `client.data.onboarding`: emit
  `error { code: 'NOT_IN_ONBOARDING' }` and ignore.
- Validate against the current step. Invalid → re-emit the same prompt
  with `error` set; **do not** advance and (for `AWAITING_NAME`)
  do not lose the previously accepted class (it is still in
  `client.data.onboarding.selectedClass`).
- On valid `AWAITING_NAME`: run the finalize transaction, emit the
  existing welcome / `player.snapshot` / `player.joined` sequence, and
  clear `client.data.onboarding`.

## Event: `ship.renamed` (server → all in sector) — NEW

Emitted to the bound ship's current sector room after a successful
`rename` command.

**Payload**:
```ts
{
  shipId: string;
  oldName: string;
  newName: string;
}
```

**Constraints**:
- Broadcast within one physics tick (≤ 6 s) of the rename request
  (SC-005). In practice the broadcast happens synchronously after the DB
  + in-memory update inside the command handler, well under one tick.
- Casing-only rename (e.g., "Goliath" → "GOLIATH") still emits the event.

## Command: `rename <name>` — NEW (subscribed via existing `command` event)

Routed by `CommandRouterService`. Not a new Socket.io event — uses the
existing `command` channel.

- Pre-condition: socket must be bound (registered in
  `ConnectedShipsRegistry`). Onboarding sockets get the standard
  `command:result` error response on any non-`prompt:reply` traffic.
- Validation: same name rules as `cmd_new`, with own-ship excluded from
  the uniqueness check.
- On success: update `Ship` row + `ShipState` atomically (single Prisma
  transaction wrapping the in-memory mutation), emit `ship.renamed` to
  the sector room, send `command:result` to the issuer with a
  confirmation line. Also emit a fresh `player.snapshot` so global
  player lists update.
- On failure (taken / invalid): `command:result` with an error line; no
  state change, no broadcast.

## Error event additions

| `code` | When |
|--------|------|
| `AUTH_REQUIRED` | Handshake missing/invalid/expired token |
| `SESSION_REPLACED` | Latest-wins displaced this socket |
| `NOT_IN_ONBOARDING` | `prompt:reply` arrived from a non-onboarding socket |
