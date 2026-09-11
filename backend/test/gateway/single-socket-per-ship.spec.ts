import 'reflect-metadata';
import { GameGateway } from '../../src/gateway/game.gateway';
import { ConnectedShipsRegistry } from '../../src/gateway/connected-ships.registry';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { WsAuthGuard } from '../../src/auth/ws-auth.guard';
import { PrismaService } from '../../src/prisma/prisma.service';
import { OnboardingService } from '../../src/game/onboarding/onboarding.service';
import { ScanHandlerService } from '../../src/game/commands/handlers/scan.handler';
import { mockRandom } from '../fixtures/mock-random';
import { makeGateway } from '../helpers/make-gateway';

/**
 * Verifies the single-socket-per-ship invariant (FR-025a).
 * A second connection for the same shipId must disconnect the first,
 * producing event order: player.left (old) → player.snapshot (new) → player.joined (new).
 *
 * @see specs/010-react-frontend/contracts/websocket-events.md §Event-ordering takeover
 * @see research.md R4 last-write-wins single-socket enforcement
 */
describe('GameGateway single-socket-per-ship invariant', () => {
  let gateway: GameGateway;
  let registry: ConnectedShipsRegistry;
  let serverEmitMock: jest.Mock;
  let emitOrder: string[];

  const shipState = {
    userid: 'user1',
    shipno: 1,
    shipname: 'Defiant',
    shpclass: 3,
    xcoord: 5.7,
    ycoord: 3.2,
  };

  const makeSocket = (id: string, userid = 'user1') => {
    const sock = {
      id,
      connected: true,
      handshake: { query: { userid } },
      data: {} as Record<string, unknown>,
      emit: jest.fn().mockImplementation((ev: string) => {
        emitOrder.push(`socket[${id}]:${ev}`);
      }),
      disconnect: jest.fn().mockImplementation(() => {
        // Simulate socket.io calling handleDisconnect when disconnect(true) is called
        gateway.handleDisconnect(sock as never);
      }),
      on: jest.fn(),
      join: jest.fn(),
      leave: jest.fn(),
      broadcast: {
        // gateway emits player.joined via broadcast (not server.emit), and
        // splits it by sector room; record every path under the server: prefix
        // so existing event-order assertions match.
        emit: jest.fn().mockImplementation((ev: string) => { emitOrder.push(`server:${ev}`); }),
        to: jest.fn(() => ({ emit: (ev: string) => { emitOrder.push(`server:${ev}`); } })),
        except: jest.fn(() => ({ emit: (ev: string) => { emitOrder.push(`server:${ev}`); } })),
      },
    };
    return sock;
  };

  const mockShipStateService = (): Partial<ShipStateService> => ({
    // Seat cap (MAXPLRS) counts live player ships on connect.
    findAllShips: jest.fn().mockReturnValue([]),
    findByUserid: jest.fn().mockReturnValue([shipState]),
    get: jest.fn().mockReturnValue(shipState),
    flushAndUnload: jest.fn().mockResolvedValue(undefined),
    unboard: jest.fn().mockResolvedValue(undefined),
    board: jest.fn(),
  });

  beforeEach(() => {
    emitOrder = [];
    serverEmitMock = jest.fn().mockImplementation((ev: string) => {
      emitOrder.push(`server:${ev}`);
    });

    const svc = mockShipStateService();
    registry = new ConnectedShipsRegistry(svc as ShipStateService);

    const mockWsGuard = {
      validate: jest.fn().mockImplementation(async (socket: { handshake: { query?: { userid?: string } }; data: Record<string, unknown> }) => {
        const userid = socket.handshake.query?.userid ?? 'test-user';
        socket.data.userid = userid;
        return { sub: userid, username: userid };
      }),
    } as unknown as WsAuthGuard;
    const mockPrisma = {
      ship: {
        findMany: jest.fn().mockResolvedValue([{
          userid: 'user1',
          shipno: 1,
          shipname: 'Defiant',
          shpclass: 3,
          xcoord: 5.7,
          ycoord: 3.2,
          items: Array(16).fill(0n),
        }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    } as unknown as PrismaService;
    const mockOnboarding = { buildClassListPayload: jest.fn().mockResolvedValue([]) } as unknown as OnboardingService;

    const mockScanHandler = { clearScantab: jest.fn() } as unknown as ScanHandlerService;
    gateway = makeGateway({
      shipStateService: svc as ShipStateService,
      registry,
      wsAuthGuard: mockWsGuard,
      prisma: mockPrisma,
      onboardingService: mockOnboarding,
      scanHandler: mockScanHandler,
      random: mockRandom,
    });
    (gateway as unknown as { server: unknown }).server = {
      // handleCombatShipDestroyed also sends YOURDEAD to the victim's own room
      // (GEFUNCS.C:978-987), so the double needs a to().
      // .except() is part of the real Socket.io chain — WARHUP uses it.
      to: jest.fn(() => ({ emit: jest.fn(), except: () => ({ emit: jest.fn() }) })),
      // ANNOUN is a top-level server.except(...) broadcast.
      except: jest.fn(() => ({ emit: jest.fn(), to: () => ({ emit: jest.fn() }) })),
      emit: serverEmitMock,
      sockets: {
        sockets: {
          get: jest.fn().mockImplementation((id: string) =>
            id === 'sock-1' ? sock1 : undefined,
          ),
        },
      },
    };
    // Need a reference for the get mock — we'll set it up in the test
  });

  let sock1: ReturnType<typeof makeSocket>;

  it('second connection disconnects the first socket', async () => {
    sock1 = makeSocket('sock-1');
    const sock2 = makeSocket('sock-2');

    await gateway.handleConnection(sock1 as never);
    await gateway.handleConnection(sock2 as never);

    expect(sock1.disconnect).toHaveBeenCalledWith(true);
  });

  it('event order: player.left (old) → player.snapshot (new) → player.joined (new)', async () => {
    sock1 = makeSocket('sock-1');
    const sock2 = makeSocket('sock-2');

    await gateway.handleConnection(sock1 as never);
    emitOrder = []; // reset after first connection setup
    serverEmitMock.mockClear();
    serverEmitMock.mockImplementation((ev: string) => {
      emitOrder.push(`server:${ev}`);
    });

    await gateway.handleConnection(sock2 as never);

    const leftIdx = emitOrder.indexOf('server:player.left');
    const snapshotIdx = emitOrder.findIndex((e) => e.includes('player.snapshot'));
    const joinedIdx = emitOrder.indexOf('server:player.joined');

    expect(leftIdx).toBeGreaterThanOrEqual(0);
    expect(snapshotIdx).toBeGreaterThanOrEqual(0);
    expect(joinedIdx).toBeGreaterThanOrEqual(0);
    expect(leftIdx).toBeLessThan(snapshotIdx);
    expect(snapshotIdx).toBeLessThan(joinedIdx);
  });

  it('player-list never holds two entries for the same shipId after takeover', async () => {
    sock1 = makeSocket('sock-1');
    const sock2 = makeSocket('sock-2');

    await gateway.handleConnection(sock1 as never);
    await gateway.handleConnection(sock2 as never);

    const players = registry.list();
    const ids = players.map((p) => p.shipId);
    const deduped = [...new Set(ids)];
    expect(ids).toHaveLength(deduped.length);
  });
});
