import 'reflect-metadata';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ScanHandlerService } from '../../src/game/commands/handlers/scan.handler';
import { ShipClassCacheService } from '../../src/game/physics/ship-class-cache.service';
import { ConnectedShipsRegistry } from '../../src/gateway/connected-ships.registry';
import { mockRandom } from '../fixtures/mock-random';
import { makeGateway } from '../helpers/make-gateway';
import type { Mock } from 'vitest';

/**
 * `x` unboards the hull and returns the captain to ship select, but it left
 * the SOCKET exactly where boarding put it: in `sector:x:y` and `user:<id>`,
 * still registered in ConnectedShipsRegistry, still carrying
 * `data.activeShipNo`.
 *
 * So a player sitting at the ship-select screen kept receiving every
 * sector-scoped `event.log` and every galaxy-wide `player.joined` /
 * `player.left` — a live feed of a world they are no longer in, and one they
 * are no longer scoped against: the rooms are the only thing that bounds what
 * a socket may hear, and `x` left them bound to the sector they exited from.
 *
 * Boarding is symmetric (`boardShipAndWelcome` joins, upserts, announces), so
 * leaving must be too: leave the rooms, drop the registration, announce the
 * departure the way a disconnect does.
 */
describe('GameGateway — `x` detaches the socket from the world', () => {
  const USERID = 'u1';

  const makeRow = (shipno: number) => ({
    userid: USERID,
    shipno,
    shipname: `Ship${shipno}`,
    shpclass: 1,
    xcoord: 5.5,
    ycoord: 3.5,
    status: 1,
    items: Array(16).fill(0n),
  });

  const makeSocket = () => {
    const rooms = new Set<string>(['sock-1', `user:${USERID}`, 'sector:5:3']);
    return {
      id: 'sock-1',
      connected: true,
      rooms,
      handshake: { query: { userid: USERID } },
      data: { userid: USERID, activeShipNo: 1 } as Record<string, unknown>,
      emit: vi.fn(),
      on: vi.fn(),
      disconnect: vi.fn(),
      join: vi.fn((room: string) => void rooms.add(room)),
      leave: vi.fn((room: string) => void rooms.delete(room)),
      broadcast: { emit: vi.fn(), to: () => ({ emit: vi.fn() }), except: () => ({ emit: vi.fn() }) },
    };
  };

  const build = () => {
    const shipStateService = {
      findAllShips: () => [],
      findByUserid: () => [],
      get: vi.fn().mockReturnValue({
        userid: USERID, shipno: 1, shipname: 'Ship1', shpclass: 1, xcoord: 5.5, ycoord: 3.5,
      }),
      unboard: vi.fn().mockResolvedValue(undefined),
      hydrate: vi.fn(),
      board: vi.fn(),
    } as unknown as ShipStateService;

    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue({ userid: USERID }) },
      ship: {
        findMany: vi.fn().mockResolvedValue([makeRow(1), makeRow(2)]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
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
      sockets: { sockets: new Map(), adapter: { rooms: new Map() } },
    };
    return { gateway, registry, serverEmit };
  };

  async function exit(
    gateway: ReturnType<typeof build>['gateway'],
    sock: ReturnType<typeof makeSocket>,
  ) {
    const router = (gateway as unknown as { commandRouter: { dispatch: Mock } }).commandRouter;
    router.dispatch.mockReturnValue({ lines: [], exitGame: true });
    gateway.handleCommand(sock as never, { input: 'x' });
    await new Promise((r) => setImmediate(r));
  }

  it('leaves the sector and captain rooms', async () => {
    const { gateway } = build();
    const sock = makeSocket();

    await exit(gateway, sock);

    expect(sock.rooms.has('sector:5:3')).toBe(false);
    expect(sock.rooms.has(`user:${USERID}`)).toBe(false);
    // Its own id room is Socket.io's, not ours — never left.
    expect(sock.rooms.has('sock-1')).toBe(true);
  });

  it('drops the registry entry and announces the departure', async () => {
    const { gateway, registry, serverEmit } = build();
    const sock = makeSocket();
    registry.upsert(`${USERID}:1`, 'sock-1');

    await exit(gateway, sock);

    expect(registry.isBound('sock-1')).toBe(false);
    expect(serverEmit).toHaveBeenCalledWith('player.left', { shipId: `${USERID}:1` });
  });

  it('clears the active ship so nothing addresses the socket as a pilot', async () => {
    const { gateway } = build();
    const sock = makeSocket();

    await exit(gateway, sock);

    expect(sock.data.activeShipNo).toBeUndefined();
  });

  it('empties the roster panel, which has no sector left to scope to', async () => {
    const { gateway } = build();
    const sock = makeSocket();

    await exit(gateway, sock);

    expect(sock.emit).toHaveBeenCalledWith('player.snapshot', { players: [] });
  });

  it('still lands the captain at ship select', async () => {
    const { gateway } = build();
    const sock = makeSocket();

    await exit(gateway, sock);

    expect(sock.emit.mock.calls.map((c) => c[0] as string)).toContain('prompt:ship-select');
  });
});
