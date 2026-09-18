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
import { WsAuthGuard } from '../../src/auth/ws-auth.guard';
import { PrismaService } from '../../src/prisma/prisma.service';
import { OnboardingService } from '../../src/game/onboarding/onboarding.service';
import { ScanHandlerService } from '../../src/game/commands/handlers/scan.handler';
import { ShipClassCacheService } from '../../src/game/physics/ship-class-cache.service';
import { COMBAT_SHIP_DESTROYED } from '../../src/game/combat/combat-events';
import { mockRandom } from '../fixtures/mock-random';
import { makeGateway } from '../helpers/make-gateway';
import type { Mock } from 'vitest';

describe('GameGateway — combat-disconnect kill (P-001)', () => {
  let gateway: GameGateway;
  let registry: ConnectedShipsRegistry;
  let serverEmitMock: Mock;
  let updateManyMock: Mock;
  let flushAndUnloadMock: Mock;
  let unboardMock: Mock;
  let removeFromGameMock: Mock;
  let getSvcMock: Mock;
  let findAllShipsMock: Mock;
  let eventsEmitMock: Mock;
  let shipClassFindFirstMock: Mock;

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
    channel: 4,
    // An empty hold: the canon cargo transfer (GEFUNCS.C:1122-1136) now runs on
    // this path too, so the victim needs the field it reads.
    items: new Array<bigint>(14).fill(0n),
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
      emit: vi.fn(),
      on: vi.fn(),
      disconnect: vi.fn(),
      join: vi.fn(),
      leave: vi.fn(),
      broadcast: { emit: vi.fn() },
      handshake: { query: { userid: 'user1' } },
    };
  };

  beforeEach(() => {
    serverEmitMock = vi.fn();
    updateManyMock = vi.fn().mockResolvedValue({ count: 1 });
    flushAndUnloadMock = vi.fn().mockResolvedValue(undefined);
    unboardMock = vi.fn().mockResolvedValue(undefined);
    removeFromGameMock = vi.fn();
    findAllShipsMock = vi.fn().mockReturnValue([]);
    eventsEmitMock = vi.fn();
    shipClassFindFirstMock = vi.fn().mockResolvedValue({ points: 500 });
    // getSvcMock is replaced per-test to return the desired ship
    getSvcMock = vi.fn();

    const mockShipStateSvc: Partial<ShipStateService> = {
      get: getSvcMock,
      flushAndUnload: flushAndUnloadMock,
      unboard: unboardMock,
      removeFromGame: removeFromGameMock,
      findAllShips: findAllShipsMock,
      findByUserid: vi.fn().mockReturnValue([]),
      mutate: vi.fn() as never,
    };

    registry = new ConnectedShipsRegistry(mockShipStateSvc as ShipStateService);

    const mockWsGuard = { validate: vi.fn() } as unknown as WsAuthGuard;
    const mockPrisma = {
      ship: {
        findFirst: vi.fn().mockResolvedValue(null),
        updateMany: updateManyMock,
      },
      shipClass: {
        findFirst: shipClassFindFirstMock,
      },
      user: { findUnique: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const mockOnboarding = {
      buildClassListPayload: vi.fn().mockResolvedValue([]),
    } as unknown as OnboardingService;
    const mockScanHandler = { clearScantab: vi.fn() } as unknown as ScanHandlerService;
    const mockEvents = { emit: eventsEmitMock, on: vi.fn() };

    gateway = makeGateway({
      shipStateService: mockShipStateSvc as ShipStateService,
      registry,
      wsAuthGuard: mockWsGuard,
      prisma: mockPrisma,
      onboardingService: mockOnboarding,
      scanHandler: mockScanHandler,
      shipClassCache: { getTypeName: vi.fn(), getMaxTons: vi.fn().mockReturnValue(5000) } as unknown as ShipClassCacheService,
      random: mockRandom,
      events: mockEvents as never,
    });
    (gateway as unknown as { server: unknown }).server = { to: () => ({ emit: () => undefined, except: () => ({ emit: () => undefined }) }), except: () => ({ emit: () => undefined, to: () => ({ emit: () => undefined }) }), emit: serverEmitMock,
      sockets: { sockets: { get: vi.fn().mockReturnValue(undefined) } },
    };

    // Default: this socket ('sock-1') is the registered owner of the ship, as it
    // would be in the real connection flow (upsert on board, remove on disconnect).
    registry.upsert('user1:1', 'sock-1');
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
        cause: null,
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
    // The victim's lastfired = 7 — the attacker's CHANNEL, not its shipno.
    getSvcMock.mockReturnValue(makeShip(3, 7));
    // findAllShips returns an active attacker ship holding channel 7.
    findAllShipsMock.mockReturnValue([
      {
        userid: 'attacker-user',
        shipno: 7,
        channel: 7,
        shipname: 'Raider',
        shpclass: 2,
        kills: 0,
        items: new Array<bigint>(14).fill(0n),
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

  // ------------------------------------------------------------------ //
  // Session-replacement guard (P-007 final-review fix 2): a stale       //
  // socket whose ship was taken over by a newer socket must NOT unboard //
  // the ship the new socket is actively flying.                         //
  // ------------------------------------------------------------------ //

  it('does NOT unboard when a newer socket has taken over the ship', async () => {
    getSvcMock.mockReturnValue(makeShip(0)); // not combat-locked → normal (non-kill) path
    const socket = makeSocket('transport close'); // client-side reason, but cantexit=0 → no kill
    // A newer socket 'sock-2' has displaced 'sock-1' as the registered owner.
    registry.upsert('user1:1', 'sock-2');

    await gateway.handleDisconnect(socket as never); // socket.id === 'sock-1' (stale)

    // The ship belongs to the live new socket — the stale socket must not evict it.
    expect(unboardMock).not.toHaveBeenCalled();
  });

  it('DOES unboard when this socket still owns the ship (normal single-socket disconnect)', async () => {
    getSvcMock.mockReturnValue(makeShip(0));
    const socket = makeSocket('transport close');
    // 'sock-1' is the owner (set in beforeEach) — normal logout.

    await gateway.handleDisconnect(socket as never);

    expect(unboardMock).toHaveBeenCalledWith('user1', 1);
  });
});
