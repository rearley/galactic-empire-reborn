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
import { PresenceService } from '../../src/public/presence.service';

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
    // The real BroadcastOperator: `player.joined` now carries a position only
    // to the arriving sector, so the double has to offer to()/except() too.
    broadcast: {
      emit: jest.fn(),
      to: jest.fn(() => ({ emit: jest.fn() })),
      except: jest.fn(() => ({ emit: jest.fn() })),
    },
  });

  beforeEach(() => {
    serverEmitMock = jest.fn();
    shipStateService = {
      // Seat cap (MAXPLRS) counts live player ships on connect.
      findAllShips: () => [],
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
    gateway = new GameGateway(
      shipStateService as ShipStateService,
      {} as CommandRouterService,
      registry,
      mockWsGuard,
      mockPrisma,
      mockOnboarding,
      mockScanHandler,
      { getTypeName: jest.fn() } as never,
      mockRandom,
      { emit: jest.fn(), on: jest.fn() } as never, new PresenceService(),
    );
    (gateway as unknown as { server: unknown }).server = {
      // handleCombatShipDestroyed also sends YOURDEAD to the victim's own room
      // (GEFUNCS.C:978-987), so the double needs a to().
      // .except() is part of the real Socket.io chain — WARHUP uses it.
      to: jest.fn(() => ({ emit: jest.fn(), except: () => ({ emit: jest.fn() }) })),
      // ANNOUN is a top-level server.except(...) broadcast.
      except: jest.fn(() => ({ emit: jest.fn(), to: () => ({ emit: jest.fn() }) })),
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

  /**
   * A snapshot must not hand out positions the viewer has not earned.
   * @see src/game/ship/sector-visibility.ts
   */
  it('withholds the sector of a player in another part of the galaxy', async () => {
    jest.spyOn(registry, 'list').mockReturnValue([
      { shipId: 'user1:1', name: 'Defiant', sector: { x: 5, y: 3 }, shipClass: 3 },
      { shipId: 'user9:1', name: 'Faraway', sector: { x: -12, y: 40 }, shipClass: 3 },
    ]);
    const socket = makeSocket('sock-1', 'user1');
    await gateway.handleConnection(socket as never);

    const call = (socket.emit.mock.calls as [string, unknown][]).find(([ev]) => ev === 'player.snapshot');
    const payload = call![1] as { players: ConnectedPlayer[] };
    expect(payload.players.find((p) => p.shipId === 'user9:1')?.sector).toBeNull();
    expect(JSON.stringify(payload)).not.toContain('-12');
  });

  it('keeps the sector of a player sharing the viewer\u2019s own', async () => {
    jest.spyOn(registry, 'list').mockReturnValue([
      { shipId: 'user1:1', name: 'Defiant', sector: { x: 5, y: 3 }, shipClass: 3 },
      { shipId: 'user9:1', name: 'Neighbour', sector: { x: 5, y: 3 }, shipClass: 3 },
    ]);
    const socket = makeSocket('sock-1', 'user1');
    await gateway.handleConnection(socket as never);

    const call = (socket.emit.mock.calls as [string, unknown][]).find(([ev]) => ev === 'player.snapshot');
    const payload = call![1] as { players: ConnectedPlayer[] };
    expect(payload.players.find((p) => p.shipId === 'user9:1')?.sector).toEqual({ x: 5, y: 3 });
  });

  it('announces an arrival to the galaxy by name, with a position only to its sector', async () => {
    const socket = makeSocket('sock-1', 'user1');
    await gateway.handleConnection(socket as never);

    // (5.7, 3.2) -> sector 5,3
    expect(socket.broadcast.to).toHaveBeenCalledWith('sector:5:3');
    const scoped = (socket.broadcast.to as jest.Mock).mock.results
      .flatMap((r) => (r.value.emit as jest.Mock).mock.calls)
      .find(([ev]) => ev === 'player.joined');
    expect(scoped?.[1]).toMatchObject({ shipId: 'user1:1', sector: { x: 5, y: 3 } });

    const blind = (socket.broadcast.except as jest.Mock).mock.results
      .flatMap((r) => (r.value.emit as jest.Mock).mock.calls)
      .find(([ev]) => ev === 'player.joined');
    expect(blind?.[1]).toMatchObject({ shipId: 'user1:1', sector: null });
  });

  it('player.snapshot fires before player.joined for the same shipId', async () => {
    const socket = makeSocket('sock-1', 'user1');
    const emitOrder: string[] = [];

    (socket.emit as jest.Mock).mockImplementation((ev: string) => {
      emitOrder.push(`socket:${ev}`);
    });
    // player.joined goes out on client.broadcast.to(...) / .except(...), not
    // server.emit — capture every path into the same order tracker.
    const track = (ev: string) => { emitOrder.push(`server:${ev}`); };
    (socket.broadcast.emit as jest.Mock).mockImplementation(track);
    (socket.broadcast.to as jest.Mock).mockImplementation(() => ({ emit: track }));
    (socket.broadcast.except as jest.Mock).mockImplementation(() => ({ emit: track }));
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
