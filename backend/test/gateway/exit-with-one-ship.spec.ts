import { ConnectedShipsRegistry } from '../../src/gateway/connected-ships.registry';
import { ShipStateService } from '../../src/game/ship/ship-state.service';

/**
 * Typing `x` with a single ship disconnected the player and left the window
 * dead, showing "Another session opened with your credentials".
 *
 * Three faults compounding, reported from play:
 *
 * 1. `presentShipEntry` auto-boards when a captain owns exactly one hull. That
 *    is right on CONNECT — a returning pilot should not pick from a menu of one
 *    — but wrong after `x`, which in canon returns you to the main menu
 *    (GEMAIN.C:2859 mnu_fightsub). So `x` unboarded and instantly re-boarded,
 *    and the exit did nothing observable.
 *
 * 2. That re-board called `upsert` with the SAME socket, and upsert returned
 *    the prior id regardless of whether it had changed. The caller reads a
 *    returned id as "a second session displaced the first", so it emitted
 *    SESSION_REPLACED to the prior socket and disconnected it — which was the
 *    player's own, live socket. They displaced themselves.
 *
 * 3. Logout lives on the ship-select screen, which only appeared with two or
 *    more hulls. A single-ship captain — most players — had no way to log out
 *    at all.
 */
describe('ConnectedShipsRegistry.upsert', () => {
  function makeRegistry() {
    return new ConnectedShipsRegistry({} as unknown as ShipStateService);
  }

  it('reports no displacement when the same socket re-registers', () => {
    // The whole bug: re-registering an unchanged socket is not a second
    // session, and treating it as one disconnects a live player.
    const reg = makeRegistry();
    expect(reg.upsert('u1#1', 'socket-a')).toBeUndefined();
    expect(reg.upsert('u1#1', 'socket-a')).toBeUndefined();
  });

  it('still reports the prior socket when a genuinely different one takes over', () => {
    // Latest-wins across two browsers must keep working.
    const reg = makeRegistry();
    reg.upsert('u1#1', 'socket-a');
    expect(reg.upsert('u1#1', 'socket-b')).toBe('socket-a');
  });

  it('leaves the surviving socket resolvable after a real replacement', () => {
    const reg = makeRegistry();
    reg.upsert('u1#1', 'socket-a');
    reg.upsert('u1#1', 'socket-b');
    expect(reg.getSocketId('u1#1')).toBe('socket-b');
  });

  it('keeps a re-registered socket resolvable', () => {
    const reg = makeRegistry();
    reg.upsert('u1#1', 'socket-a');
    reg.upsert('u1#1', 'socket-a');
    expect(reg.getSocketId('u1#1')).toBe('socket-a');
  });
});
