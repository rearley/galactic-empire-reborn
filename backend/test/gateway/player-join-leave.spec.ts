import 'reflect-metadata';
import { GameGateway } from '../../src/gateway/game.gateway';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { WsAuthGuard } from '../../src/auth/ws-auth.guard';
import { PrismaService } from '../../src/prisma/prisma.service';
import { OnboardingService } from '../../src/game/onboarding/onboarding.service';
import { ScanHandlerService } from '../../src/game/commands/handlers/scan.handler';
import { mockRandom } from '../fixtures/mock-random';
import { makeGateway } from '../helpers/make-gateway';
import type { Mock } from 'vitest';

/**
 * Verifies player.joined broadcasts after snapshot and player.left fires on disconnect.
 *
 * @see specs/010-react-frontend/contracts/websocket-events.md §2 player.joined §3 player.left
 * @see FR-024, FR-025
 */
describe('GameGateway player.joined / player.left', () => {
  let gateway: GameGateway;
  let serverEmitMock: Mock;

  const shipState = {
    userid: 'user1',
    shipno: 1,
    shipname: 'Defiant',
    shpclass: 3,
    xcoord: 5.7,
    ycoord: 3.2,
  };

  const makeSocket = (id: string, userid = 'user1') => ({
    id,
    connected: true,
    handshake: { query: { userid } },
    data: {} as Record<string, unknown>,
    emit: vi.fn(),
    on: vi.fn(),
    disconnect: vi.fn(),
    join: vi.fn(),
    leave: vi.fn(),
    // gateway emits player.joined via client.broadcast.emit (not server.emit) —
    // route those calls into serverEmitMock so existing assertions match.
    // `player.joined` now goes out twice — with a sector to the arriving
    // sector's room, without one to everyone else — so the double needs the
    // whole BroadcastOperator chain, all of it routed into serverEmitMock.
    broadcast: {
      emit: vi.fn().mockImplementation((...args: unknown[]) => {
        if (serverEmitMock) serverEmitMock(...args);
      }),
      to: vi.fn(() => ({
        emit: (...args: unknown[]) => { if (serverEmitMock) serverEmitMock(...args); },
      })),
      except: vi.fn(() => ({
        emit: (...args: unknown[]) => { if (serverEmitMock) serverEmitMock(...args); },
      })),
    },
  });

  const mockShipStateService = (): Partial<ShipStateService> => ({
    // Seat cap (MAXPLRS) counts live player ships on connect.
    findAllShips: vi.fn().mockReturnValue([]),
    findByUserid: vi.fn().mockReturnValue([shipState]),
    get: vi.fn().mockReturnValue(shipState),
    flushAndUnload: vi.fn().mockResolvedValue(undefined),
    unboard: vi.fn().mockResolvedValue(undefined),
    board: vi.fn(),
  });

  beforeEach(() => {
    serverEmitMock = vi.fn();
    const svc = mockShipStateService();

    const mockWsGuard = {
      validate: vi.fn().mockImplementation(async (socket: { handshake: { query?: { userid?: string } }; data: Record<string, unknown> }) => {
        const userid = socket.handshake.query?.userid ?? 'test-user';
        socket.data.userid = userid;
        return { sub: userid, username: userid };
      }),
    } as unknown as WsAuthGuard;
    const mockPrisma = {
      ship: {
        findMany: vi.fn().mockResolvedValue([{
          userid: 'user1',
          shipno: 1,
          shipname: 'Defiant',
          shpclass: 3,
          xcoord: 5.7,
          ycoord: 3.2,
          items: Array(16).fill(0n),
        }]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    } as unknown as PrismaService;
    const mockOnboarding = { buildClassListPayload: vi.fn().mockResolvedValue([]) } as unknown as OnboardingService;

    const mockScanHandler = { clearScantab: vi.fn() } as unknown as ScanHandlerService;
    gateway = makeGateway({
      shipStateService: svc as ShipStateService,
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
      to: vi.fn(() => ({ emit: vi.fn(), except: () => ({ emit: vi.fn() }) })),
      // ANNOUN is a top-level server.except(...) broadcast.
      except: vi.fn(() => ({ emit: vi.fn(), to: () => ({ emit: vi.fn() }) })),
      emit: serverEmitMock,
      sockets: { sockets: { get: vi.fn().mockReturnValue(undefined) } },
    };
  });

  it('broadcasts player.joined via server.emit after handleConnection (FR-024)', async () => {
    const socket = makeSocket('sock-1');
    await gateway.handleConnection(socket as never);
    expect(serverEmitMock).toHaveBeenCalledWith(
      'player.joined',
      expect.objectContaining({
        shipId: 'user1:1',
        name: 'Defiant',
        shipClass: 3,
      }),
    );
  });

  it('player.joined payload contains sector derived from floor(xcoord), floor(ycoord)', async () => {
    const socket = makeSocket('sock-1');
    await gateway.handleConnection(socket as never);
    const joinedCall = (serverEmitMock.mock.calls as [string, unknown][]).find(
      ([ev]) => ev === 'player.joined',
    );
    expect(joinedCall).toBeDefined();
    const payload = joinedCall![1] as { sector: { x: number; y: number } };
    expect(payload.sector).toEqual({ x: 5, y: 3 }); // floor(5.7)=5, floor(3.2)=3
  });

  it('broadcasts player.left via server.emit on handleDisconnect (FR-025)', async () => {
    const socket = makeSocket('sock-1');
    await gateway.handleConnection(socket as never);
    serverEmitMock.mockClear();

    await gateway.handleDisconnect(socket as never);
    expect(serverEmitMock).toHaveBeenCalledWith('player.left', { shipId: 'user1:1' });
  });

  it('does NOT emit player.left if socket was never registered (no spurious events)', async () => {
    const socket = makeSocket('unknown-sock');
    // Connect and disconnect a socket that never resolved (no valid userid)
    // Directly call handleDisconnect without a prior handleConnection
    await gateway.handleDisconnect(socket as never);
    expect(serverEmitMock).not.toHaveBeenCalledWith('player.left', expect.anything());
  });
});
