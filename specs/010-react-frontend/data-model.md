# Phase 1 Data Model — 010 React Frontend

This feature adds no Prisma entities. The data model below describes (a)
client-side runtime entities held in React state and (b) the four new wire
payloads added to `frontend/src/types/contracts.ts`.

## A. Wire payloads (additions to `contracts.ts`)

### A.1 `Sector`
```ts
export interface Sector {
  /** integer 0..MAXX-1 (= floor(ship.x)) */
  x: number;
  /** integer 0..MAXY-1 (= floor(ship.y)) */
  y: number;
}
```

### A.2 `ConnectedPlayer`
```ts
export interface ConnectedPlayer {
  shipId: string;
  name: string;
  sector: Sector;
  shipClass: number; // matches ShipState.class — see GEMAIN.H
}
```

### A.3 `PlayerSnapshotPayload` (server → joining socket only)
```ts
export interface PlayerSnapshotPayload {
  players: ConnectedPlayer[];
}
```
Event name: `player.snapshot`. Emitted via `client.emit` (FR-029).

### A.4 `PlayerJoinedPayload` (server → all)
```ts
export interface PlayerJoinedPayload extends ConnectedPlayer {}
```
Event name: `player.joined`. Emitted via `this.server.emit` (FR-024).

### A.5 `PlayerLeftPayload` (server → all)
```ts
export interface PlayerLeftPayload {
  shipId: string;
}
```
Event name: `player.left`. Emitted via `this.server.emit` (FR-025).

### A.6 `PhysicsSectorTransitionPayload` (server → all, batched per tick)
```ts
export interface SectorTransition {
  shipId: string;
  fromSector: Sector;
  toSector: Sector;
}
export interface PhysicsSectorTransitionPayload {
  transitions: SectorTransition[];
}
```
Event name: `physics.sector-transition`. One event per tick when at least
one ship's `(floor(x), floor(y))` changed; not emitted otherwise (FR-026).

## B. Client-side runtime entities (frontend only)

### B.1 `EventLogEntry`
```ts
interface EventLogEntry {
  id: string;          // monotonic client-generated for React keys
  receivedAt: number;  // Date.now() at receive
  line: EventLogLine;  // re-uses existing wire type
}
```
Buffer cap: 500. Older entries dropped FIFO on overflow (FR-010).

### B.2 `CommandHistory`
```ts
interface CommandHistory {
  entries: string[];   // bounded to last 20
  cursor: number;      // -1 = editing, 0..N-1 indexes into entries
  draft: string;       // in-progress text restored on cursor return
}
```
Lives in `CommandInput` component state (FR-004).

### B.3 `PlayerListState`
```ts
interface PlayerListState {
  byShipId: Map<string, ConnectedPlayer>;
}
```
Reducer actions:
- `SNAPSHOT(players)` — replace
- `JOIN(player)` — set
- `LEFT(shipId)` — delete
- `TRANSITION(transitions)` — for each, mutate `sector` of existing entry;
  ignore if shipId not present (defensive — out-of-order with `player.left`)

Sorted alphabetically by `name` for render (FR-018).

### B.4 `ScanMapState`
```ts
interface ScanMapState {
  cells: ScanCell[];         // last scan result
  selfSector: Sector | null; // updated from sector-transition events for the local ship
}
```
Cleared on `physics.sector-transition` if the local shipId is in the batch
(FR-013).

### B.5 `ConnectionState`
```ts
type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';
```
Drives the banner: visible iff status !== `'connected'` (FR-019).

## C. Backend runtime entities (no DB persistence)

### C.1 `ConnectedShipsRegistry` (singleton service)
```ts
class ConnectedShipsRegistry {
  private map = new Map<string /*shipId*/, string /*socketId*/>();
  // upsert returns prior socketId if any (used to enforce single-socket-per-ship)
  upsert(shipId: string, socketId: string): string | undefined;
  remove(socketId: string): { shipId: string } | undefined;
  list(): ConnectedPlayer[];
}
```

### C.2 `SectorTransitionSubscriber` (tick subscriber, internal state)
Holds `Map<shipId, Sector>` of last-tick integer cells. On each physics
tick: build current snapshot from `ShipStateService`, diff vs prior, emit
batched event if non-empty, swap snapshots.

## D. Field mapping back to `GEMAIN.H` reference

| Field | Reference |
|-------|-----------|
| `Sector.x` / `.y` | `MAXX=30`, `MAXY=15`; `floor(coord.x)`, `floor(coord.y)` |
| `ConnectedPlayer.shipClass` | `struct ship.class` (GEMAIN.H) |
| `ConnectedPlayer.name` | `struct ship.shipname` |

## E. Validation rules

- `ConnectedPlayer.sector.x` MUST be in `[0, MAXX)`; `.y` in `[0, MAXY)`.
- `PhysicsSectorTransitionPayload.transitions` MUST be non-empty when emitted.
- `player.joined` for a `shipId` already present in the client list overwrites
  (last-write-wins matches the backend's single-socket invariant FR-025a).
