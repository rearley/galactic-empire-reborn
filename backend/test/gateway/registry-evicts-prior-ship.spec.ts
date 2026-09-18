/**
 * Switching ships must not leave the old hull on everyone else's roster.
 *
 * `ConnectedShipsRegistry` holds two maps that are meant to be inverses:
 * `byShipId` and `bySocketId`. `upsert` maintained only one of them on a
 * switch.
 *
 * It evicts a prior SOCKET for the same SHIP — the single-socket-per-ship
 * takeover, which has its own spec — but never a prior SHIP for the same
 * SOCKET. So when one socket moves from hull A to hull B:
 *
 *   before   byShipId{A→S}          bySocketId{S→A}
 *   upsert(B,S)  prior = byShipId.get(B) = undefined, so nothing is deleted
 *   after    byShipId{A→S, B→S}     bySocketId{S→B}
 *
 * `bySocketId` is overwritten and stays correct; `byShipId` ACCUMULATES. And
 * `list()` iterates `byShipId`, so hull A keeps appearing in every
 * `player.snapshot` — which `emitScopedSnapshotToAll` fans out to everyone.
 *
 * That is exactly the reported shape: **other players** see both ships, the
 * switching player does not. Their own view is driven by `bySocketId`, which
 * was never wrong.
 *
 * The path a player takes to get here is `x` — it returns them to ship select
 * (`exit.handler.ts`), and picking a hull runs `handleShipSelectReply` ->
 * `boardShipAndWelcome` -> `upsert` on the SAME socket. Nothing unregisters the
 * hull they left: `registry.remove` is called from exactly one place, the
 * disconnect handler (`connection-lifecycle.service.ts:798`). So `x` is the
 * switch, and it always upserts over a live registration.
 *
 * It "clears on its own" for a reason worth knowing, because it is not a
 * roster resync: `list()` skips any ship `shipStateService` cannot resolve
 * (`if (!ship) continue`), so the ghost persists until hull A leaves the
 * in-memory map for some unrelated reason. Nothing reconciles it.
 *
 * @see https://github.com/rearley/galactic-empire-reborn/issues/49
 */
import 'reflect-metadata';
import { ConnectedShipsRegistry } from '../../src/gateway/connected-ships.registry';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { shipKey } from '../../src/game/ship/ship-state.types';

/** Both hulls exist and are resolvable, so `list()` has no reason to skip either. */
function makeShipState() {
  const ships = new Map<string, { shipname: string; shpclass: number; xcoord: number; ycoord: number }>([
    ['u1:1', { shipname: 'Old Hull', shpclass: 1, xcoord: 5.2, ycoord: 3.9 }],
    ['u1:2', { shipname: 'New Hull', shpclass: 4, xcoord: 5.2, ycoord: 3.9 }],
    ['u2:1', { shipname: 'Bystander', shpclass: 1, xcoord: 5.2, ycoord: 3.9 }],
  ]);
  return {
    get: (userid: string, shipno: number) => ships.get(`${userid}:${shipno}`),
  } as unknown as ShipStateService;
}

describe('a socket switching hulls evicts the one it left', () => {
  it('drops the old ship from the roster', () => {
    const registry = new ConnectedShipsRegistry(makeShipState());
    registry.upsert(shipKey('u1', 1), 'socket-A');
    registry.upsert(shipKey('u1', 2), 'socket-A');

    const listed = registry.list().map((p) => p.shipId);
    expect(listed).toEqual([shipKey('u1', 2)]);
  });

  it('does not disturb another player on their own socket', () => {
    // Guards against an over-broad eviction that clears by userid rather than
    // by socket, which would drop a second captain sharing nothing but a name.
    const registry = new ConnectedShipsRegistry(makeShipState());
    registry.upsert(shipKey('u2', 1), 'socket-B');
    registry.upsert(shipKey('u1', 1), 'socket-A');
    registry.upsert(shipKey('u1', 2), 'socket-A');

    const listed = registry.list().map((p) => p.shipId).sort();
    expect(listed).toEqual([shipKey('u1', 2), shipKey('u2', 1)].sort());
  });

  it('still reports a displaced socket, so the takeover path is unchanged', () => {
    // `upsert` returns the prior socket for the SAME ship and the caller reads
    // that as "someone displaced this player" and disconnects it. The eviction
    // added here is a different axis and must not alter this contract.
    // @see test/gateway/single-socket-per-ship.spec.ts
    const registry = new ConnectedShipsRegistry(makeShipState());
    registry.upsert(shipKey('u1', 1), 'socket-A');
    const displaced = registry.upsert(shipKey('u1', 1), 'socket-B');

    expect(displaced).toBe('socket-A');
    expect(registry.list().map((p) => p.shipId)).toEqual([shipKey('u1', 1)]);
  });

  it('re-registering the same socket on the same ship is still a no-op', () => {
    // The `x` unboard/reboard case: returning an id here made a player
    // displace themselves. Kept explicit because the new eviction runs on the
    // same call path and must not resurrect that bug.
    const registry = new ConnectedShipsRegistry(makeShipState());
    registry.upsert(shipKey('u1', 1), 'socket-A');
    expect(registry.upsert(shipKey('u1', 1), 'socket-A')).toBeUndefined();
    expect(registry.list().map((p) => p.shipId)).toEqual([shipKey('u1', 1)]);
  });

  it('leaves both maps consistent, not just the one the roster reads', () => {
    // Fixing `list()` alone would hide the ghost while `getSocketId` still
    // answered for a hull nobody is flying.
    const registry = new ConnectedShipsRegistry(makeShipState());
    registry.upsert(shipKey('u1', 1), 'socket-A');
    registry.upsert(shipKey('u1', 2), 'socket-A');

    expect(registry.getSocketId(shipKey('u1', 1))).toBeUndefined();
    expect(registry.getSocketId(shipKey('u1', 2))).toBe('socket-A');
  });
});
