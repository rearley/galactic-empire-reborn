/**
 * P-007 T5 / P-013 / P-014: Ship death deletes the hull row and decrements noships.
 *
 * handleCombatShipDestroyed must:
 *  - deleteMany the ship row (safe no-op if already gone)
 *  - decrement User.noships only when the row was actually deleted AND noships > 0
 *  - call removeFromGame so the in-memory state is evicted
 *  - target ONLY the killed ship's shipno (no other ships of the same user touched)
 *
 * Both death paths funnel through this handler:
 *  - combat tick: CombatTickService emits COMBAT_SHIP_DESTROYED → handler
 *  - client-disconnect kill (P-001): handleDisconnect emits COMBAT_SHIP_DESTROYED → handler
 *
 * @see specs/030-multi-ship/tasks.md Task 5
 * @see GEFUNCS.C:killem — dead ships are removed from the active world
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
import {
  COMBAT_SHIP_DESTROYED,
  CombatShipDestroyedEvent,
} from '../../src/game/combat/combat-events';
import { mockRandom } from '../fixtures/mock-random';

/** Build a minimal CombatShipDestroyedEvent for testing. */
const makeDestroyedEvent = (victimUserid: string, victimShipno: number): CombatShipDestroyedEvent => ({
  victimId: `${victimUserid}:${victimShipno}`,
  attackerId: null,
  victimShipKey: `${victimUserid}:${victimShipno}`,
  attackerShipKey: null,
  victimUserid,
  attackerUserid: null,
  attackerChannel: 255,
  weapon: 'phaser',
  sector: { x: 5, y: 3 },
  tickAt: new Date(),
  loot: [],
  scoreAwarded: 0,
});

describe('GameGateway — handleCombatShipDestroyed: delete hull + decrement noships (P-007 T5)', () => {
  let gateway: GameGateway;
  let deleteManyMock: jest.Mock;
  let userFindUniqueMock: jest.Mock;
  let userUpdateMock: jest.Mock;
  let transactionMock: jest.Mock;
  let removeFromGameMock: jest.Mock;
  let serverEmitMock: jest.Mock;

  /** Build gateway with a configurable noships value. */
  const buildGateway = (noships: number, deletedCount = 1) => {
    serverEmitMock = jest.fn();
    deleteManyMock = jest.fn().mockResolvedValue({ count: deletedCount });
    userFindUniqueMock = jest.fn().mockResolvedValue({ noships });
    userUpdateMock = jest.fn().mockResolvedValue(undefined);
    removeFromGameMock = jest.fn();

    // $transaction callback form — passes a tx proxy to the callback
    const txMock = {
      ship: { deleteMany: deleteManyMock },
      user: { findUnique: userFindUniqueMock, update: userUpdateMock },
    };
    transactionMock = jest.fn().mockImplementation(
      (fn: (tx: typeof txMock) => Promise<void>) => fn(txMock),
    );

    const mockPrisma = {
      ship: {
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn(),
      },
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: transactionMock,
    } as unknown as PrismaService;

    const mockShipStateSvc: Partial<ShipStateService> = {
      get: jest.fn().mockReturnValue(undefined),
      flushAndUnload: jest.fn().mockResolvedValue(undefined),
      unboard: jest.fn().mockResolvedValue(undefined),
      board: jest.fn(),
      removeFromGame: removeFromGameMock,
      findAllShips: jest.fn().mockReturnValue([]),
      findByUserid: jest.fn().mockReturnValue([]),
    };

    const registry = new ConnectedShipsRegistry(mockShipStateSvc as ShipStateService);
    const mockWsGuard = { validate: jest.fn() } as unknown as WsAuthGuard;
    const mockOnboarding = {
      buildClassListPayload: jest.fn().mockResolvedValue([]),
    } as unknown as OnboardingService;
    const mockScanHandler = { clearScantab: jest.fn() } as unknown as ScanHandlerService;
    const mockEvents = { emit: jest.fn(), on: jest.fn() };

    const gw = new GameGateway(
      mockShipStateSvc as ShipStateService,
      {} as CommandRouterService,
      registry,
      mockWsGuard,
      mockPrisma,
      mockOnboarding,
      mockScanHandler,
      { getTypeName: jest.fn() } as never,
      mockRandom,
      mockEvents as never,
    );
    (gw as unknown as { server: unknown }).server = {
      emit: serverEmitMock,
      sockets: { sockets: { get: jest.fn().mockReturnValue(undefined) } },
    };
    return gw;
  };

  // ------------------------------------------------------------------ //
  // Core: delete row + decrement noships                                //
  // ------------------------------------------------------------------ //

  it('death DELETES the ship row and decrements noships', async () => {
    gateway = buildGateway(2); // victim owns 2 ships
    const event = makeDestroyedEvent('user1', 1);

    gateway.handleCombatShipDestroyed(event);
    // Let the void transaction resolve
    await Promise.resolve();
    await Promise.resolve();

    // ship.deleteMany must target the exact (userid, shipno)
    expect(deleteManyMock).toHaveBeenCalledWith({
      where: { userid: 'user1', shipno: 1 },
    });

    // user.update must decrement noships by 1
    expect(userUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userid: 'user1' },
        data: { noships: { decrement: 1 } },
      }),
    );

    // removeFromGame must evict the ship from memory
    expect(removeFromGameMock).toHaveBeenCalledWith({ userid: 'user1', shipno: 1 });
  });

  it('broadcasts COMBAT_SHIP_DESTROYED galaxy-wide after delete', async () => {
    gateway = buildGateway(1);
    const event = makeDestroyedEvent('user1', 1);

    gateway.handleCombatShipDestroyed(event);
    await Promise.resolve();
    await Promise.resolve();

    expect(serverEmitMock).toHaveBeenCalledWith(
      COMBAT_SHIP_DESTROYED,
      expect.objectContaining({ victimUserid: 'user1' }),
    );
  });

  // ------------------------------------------------------------------ //
  // Multi-ship: only the killed ship is targeted                        //
  // ------------------------------------------------------------------ //

  it('delete targets ONLY the killed shipno — not other ships of the same user', async () => {
    // Victim owns shipno 1 (active, being killed) and shipno 2 (dormant, untouched)
    gateway = buildGateway(2);
    const event = makeDestroyedEvent('user1', 1); // killing shipno 1

    gateway.handleCombatShipDestroyed(event);
    await Promise.resolve();
    await Promise.resolve();

    // deleteMany must specify shipno: 1 — no wildcard, no omitted shipno
    expect(deleteManyMock).toHaveBeenCalledWith({
      where: { userid: 'user1', shipno: 1 },
    });
    expect(deleteManyMock).toHaveBeenCalledTimes(1);
  });

  it('killing shipno 2 targets shipno 2, not shipno 1', async () => {
    gateway = buildGateway(2);
    const event = makeDestroyedEvent('user1', 2); // killing shipno 2

    gateway.handleCombatShipDestroyed(event);
    await Promise.resolve();
    await Promise.resolve();

    expect(deleteManyMock).toHaveBeenCalledWith({
      where: { userid: 'user1', shipno: 2 },
    });
  });

  // ------------------------------------------------------------------ //
  // Underflow guard: noships must never go below 0                      //
  // ------------------------------------------------------------------ //

  it('does NOT decrement noships below 0 when noships is already 0', async () => {
    gateway = buildGateway(0); // noships already 0 (stale state / race)
    const event = makeDestroyedEvent('user1', 1);

    gateway.handleCombatShipDestroyed(event);
    await Promise.resolve();
    await Promise.resolve();

    // user.update must NOT be called at all — skip the no-op write
    // (underflow guard: noships is 0, so we skip issuing decrement: 0 to avoid a pointless DB write)
    expect(userUpdateMock).not.toHaveBeenCalled();
  });

  // ------------------------------------------------------------------ //
  // Delete-not-found safety: if the row is already gone, no decrement   //
  // ------------------------------------------------------------------ //

  it('does NOT decrement noships when deleteMany returns count=0 (row already gone)', async () => {
    gateway = buildGateway(1, 0); // deletedCount = 0 → row not found
    const event = makeDestroyedEvent('user1', 1);

    gateway.handleCombatShipDestroyed(event);
    await Promise.resolve();
    await Promise.resolve();

    // deleteMany was called
    expect(deleteManyMock).toHaveBeenCalledTimes(1);
    // user.update must NOT be called (no row was deleted)
    expect(userUpdateMock).not.toHaveBeenCalled();
  });

  it('removeFromGame is called even when the DB row was already deleted', async () => {
    gateway = buildGateway(0, 0); // row already gone
    const event = makeDestroyedEvent('user1', 1);

    gateway.handleCombatShipDestroyed(event);
    await Promise.resolve();
    await Promise.resolve();

    // Memory eviction should still happen regardless of DB row existence
    expect(removeFromGameMock).toHaveBeenCalledWith({ userid: 'user1', shipno: 1 });
  });
});
