/**
 * P-001: Anti-rage-quit combat-disconnect kill.
 *
 * When a player disconnects while combat-locked (cantexit > 0) via a CLIENT-SIDE
 * Socket.io reason (transport close, ping timeout, etc.), their ship must be
 * killed (DB row reset to spawn defaults, memory state evicted) — mirroring the
 * handleCombatShipDestroyed path. Server-side disconnects (hot-reload, graceful
 * shutdown) and non-combat-locked disconnects must NOT trigger the kill.
 *
 * @see GEMAIN.C:warhupa (line 1397) — if (cantexit > 0) killem(ship)
 * @see specs/025-combat-depth-persistence/plan.md P-001
 */
import 'reflect-metadata';
import { GameGateway } from '../../src/gateway/game.gateway';
import { ConnectedShipsRegistry } from '../../src/gateway/connected-ships.registry';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { CommandRouterService } from '../../src/game/commands/command-router.service';
import { WsAuthGuard } from '../../src/auth/ws-auth.guard';
import { PrismaService } from '../../src/prisma/prisma.service';
import { OnboardingService } from '../../src/game/onboarding/onboarding.service';
import { ScanHandlerService } from '../../src/game/commands/handlers/scan.handler';
import { mockRandom } from '../fixtures/mock-random';

describe('GameGateway — combat-disconnect kill (P-001)', () => {
  let gateway: GameGateway;
  let serverEmitMock: jest.Mock;
  let updateManyMock: jest.Mock;
  let flushAndUnloadMock: jest.Mock;
  let removeFromGameMock: jest.Mock;
  let getSvcMock: jest.Mock;

  /** Minimal ship state shape — cantexit controlled per-test. */
  const makeShip = (cantexit: number) => ({
    userid: 'user1',
    shipno: 1,
    shipname: 'Defiant',
    shpclass: 3,
    xcoord: 5.7,
    ycoord: 3.2,
    cantexit,
  });

  /** Build a mock Socket with controllable client.data. */
  const makeSocket = (disconnectReason?: string) => {
    const data: Record<string, unknown> = {
      userid: 'user1',
      activeShipNo: 1,
    };
    if (disconnectReason !== undefined) {
      data.disconnectReason = disconnectReason;
    }
    return {
      id: 'sock-1',
      connected: true,
      data,
      emit: jest.fn(),
      on: jest.fn(),
      disconnect: jest.fn(),
      join: jest.fn(),
      leave: jest.fn(),
      broadcast: { emit: jest.fn() },
      handshake: { query: { userid: 'user1' } },
    };
  };

  beforeEach(() => {
    serverEmitMock = jest.fn();
    updateManyMock = jest.fn().mockResolvedValue({ count: 1 });
    flushAndUnloadMock = jest.fn().mockResolvedValue(undefined);
    removeFromGameMock = jest.fn();
    // getSvcMock is replaced per-test to return the desired ship
    getSvcMock = jest.fn();

    const mockShipStateSvc: Partial<ShipStateService> = {
      get: getSvcMock,
      flushAndUnload: flushAndUnloadMock,
      removeFromGame: removeFromGameMock,
      findByUserid: jest.fn().mockReturnValue([]),
    };

    const registry = new ConnectedShipsRegistry(mockShipStateSvc as ShipStateService);

    const mockWsGuard = { validate: jest.fn() } as unknown as WsAuthGuard;
    const mockPrisma = {
      ship: {
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: updateManyMock,
      },
      user: { findUnique: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const mockOnboarding = {
      buildClassListPayload: jest.fn().mockResolvedValue([]),
    } as unknown as OnboardingService;
    const mockScanHandler = { clearScantab: jest.fn() } as unknown as ScanHandlerService;

    gateway = new GameGateway(
      mockShipStateSvc as ShipStateService,
      {} as CommandRouterService,
      registry,
      mockWsGuard,
      mockPrisma,
      mockOnboarding,
      mockScanHandler,
      mockRandom,
    );
    (gateway as unknown as { server: unknown }).server = {
      emit: serverEmitMock,
      sockets: { sockets: { get: jest.fn().mockReturnValue(undefined) } },
    };
  });

  // ------------------------------------------------------------------ //
  // RED tests — these should FAIL before the implementation is in place //
  // ------------------------------------------------------------------ //

  it('kills ship when combat-locked (cantexit>0) and disconnect reason is transport close', () => {
    getSvcMock.mockReturnValue(makeShip(3)); // cantexit = 3 → combat-locked
    const socket = makeSocket('transport close');

    gateway.handleDisconnect(socket as never);

    // DB row must be reset to spawn defaults (same as handleCombatShipDestroyed)
    expect(updateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userid: 'user1', shipno: 1 },
        data: expect.objectContaining({
          damage: 0,
          energy: 65000,
          xcoord: 0.5,
          ycoord: 0.5,
          heading: 0,
          speed: 0,
          where: 0,
        }),
      }),
    );

    // Ship must be evicted from memory
    expect(removeFromGameMock).toHaveBeenCalledWith(
      expect.objectContaining({ userid: 'user1', shipno: 1 }),
    );

    // Normal flush must NOT be called (DB was already reset above)
    expect(flushAndUnloadMock).not.toHaveBeenCalled();
  });

  it('kills ship when combat-locked (cantexit>0) and disconnect reason is ping timeout', () => {
    getSvcMock.mockReturnValue(makeShip(5));
    const socket = makeSocket('ping timeout');

    gateway.handleDisconnect(socket as never);

    expect(updateManyMock).toHaveBeenCalled();
    expect(removeFromGameMock).toHaveBeenCalled();
    expect(flushAndUnloadMock).not.toHaveBeenCalled();
  });

  it('does NOT kill ship when combat-locked but disconnect reason is server namespace disconnect (hot-reload)', () => {
    getSvcMock.mockReturnValue(makeShip(3)); // cantexit = 3 → combat-locked
    const socket = makeSocket('server namespace disconnect');

    gateway.handleDisconnect(socket as never);

    // Kill path must NOT run
    expect(updateManyMock).not.toHaveBeenCalled();
    expect(removeFromGameMock).not.toHaveBeenCalled();

    // Normal flush must run instead
    expect(flushAndUnloadMock).toHaveBeenCalledWith('user1', 1);
  });

  it('does NOT kill ship when NOT combat-locked (cantexit===0) with a client-side disconnect reason', () => {
    getSvcMock.mockReturnValue(makeShip(0)); // cantexit = 0 → normal logout
    const socket = makeSocket('transport close');

    gateway.handleDisconnect(socket as never);

    // Kill path must NOT run
    expect(updateManyMock).not.toHaveBeenCalled();
    expect(removeFromGameMock).not.toHaveBeenCalled();

    // Normal flush must run
    expect(flushAndUnloadMock).toHaveBeenCalledWith('user1', 1);
  });

  it('does NOT kill ship when disconnect reason is undefined (e.g. no prior client.on capture)', () => {
    getSvcMock.mockReturnValue(makeShip(3)); // combat-locked
    const socket = makeSocket(undefined); // no reason captured

    gateway.handleDisconnect(socket as never);

    expect(updateManyMock).not.toHaveBeenCalled();
    expect(removeFromGameMock).not.toHaveBeenCalled();
    expect(flushAndUnloadMock).toHaveBeenCalledWith('user1', 1);
  });
});
