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
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { WsAuthGuard } from '../../src/auth/ws-auth.guard';
import { PrismaService } from '../../src/prisma/prisma.service';
import { OnboardingService } from '../../src/game/onboarding/onboarding.service';
import { ScanHandlerService } from '../../src/game/commands/handlers/scan.handler';
import { makeGateway } from '../helpers/make-gateway';
import {
  COMBAT_SHIP_DESTROYED,
  CombatShipDestroyedEvent,
} from '../../src/game/combat/combat-events';
import { mockRandom } from '../fixtures/mock-random';
import { PresenceService } from '../../src/public/presence.service';
import type { Mock } from 'vitest';

/** Build a minimal CombatShipDestroyedEvent for testing. */
const makeDestroyedEvent = (victimUserid: string, victimShipno: number): CombatShipDestroyedEvent => ({
  victimId: `${victimUserid}:${victimShipno}`,
  attackerId: null,
  victimShipKey: `${victimUserid}:${victimShipno}`,
  attackerShipKey: null,
  victimUserid,
  attackerUserid: null,
  attackerChannel: 255,
  cause: 'phaser',
  sector: { x: 5, y: 3 },
  tickAt: new Date(),
  loot: [],
  scoreAwarded: 0,
});

describe('GameGateway — handleCombatShipDestroyed: delete hull + decrement noships (P-007 T5)', () => {
  let gateway: GameGateway;
  let deleteManyMock: Mock;
  let userFindUniqueMock: Mock;
  let userUpdateMock: Mock;
  let transactionMock: Mock;
  let removeFromGameMock: Mock;
  let serverEmitMock: Mock;

  /**
   * Build gateway with a configurable noships value.
   * @param victimStatus  optional in-memory status for the victim. When provided,
   *                       shipStateService.get returns a ship with this status
   *                       (1 = USER/player, 2 = AUTO/AI). When omitted, get returns
   *                       undefined (victim already evicted → handler falls back to
   *                       reading the DB row's status via tx.ship.findFirst).
   * @param dbStatus       status returned by the in-transaction findFirst fallback.
   */
  const buildGateway = (noships: number, deletedCount = 1, victimStatus?: number, dbStatus = 1) => {
    serverEmitMock = vi.fn();
    deleteManyMock = vi.fn().mockResolvedValue({ count: deletedCount });
    userFindUniqueMock = vi.fn().mockResolvedValue({ noships });
    userUpdateMock = vi.fn().mockResolvedValue(undefined);
    removeFromGameMock = vi.fn();

    // $transaction callback form — passes a tx proxy to the callback
    const txMock = {
      ship: {
        deleteMany: deleteManyMock,
        findFirst: vi.fn().mockResolvedValue({ status: dbStatus }),
      },
      user: { findUnique: userFindUniqueMock, update: userUpdateMock },
    };
    transactionMock = vi.fn().mockImplementation(
      (fn: (tx: typeof txMock) => Promise<void>) => fn(txMock),
    );

    const mockPrisma = {
      ship: {
        findFirst: vi.fn().mockResolvedValue(null),
        updateMany: vi.fn(),
      },
      user: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: transactionMock,
    } as unknown as PrismaService;

    const mockShipStateSvc: Partial<ShipStateService> = {
      get: vi.fn().mockReturnValue(victimStatus !== undefined ? { status: victimStatus } : undefined),
      flushAndUnload: vi.fn().mockResolvedValue(undefined),
      unboard: vi.fn().mockResolvedValue(undefined),
      board: vi.fn(),
      removeFromGame: removeFromGameMock,
      findAllShips: vi.fn().mockReturnValue([]),
      findByUserid: vi.fn().mockReturnValue([]),
    };

    const mockWsGuard = { validate: vi.fn() } as unknown as WsAuthGuard;
    const mockOnboarding = {
      buildClassListPayload: vi.fn().mockResolvedValue([]),
    } as unknown as OnboardingService;
    const mockScanHandler = { clearScantab: vi.fn() } as unknown as ScanHandlerService;
    const mockEvents = { emit: vi.fn(), on: vi.fn() };

    const gw = makeGateway({
      shipStateService: mockShipStateSvc as ShipStateService,
      wsAuthGuard: mockWsGuard,
      prisma: mockPrisma,
      onboardingService: mockOnboarding,
      scanHandler: mockScanHandler,
      random: mockRandom,
      events: mockEvents as never,
    });
    (gw as unknown as { server: unknown }).server = {
      // handleCombatShipDestroyed also sends YOURDEAD to the victim's own room
      // (GEFUNCS.C:978-987), so the double needs a to().
      to: vi.fn(() => ({ emit: vi.fn() })),
      // Canon's DIED goes out with except(victim) — GEFUNCS.C:1263.
      except: vi.fn(() => ({ emit: vi.fn() })),
      emit: serverEmitMock,
      sockets: { sockets: { get: vi.fn().mockReturnValue(undefined) } },
    };
    return gw;
  };

  // ------------------------------------------------------------------ //
  // Core: delete row + decrement noships                                //
  // ------------------------------------------------------------------ //

  it('death DELETES the ship row and decrements noships', async () => {
    gateway = buildGateway(2); // victim owns 2 ships
    const event = makeDestroyedEvent('user1', 1);

    await gateway.handleCombatShipDestroyed(event);
    // Let the void transaction resolve
    // Flush enough microtasks for the void $transaction chain (status read →
    // deleteMany → findUnique → update) to settle.
    for (let i = 0; i < 8; i++) await Promise.resolve();

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

  it('logs the destruction so a vanished player ship is diagnosable server-side', async () => {
    // Two player ships were lost during playtesting and left no server-side
    // trace at all: the hull row was deleted and noships decremented in
    // silence, so there was no way to tell a legitimate combat death from a
    // bug. The victim/attacker line is the record.
    //
    // WARN rather than LOG since 2026-09-08: the line now carries the full
    // manifest of what was lost, and it is what a sysop greps for months later
    // when asked to make someone whole — so it must survive a log level that
    // filters routine chatter. @see test/gateway/ship-loss-forensics.spec.ts
    gateway = buildGateway(1);
    // The manifest is warned by `ShipDestroyedService`'s own logger; the
    // gateway's `@OnEvent` handler is a one-line delegate that logs nothing.
    const service = (gateway as unknown as { shipDestroyed: { logger: { warn: (m: string) => void } } }).shipDestroyed;
    const logSpy = vi.spyOn(service.logger, 'warn');

    await gateway.handleCombatShipDestroyed(makeDestroyedEvent('victim', 1));
    await new Promise((r) => setImmediate(r));

    const logged = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toMatch(/destroy/i);
    expect(logged).toContain('victim');
  });

  it('broadcasts COMBAT_SHIP_DESTROYED galaxy-wide after delete', async () => {
    gateway = buildGateway(1);
    const event = makeDestroyedEvent('user1', 1);

    await gateway.handleCombatShipDestroyed(event);
    // Flush enough microtasks for the void $transaction chain (status read →
    // deleteMany → findUnique → update) to settle.
    for (let i = 0; i < 8; i++) await Promise.resolve();

    expect(serverEmitMock).toHaveBeenCalledWith(
      COMBAT_SHIP_DESTROYED,
      expect.objectContaining({ victimId: 'user1:1' }),
    );
  });

  // ------------------------------------------------------------------ //
  // Multi-ship: only the killed ship is targeted                        //
  // ------------------------------------------------------------------ //

  it('delete targets ONLY the killed shipno — not other ships of the same user', async () => {
    // Victim owns shipno 1 (active, being killed) and shipno 2 (dormant, untouched)
    gateway = buildGateway(2);
    const event = makeDestroyedEvent('user1', 1); // killing shipno 1

    await gateway.handleCombatShipDestroyed(event);
    // Flush enough microtasks for the void $transaction chain (status read →
    // deleteMany → findUnique → update) to settle.
    for (let i = 0; i < 8; i++) await Promise.resolve();

    // deleteMany must specify shipno: 1 — no wildcard, no omitted shipno
    expect(deleteManyMock).toHaveBeenCalledWith({
      where: { userid: 'user1', shipno: 1 },
    });
    expect(deleteManyMock).toHaveBeenCalledTimes(1);
  });

  it('killing shipno 2 targets shipno 2, not shipno 1', async () => {
    gateway = buildGateway(2);
    const event = makeDestroyedEvent('user1', 2); // killing shipno 2

    await gateway.handleCombatShipDestroyed(event);
    // Flush enough microtasks for the void $transaction chain (status read →
    // deleteMany → findUnique → update) to settle.
    for (let i = 0; i < 8; i++) await Promise.resolve();

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

    await gateway.handleCombatShipDestroyed(event);
    // Flush enough microtasks for the void $transaction chain (status read →
    // deleteMany → findUnique → update) to settle.
    for (let i = 0; i < 8; i++) await Promise.resolve();

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

    await gateway.handleCombatShipDestroyed(event);
    // Flush enough microtasks for the void $transaction chain (status read →
    // deleteMany → findUnique → update) to settle.
    for (let i = 0; i < 8; i++) await Promise.resolve();

    // deleteMany was called
    expect(deleteManyMock).toHaveBeenCalledTimes(1);
    // user.update must NOT be called (no row was deleted)
    expect(userUpdateMock).not.toHaveBeenCalled();
  });

  it('removeFromGame is called even when the DB row was already deleted', async () => {
    gateway = buildGateway(0, 0); // row already gone
    const event = makeDestroyedEvent('user1', 1);

    await gateway.handleCombatShipDestroyed(event);
    // Flush enough microtasks for the void $transaction chain (status read →
    // deleteMany → findUnique → update) to settle.
    for (let i = 0; i < 8; i++) await Promise.resolve();

    // Memory eviction should still happen regardless of DB row existence
    expect(removeFromGameMock).toHaveBeenCalledWith({ userid: 'user1', shipno: 1 });
  });

  // ------------------------------------------------------------------ //
  // AI exemption: persistent AI (Cybertron) hulls must NOT be deleted   //
  // and noships must NOT be decremented (P-007 final-review fix 1).      //
  // ------------------------------------------------------------------ //

  it('does NOT delete the hull or decrement noships for a CYBERTRON victim (status AUTO)', async () => {
    // Victim is an AI ship still in memory with status AUTO (2).
    gateway = buildGateway(2, 1, /* victimStatus */ 2);
    const event = makeDestroyedEvent('Cybrg-1', 5);

    await gateway.handleCombatShipDestroyed(event);
    // Flush enough microtasks for the void $transaction chain (status read →
    // deleteMany → findUnique → update) to settle.
    for (let i = 0; i < 8; i++) await Promise.resolve();

    // AI hulls are owned by the Cybertron/Droid layer — the player-death handler
    // must neither delete the row nor touch the fleet counter.
    expect(deleteManyMock).not.toHaveBeenCalled();
    expect(userUpdateMock).not.toHaveBeenCalled();
  });

  it('falls back to the DB row status: AI row (status AUTO) is exempt when evicted from memory', async () => {
    // get → undefined (already evicted), DB findFirst → status AUTO (2).
    gateway = buildGateway(2, 1, /* victimStatus */ undefined, /* dbStatus */ 2);
    const event = makeDestroyedEvent('Cybrg-1', 5);

    await gateway.handleCombatShipDestroyed(event);
    // Flush enough microtasks for the void $transaction chain (status read →
    // deleteMany → findUnique → update) to settle.
    for (let i = 0; i < 8; i++) await Promise.resolve();

    expect(deleteManyMock).not.toHaveBeenCalled();
    expect(userUpdateMock).not.toHaveBeenCalled();
  });

  it('DOES delete + decrement for a PLAYER victim still in memory (status USER)', async () => {
    gateway = buildGateway(2, 1, /* victimStatus */ 1);
    const event = makeDestroyedEvent('user1', 1);

    await gateway.handleCombatShipDestroyed(event);
    // Flush enough microtasks for the void $transaction chain (status read →
    // deleteMany → findUnique → update) to settle.
    for (let i = 0; i < 8; i++) await Promise.resolve();

    expect(deleteManyMock).toHaveBeenCalledWith({ where: { userid: 'user1', shipno: 1 } });
    expect(userUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userid: 'user1' }, data: { noships: { decrement: 1 } } }),
    );
  });
});
