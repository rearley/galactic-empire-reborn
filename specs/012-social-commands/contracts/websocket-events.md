# WebSocket Event Contracts

**Feature**: 012-social-commands

Only one new event is introduced: `message.send`. The existing `player.snapshot`
event (feature 010) is reused unchanged.

---

## `message.send` (server → client)

Emitted by `GameGateway` when it processes a `CommandResult.broadcasts` entry whose
`event === 'message.send'` (produced by the `sen` handler).

### Payload

```ts
interface MessageSendEvent {
  /** Sender's ship name as it appears at send time (not their userid). */
  from: string;
  /** Channel letter the sender used. */
  channel: 'A' | 'B' | 'C';
  /** The message body. Length ≤ 200 characters. */
  text: string;
}
```

### Delivery rules

| Sender freq | Recipients                                                              |
|-------------|-------------------------------------------------------------------------|
| 0 (hail)    | All connected ships, **excluding cloaked recipients** (matches `outwar FILTER` in `cmd_send` line 1841) |
| 1 – 19 999  | All ships in the sender's sector room (`sector:{x}:{y}`), regardless of cloak |
| ≥ 20 000    | All connected ships, regardless of cloak                                |

The sender themselves never receives this event — the per-caller confirmation line
in `CommandResult.lines` is the sender's feedback.

### Persistence

None. Messages are real-time only and are never written to durable storage
(FR-015). A disconnected recipient misses the message — there is no replay queue.

### Client handling expectation

The React frontend appends the message to its scrolling event log keyed off
`from`/`channel` for visual treatment. The exact rendering is the frontend's choice
and is out of scope for this contract.

---

## `player.snapshot` (server → client) — reused

Already defined in feature 010. The `tea` handler triggers a rebroadcast of this
event to the affected caller's socket on a successful join or leave so the
frontend's local state picks up the new team affiliation immediately.

This contract makes no changes to `player.snapshot` payload shape.

---

## Compatibility

This feature adds one event and reuses one. No existing contract is altered. Clients
that do not listen for `message.send` simply ignore it — no breakage.
