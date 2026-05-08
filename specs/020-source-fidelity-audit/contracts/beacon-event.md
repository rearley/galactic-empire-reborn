# Contract — `beacon` Socket Event

**Source of truth**: `GEFUNCS.C:808-816` (beacon-on-move emission).

## Event name

`beacon`

## Direction

Server → Client. Emitted by `GameGateway` to the Socket.io room of every
sector containing observing players.

## Trigger conditions (mirror C source)

A beacon event is emitted when **all** of the following hold during the
physics tick processing of a ship movement:

1. The moving ship has just transitioned from sector A to sector B
   (`fromSector !== toSector`).
2. There is at least one observer (other ship) in `toSector`.
3. The C-source gating roll fires — `gernd() % 10 === 0`. This 1-in-10
   probability is preserved per spec FR-005.
4. The moving ship has a beacon string set (the TS analogue of
   `beacon[usrn].beacon[0] != 0`). If the TS implementation has no
   beacon string concept yet, this gate degenerates to "always true"
   for class HIGH fixes; otherwise the C gate is honored.

If any of (1)–(4) fail, no event fires.

## Payload (per Clarification Q2)

```ts
type BeaconEvent = {
  shipId: string;       // moving ship's id
  shipName: string;     // moving ship's display name
  fromSector: number;   // 0 ≤ n < MAXX*MAXY
  toSector: number;     // 0 ≤ n < MAXX*MAXY
};
```

All fields REQUIRED. No additional fields. Schema is internal — no
backwards-compat constraint with prior clients (none exist).

## Acceptance tests

1. Move ship A from sector 12 to sector 13 with player B present in
   sector 13 and the gate roll forced to fire → exactly one `beacon`
   event delivered to B's socket room with the documented payload.
2. Same move with the gate roll forced to NOT fire → no event.
3. Same move with no observers in `toSector` → no event.
4. In-sector reposition (`fromSector === toSector`) → no event.

## Out of scope

- Client-side rendering of the event log (existing scrolling event log
  already accepts ad-hoc messages).
- Beacon-string mutation commands (no new commands per FR-012).
