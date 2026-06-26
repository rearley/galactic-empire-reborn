/**
 * P-001: Anti-rage-quit combat-disconnect kill.
 *
 * When a player disconnects while combat-locked (cantexit > 0) via a CLIENT-SIDE
 * Socket.io reason (transport close, ping timeout, etc.), their ship must be
 * killed — COMBAT_SHIP_DESTROYED is emitted (triggering hull DELETE via
 * handleCombatShipDestroyed + PlayerScoreService kill credit). Memory eviction
 * happens inside handleCombatShipDestroyed (synchronous EventEmitter2 dispatch),
 * which is covered by combat-death-delete.spec.ts. Server-side disconnects
 * (hot-reload, graceful shutdown) and non-combat-locked disconnects must NOT
 * trigger the kill.
 *
 * @see GEMAIN.C:warhupa (line 1397) — if (cantexit > 0) killem(ship)
 * @see GEFUNCS.C:killem gepdb(GEDELETE) — dead ships are deleted, not reset
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
import { COMBAT_SHIP_DESTROYED } from '../../src/game/combat/combat-events';
import { mockRandom } from '../fixtures/mock-random';

describe('GameGateway — combat-disconnect kill (P-001)', () => {
  let gateway: GameGateway;
  let serverEmitMock: jest.Mock;
  let updateManyMock: jest.Mock;
  let flushAndUnloadMock: jest.Mock;
  let unboardMock: jest.Mock;
  let removeFromGameMock: jest.Mock;
  let getSvcMock: jest.Mock;
  let findAllShipsMock: jest.Mock;
  let eventsEmitMock: jest.Mock;
  let shipClassFindFirstMock: jest.Mock;

  /** Minimal ship state shape — cantexit controlled per-test. */
  const makeShip = (cantexit: number, lastfired = 255, status = 1) => ({
    userid: 'user1',
    shipno: 1,
    shipname: 'Defiant',
    shpclass: 3,
    xcoord: 5.7,
    ycoord: 3.2,
    cantexit,
    lastfired,
    status,
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
    unboardMock = jest.fn().mockResolvedValue(undefined);
    removeFromGameMock = jest.fn();
    findAllShipsMock = jest.fn().mockReturnValue([]);
    eventsEmitMock = jest.fn();
    shipClassFindFirstMock = jest.fn().mockResolvedValue({ points: 500 });
    // getSvcMock is replaced per-test to return the desired ship
    getSvcMock = jest.fn();

    const mockShipStateSvc: Partial<ShipStateService> = {
      get: getSvcMock,
      flushAndUnload: flushAndUnloadMock,
      unboard: unboardMock,
      removeFromGame: removeFromGameMock,
      findAllShips: findAllShipsMock,
      findByUserid: jest.fn().mockReturnValue([]),
    };

    const registry = new ConnectedShipsRegistry(mockShipStateSvc as ShipStateService);

    const mockWsGuard = { validate: jest.fn() } as unknown as WsAuthGuard;
    const mockPrisma = {
      ship: {
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: updateManyMock,
      },
      shipClass: {
        findFirst: shipClassFindFirstMock,
      },
      user: { findUnique: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const mockOnboarding = {
      buildClassListPayload: jest.fn().mockResolvedValue([]),
    } as unknown as OnboardingService;
    const mockScanHandler = { clearScantab: jest.fn() } as unknown as ScanHandlerService;
    const mockEvents = { emit: eventsEmitMock, on: jest.fn() };

    gateway = new GameGateway(
      mockShipStateSvc as ShipStateService,
      {} as CommandRouterService,
      registry,
      mockWsGuard,
      mockPrisma,
      mockOnboarding,
      mockScanHandler,
      mockRandom,
      mockEvents as never,
    );
    (gateway as unknown as { server: unknown }).server = {
      emit: serverEmitMock,
      sockets: { sockets: { get: jest.fn().mockReturnValue(undefined) } },
    };
  });

  // ------------------------------------------------------------------ //
  // Kill path — COMBAT_SHIP_DESTROYED emitted, memory evicted, no flush //
  // ------------------------------------------------------------------ //

  it('emits COMBAT_SHIP_DESTROYED and evicts ship when combat-locked and disconnect reason is transport close', async () => {
    getSvcMock.mockReturnValue(makeShip(3)); // cantexit = 3 → combat-locked
    const socket = makeSocket('transport close');

    await gateway.handleDisconnect(socket as never);

    // COMBAT_SHIP_DESTROYED must be emitted via EventEmitter2
    expect(eventsEmitMock).toHaveBeenCalledWith(
      COMBAT_SHIP_DESTROYED,
      expect.objectContaining({
        victimUserid: 'user1',
        victimShipKey: 'user1:1',
        weapon: null,
        loot: [],
      }),
    );

    // Memory eviction is done by handleCombatShipDestroyed (synchronous EventEmitter2
    // dispatch). The mocked events.emit does not invoke the handler, so we do not
    // assert removeFromGame here — coverage lives in combat-death-delete.spec.ts.

    // Normal flush must NOT be called (kill path took over)
    expect(flushAndUnloadMock).not.toHaveBeenCalled();
    // Inline updateMany must NOT be called (handler now owns the DB reset)
    expect(updateManyMock).not.toHaveBeenCalled();
  });

  it('emits COMBAT_SHIP_DESTROYED when combat-locked and disconnect reason is ping timeout', async () => {
    getSvcMock.mockReturnValue(makeShip(5));
    const socket = makeSocket('ping timeout');

    await gateway.handleDisconnect(socket as never);

    expect(eventsEmitMock).toHaveBeenCalledWith(
      COMBAT_SHIP_DESTROYED,
      expect.objectContaining({ victimUserid: 'user1' }),
    );
    // removeFromGame is called by handleCombatShipDestroyed (covered in combat-death-delete.spec.ts)
    expect(flushAndUnloadMock).not.toHaveBeenCalled();
    expect(updateManyMock).not.toHaveBeenCalled();
  });

  it('attributes kill to attacker when lastfired matches an active ship', async () => {
    // The victim's lastfired = 7 (attacker channel/shipno)
    getSvcMock.mockReturnValue(makeShip(3, 7));
    // findAllShips returns an active attacker ship with shipno === 7
    findAllShipsMock.mockReturnValue([
      {
        userid: 'attacker-user',
        shipno: 7,
        shipname: 'Raider',
        shpclass: 2,
        xcoord: 5.0,
        ycoord: 3.0,
        status: 1,
      },
    ]);
    const socket = makeSocket('transport close');

    await gateway.handleDisconnect(socket as never);

    expect(eventsEmitMock).toHaveBeenCalledWith(
      COMBAT_SHIP_DESTROYED,
      expect.objectContaining({
        victimUserid: 'user1',
        attackerUserid: 'attacker-user',
        attackerShipKey: 'attacker-user:7',
        scoreAwarded: 500, // from shipClassFindFirstMock
      }),
    );
  });

  it('emits with null attacker when lastfired has no matching active ship', async () => {
    getSvcMock.mockReturnValue(makeShip(3, 42));
    findAllShipsMock.mockReturnValue([]); // no ships → attacker not found
    const socket = makeSocket('transport close');

    await gateway.handleDisconnect(socket as never);

    expect(eventsEmitMock).toHaveBeenCalledWith(
      COMBAT_SHIP_DESTROYED,
      expect.objectContaining({
        victimUserid: 'user1',
        attackerId: null,
        attackerShipKey: null,
        attackerUserid: null,
      }),
    );
    // Kill fires; eviction handled by handleCombatShipDestroyed (see combat-death-delete.spec.ts)
  });

  it('includes scoreAwarded from shipClass lookup', async () => {
    shipClassFindFirstMock.mockResolvedValue({ points: 750 });
    getSvcMock.mockReturnValue(makeShip(3));
    const socket = makeSocket('transport close');

    await gateway.handleDisconnect(socket as never);

    expect(eventsEmitMock).toHaveBeenCalledWith(
      COMBAT_SHIP_DESTROYED,
      expect.objectContaining({ scoreAwarded: 750 }),
    );
  });

  it('uses scoreAwarded=0 when shipClass lookup fails', async () => {
    shipClassFindFirstMock.mockRejectedValue(new Error('DB error'));
    getSvcMock.mockReturnValue(makeShip(3));
    const socket = makeSocket('transport close');

    await gateway.handleDisconnect(socket as never);

    expect(eventsEmitMock).toHaveBeenCalledWith(
      COMBAT_SHIP_DESTROYED,
      expect.objectContaining({ scoreAwarded: 0 }),
    );
    // Kill fires; eviction handled by handleCombatShipDestroyed (see combat-death-delete.spec.ts)
  });

  // ------------------------------------------------------------------ //
  // No-kill path — normal flush, no kill event                          //
  // ------------------------------------------------------------------ //

  it('does NOT kill ship when combat-locked but disconnect reason is server namespace disconnect (hot-reload)', async () => {
    getSvcMock.mockReturnValue(makeShip(3)); // cantexit = 3 → combat-locked
    const socket = makeSocket('server namespace disconnect');

    await gateway.handleDisconnect(socket as never);

    // Kill event must NOT be emitted
    expect(eventsEmitMock).not.toHaveBeenCalledWith(
      COMBAT_SHIP_DESTROYED,
      expect.anything(),
    );
    expect(removeFromGameMock).not.toHaveBeenCalled();
    expect(updateManyMock).not.toHaveBeenCalled();

    // Normal path: unboard (persist AVAIL + flush + evict) must run instead
    expect(unboardMock).toHaveBeenCalledWith('user1', 1);
    expect(flushAndUnloadMock).not.toHaveBeenCalled();
  });

  it('does NOT kill ship when NOT combat-locked (cantexit===0) with a client-side disconnect reason', async () => {
    getSvcMock.mockReturnValue(makeShip(0)); // cantexit = 0 → normal logout
    const socket = makeSocket('transport close');

    await gateway.handleDisconnect(socket as never);

    // Kill event must NOT be emitted
    expect(eventsEmitMock).not.toHaveBeenCalledWith(
      COMBAT_SHIP_DESTROYED,
      expect.anything(),
    );
    expect(removeFromGameMock).not.toHaveBeenCalled();
    expect(updateManyMock).not.toHaveBeenCalled();

    // Normal path: unboard (persist AVAIL + flush + evict) must run
    expect(unboardMock).toHaveBeenCalledWith('user1', 1);
    expect(flushAndUnloadMock).not.toHaveBeenCalled();
  });

  it('does NOT kill ship when disconnect reason is undefined (e.g. no prior client.on capture)', async () => {
    getSvcMock.mockReturnValue(makeShip(3)); // combat-locked
    const socket = makeSocket(undefined); // no reason captured

    await gateway.handleDisconnect(socket as never);

    expect(eventsEmitMock).not.toHaveBeenCalledWith(
      COMBAT_SHIP_DESTROYED,
      expect.anything(),
    );
    expect(removeFromGameMock).not.toHaveBeenCalled();
    expect(updateManyMock).not.toHaveBeenCalled();
    expect(unboardMock).toHaveBeenCalledWith('user1', 1);
    expect(flushAndUnloadMock).not.toHaveBeenCalled();
  });
});
