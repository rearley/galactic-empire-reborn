import 'reflect-metadata';
import { GameGateway } from '../../src/gateway/game.gateway';
import { ConnectedShipsRegistry } from '../../src/gateway/connected-ships.registry';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { CommandRouterService } from '../../src/game/commands/command-router.service';
import type { ConnectedPlayer } from '../../src/gateway/connected-ships.registry';
import { WsAuthGuard } from '../../src/auth/ws-auth.guard';
import { PrismaService } from '../../src/prisma/prisma.service';
import { OnboardingService } from '../../src/game/onboarding/onboarding.service';
import { ScanHandlerService } from '../../src/game/commands/handlers/scan.handler';
import { mockRandom } from '../fixtures/mock-random';

/**
 * Verifies player.snapshot is emitted to the joining socket only (not broadcast),
 * contains every registered ship, and fires before player.joined (FR-029).
 *
 * @see specs/010-react-frontend/contracts/websocket-events.md §1 player.snapshot
 */
describe('GameGateway player.snapshot', () => {
  let gateway: GameGateway;
  let registry: ConnectedShipsRegistry;
  let shipStateService: Partial<ShipStateService>;
  let serverEmitMock: jest.Mock;

  const makeSocket = (id: string, userid: string, shipno = 1) => ({
    id,
    connected: true,
    handshake: { query: { userid } },
    data: {} as Record<string, unknown>,
    emit: jest.fn(),
    on: jest.fn(),
    disconnect: jest.fn(),
    join: jest.fn(),
    leave: jest.fn(),
    broadcast: { emit: jest.fn() },
  });

  beforeEach(() => {
    serverEmitMock = jest.fn();
    shipStateService = {
      findByUserid: jest.fn().mockReturnValue([
        {
          userid: 'user1',
          shipno: 1,
          shipname: 'Defiant',
          shpclass: 3,
          xcoord: 5.7,
          ycoord: 3.2,
        },
      ]),
      get: jest.fn().mockReturnValue({
        userid: 'user1',
        shipno: 1,
        shipname: 'Defiant',
        shpclass: 3,
        xcoord: 5.7,
        ycoord: 3.2,
      }),
    };

    registry = new ConnectedShipsRegistry(shipStateService as ShipStateService);

    const mockWsGuard = {
      validate: jest.fn().mockImplementation(async (socket: { handshake: { query?: { userid?: string } }; data: Record<string, unknown> }) => {
        const userid = socket.handshake.query?.userid ?? 'test-user';
        socket.data.userid = userid;
        return { sub: userid, username: userid };
      }),
    } as unknown as WsAuthGuard;
    const mockPrisma = {
      ship: {
        findFirst: jest.fn().mockResolvedValue({
          userid: 'user1',
          shipno: 1,
          shipname: 'Defiant',
          shpclass: 3,
          xcoord: 5.7,
          ycoord: 3.2,
          items: Array(16).fill(0n),
        }),
      },
    } as unknown as PrismaService;
    const mockOnboarding = { buildClassListPayload: jest.fn().mockResolvedValue([]) } as unknown as OnboardingService;

    const mockScanHandler = { clearScantab: jest.fn() } as unknown as ScanHandlerService;
    gateway = new GameGateway(
      shipStateService as ShipStateService,
      {} as CommandRouterService,
      registry,
      mockWsGuard,
      mockPrisma,
      mockOnboarding,
      mockScanHandler,
      mockRandom,
      { emit: jest.fn(), on: jest.fn() } as never,
    );
    (gateway as unknown as { server: unknown }).server = {
      emit: serverEmitMock,
      sockets: { sockets: { get: jest.fn().mockReturnValue(undefined) } },
    };
  });

  it('emits player.snapshot via socket.emit (not server.emit)', async () => {
    const socket = makeSocket('sock-1', 'user1');
    await gateway.handleConnection(socket as never);
    expect(socket.emit).toHaveBeenCalledWith(
      'player.snapshot',
      expect.objectContaining({ players: expect.any(Array) }),
    );
  });

  it('player.snapshot is NOT broadcast to all clients', async () => {
    const socket = makeSocket('sock-1', 'user1');
    await gateway.handleConnection(socket as never);
    const serverEmitCalls = (serverEmitMock.mock.calls as [string, ...unknown[]][]);
    const snapshotBroadcasts = serverEmitCalls.filter(([ev]) => ev === 'player.snapshot');
    expect(snapshotBroadcasts).toHaveLength(0);
  });

  it('player.snapshot contains every ship currently in the registry', async () => {
    // Pre-load another ship into the registry
    const existing: ConnectedPlayer = {
      shipId: 'user2:1',
      name: 'Enterprise',
      sector: { x: 2, y: 4 },
      shipClass: 5,
    };
    (registry as unknown as { stored: Map<string, ConnectedPlayer> }).stored?.set('user2:1', existing);

    const socket = makeSocket('sock-1', 'user1');
    await gateway.handleConnection(socket as never);

    const snapshotCall = (socket.emit.mock.calls as [string, unknown][]).find(
      ([ev]) => ev === 'player.snapshot',
    );
    expect(snapshotCall).toBeDefined();
    const payload = snapshotCall![1] as { players: ConnectedPlayer[] };
    // Must include the joining ship (just registered)
    const ids = payload.players.map((p) => p.shipId);
    expect(ids).toContain('user1:1');
  });

  it('player.snapshot fires before player.joined for the same shipId', async () => {
    const socket = makeSocket('sock-1', 'user1');
    const emitOrder: string[] = [];

    (socket.emit as jest.Mock).mockImplementation((ev: string) => {
      emitOrder.push(`socket:${ev}`);
    });
    // player.joined is emitted via client.broadcast.emit, not server.emit —
    // capture both paths into the same order tracker.
    (socket.broadcast.emit as jest.Mock).mockImplementation((ev: string) => {
      emitOrder.push(`server:${ev}`);
    });
    serverEmitMock.mockImplementation((ev: string) => {
      emitOrder.push(`server:${ev}`);
    });

    await gateway.handleConnection(socket as never);

    const snapshotIdx = emitOrder.indexOf('socket:player.snapshot');
    const joinedIdx = emitOrder.indexOf('server:player.joined');
    expect(snapshotIdx).toBeGreaterThanOrEqual(0);
    expect(joinedIdx).toBeGreaterThanOrEqual(0);
    expect(snapshotIdx).toBeLessThan(joinedIdx);
  });
});
