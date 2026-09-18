import 'reflect-metadata';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ScanHandlerService } from '../../src/game/commands/handlers/scan.handler';
import { ShipClassCacheService } from '../../src/game/physics/ship-class-cache.service';
import { ConnectedShipsRegistry } from '../../src/gateway/connected-ships.registry';
import { mockRandom } from '../fixtures/mock-random';
import { makeGateway } from '../helpers/make-gateway';

/**
 * The third path out of a hull, and it had the same hole as the other two.
 *
 * `x` and `abandon` were fixed in v0.21.2 by routing both through
 * `detachFromWorld`. `recoverAfterDeath` — the post-death recovery that drops a
 * killed captain at ship entry — was written before it and does the one thing
 * it can do by hand: `socket.data.activeShipNo = undefined`. It never leaves
 * the rooms and never drops the registration, so a player who has just been
 * killed sits at the ship prompt still being fed the traffic of the sector they
 * died in, with their dead hull still registered.
 *
 * That the roster looked right was an accident of eviction timing, not a
 * guarantee: `list()` skips any ship `ShipStateService` cannot resolve, and the
 * hull is gone from memory by the time anyone reads it. @see issue #49
 *
 * Stopping flying is one operation; this makes it one call site.
 */
describe('GameGateway — death detaches the socket from the world', () => {
  const USERID = 'alice';

  const makeSocket = () => {
    const rooms = new Set<string>(['s1', `user:${USERID}`, 'sector:5:3']);
    return {
      id: 's1',
      connected: true,
      rooms,
      data: { userid: USERID, activeShipNo: 2 } as Record<string, unknown>,
      emit: vi.fn(),
      join: vi.fn((room: string) => void rooms.add(room)),
      leave: vi.fn((room: string) => void rooms.delete(room)),
      disconnect: vi.fn(),
      broadcast: { emit: vi.fn(), to: () => ({ emit: vi.fn() }), except: () => ({ emit: vi.fn() }) },
    };
  };

  const build = (socket: ReturnType<typeof makeSocket>) => {
    // The hull is already gone from memory — death deletes it — so `get`
    // resolving to nothing is the real post-kill state, not a convenience.
    const shipStateService = {
      findAllShips: () => [],
      findByUserid: () => [],
      get: vi.fn().mockReturnValue(undefined),
    } as unknown as ShipStateService;

    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue({ userid: USERID }) },
      ship: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    } as unknown as PrismaService;

    const registry = new ConnectedShipsRegistry(shipStateService);
    const gateway = makeGateway({
      shipStateService,
      registry,
      prisma,
      scanHandler: { clearScantab: vi.fn() } as unknown as ScanHandlerService,
      shipClassCache: { getTypeName: vi.fn().mockReturnValue('Interceptor') } as unknown as ShipClassCacheService,
      random: mockRandom,
    });
    const serverEmit = vi.fn();
    (gateway as unknown as { server: unknown }).server = {
      emit: serverEmit,
      to: () => ({ emit: vi.fn(), except: () => ({ emit: vi.fn() }) }),
      except: () => ({ emit: vi.fn(), to: () => ({ emit: vi.fn() }) }),
      sockets: {
        adapter: { rooms: new Map([[`user:${USERID}`, new Set(['s1'])]]) },
        sockets: new Map([['s1', socket]]),
      },
    };
    return { gateway, registry, serverEmit };
  };

  const die = async (gateway: ReturnType<typeof build>['gateway']) => {
    await (gateway as unknown as { recoverAfterDeath: (u: string) => Promise<void> })
      .recoverAfterDeath(USERID);
  };

  it('leaves the sector and captain rooms', async () => {
    const sock = makeSocket();
    const { gateway } = build(sock);

    await die(gateway);

    expect(sock.rooms.has('sector:5:3')).toBe(false);
    expect(sock.rooms.has(`user:${USERID}`)).toBe(false);
    expect(sock.rooms.has('s1')).toBe(true);
  });

  it('drops the dead hull from the registry and says so', async () => {
    const sock = makeSocket();
    const { gateway, registry, serverEmit } = build(sock);
    registry.upsert(`${USERID}:2`, 's1');

    await die(gateway);

    expect(registry.isBound('s1')).toBe(false);
    expect(serverEmit).toHaveBeenCalledWith('player.left', { shipId: `${USERID}:2` });
  });

  it('still clears the dead shipno and lands the captain at ship entry', async () => {
    const sock = makeSocket();
    const { gateway } = build(sock);

    await die(gateway);

    expect(sock.data.activeShipNo).toBeUndefined();
    // No hulls left, so ship entry means onboarding.
    expect(sock.emit.mock.calls.map((c) => c[0] as string)).toContain('prompt:ship-name');
  });
});
