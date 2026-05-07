# Contract — `cls` command

**Source**: `GECMDS.C:117 cmd_cls` (clear-screen).
**Handler**: `backend/src/game/commands/handlers/cls.handler.ts` (new)
**Keyword**: `cls`  ·  **Aliases**: none  ·  **MinArgs**: `0`

## Form

`cls` — no arguments. Extra arguments are silently ignored (matches the
original cmd_cls behaviour).

## Effects

- **Backend**: none. No ShipState, PlanetState, or DB mutation. No
  Socket.io broadcast. The handler is pure.
- **CommandResult**: returns `{ lines: [], clearLog: true }`. The
  `clearLog` directive is unicast to the issuing socket only via the
  existing `command:result` channel.
- **Frontend**: the `command:result` handler in
  `frontend/src/socket/command-result-handlers.ts` checks `result.clearLog`;
  if `true`, it calls `EventLog.clear()` after appending any `lines` to
  the log (zero-line case is a no-op append, so the net effect is "wipe").

## Cross-client isolation

The `command:result` event is unicast — only the issuing socket
receives it. No other player's event log is touched (FR-020).

## Test coverage required

- `cls.handler.spec.ts`: returns `{ lines: [], clearLog: true }`. Verifies no ShipState mutation by snapshotting `ship` before/after the handler call.
- Frontend Vitest in `frontend/src/socket/__tests__/command-result-handlers.spec.ts` (or analogous): given a result with `clearLog: true`, asserts `EventLog.clear()` was invoked exactly once and that other connected clients (mocked) did not receive any event.

## Messages added

None. The handler emits zero text; the directive is structural only.
