/**
 * A captain whose ship is destroyed must be able to keep playing.
 *
 * The hull row is deleted on death but the socket still holds its shipno, so
 * every subsequent command — `rep`, `mai`, even `hel` — short-circuited to
 * "No active ship." until the player reconnected. One playtest log sat in that
 * state for three minutes.
 *
 * Canon does not leave the session in limbo: checkdam prints YOURDEAD, calls
 * killem, then resets `user[usrn].substt = 0` (GEFUNCS.C:999-1004), returning
 * the captain to a state they can act from. That is the whole point of
 * YOURDEAD telling them a Galactic Command freighter dropped them at Zygor —
 * the message promises a recovery the port did not perform.
 *
 * `presentShipEntry` is the same recovery `abandon` already used, and its own
 * docstring records the identical bug: "without it an abandoned captain sat at
 * a session that answered 'No active ship.' to everything."
 */

import { GameGateway } from '../../src/gateway/game.gateway';
import type { Mock } from 'vitest';

describe('recovery after death', () => {
  function build() {
    // `logger` and `presentShipEntry` are private, so the double is built as a
    // loose record and cast once at the call site.
    const gw = Object.create(GameGateway.prototype) as Record<string, unknown>;
    const socket = { id: 's1', data: { userid: 'alice', activeShipNo: 2 } };
    gw.server = {
      sockets: {
        adapter: { rooms: new Map([['user:alice', new Set(['s1'])]]) },
        sockets: new Map([['s1', socket]]),
      },
    };
    gw.logger = { error: vi.fn() };
    gw.presentShipEntry = vi.fn().mockResolvedValue(undefined);
    return { gw, socket };
  }

  it('clears the dead shipno and re-presents ship entry', async () => {
    const { gw, socket } = build();
    await (gw as unknown as { recoverAfterDeath: (u: string) => Promise<void> })
      .recoverAfterDeath('alice');

    expect(socket.data.activeShipNo).toBeUndefined();
    // A captain who was online for the death has already had YOURDEAD, so
    // re-entry suppresses the "destroyed while you were away" notice.
    expect(gw.presentShipEntry as Mock).toHaveBeenCalledWith(socket, 'alice', {
      noticeShipLoss: false,
    });
  });

  it('does nothing when the captain has no live socket', async () => {
    const { gw } = build();
    await (gw as unknown as { recoverAfterDeath: (u: string) => Promise<void> })
      .recoverAfterDeath('nobody');
    expect(gw.presentShipEntry as Mock).not.toHaveBeenCalled();
  });

  it('never throws when the server double is minimal', async () => {
    // Death runs inside the combat tick; a failure here must not disturb it,
    // and many unit tests supply a server with only emit()/to().
    const gw = Object.create(GameGateway.prototype) as Record<string, unknown>;
    gw.server = { emit: vi.fn(), to: vi.fn() };
    await expect(
      (gw as unknown as { recoverAfterDeath: (u: string) => Promise<void> }).recoverAfterDeath('alice'),
    ).resolves.toBeUndefined();
  });

  it('logs and continues when re-entry itself fails', async () => {
    const { gw } = build();
    gw.presentShipEntry = vi.fn().mockRejectedValue(new Error('db down'));
    await expect(
      (gw as unknown as { recoverAfterDeath: (u: string) => Promise<void> }).recoverAfterDeath('alice'),
    ).resolves.toBeUndefined();
    expect((gw.logger as { error: Mock }).error).toHaveBeenCalled();
  });
});
