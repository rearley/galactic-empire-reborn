/**
 * Disconnect (rage-quit) kill must be resolved EXACTLY like any other death.
 *
 * Canon: GEMAIN.C:1420 `warhupa` calls the same `killem()` as `checkdam`, and
 * `killem`'s cargo loop (GEFUNCS.C:1122-1136) and its
 * `prfmsg(KILLEDBY,username(ptr),username(wptr))` (GEFUNCS.C:1116) are
 * unconditional on how the victim died. The port hand-built the event on the
 * disconnect path and shipped `loot: []` with no `attackerName`, so a
 * disconnect kill paid no cargo and the ship-loss mail read "an unknown
 * assailant" — the one case that mail exists for.
 */
import 'reflect-metadata';
import { GameGateway } from '../../src/gateway/game.gateway';
import { ConnectedShipsRegistry } from '../../src/gateway/connected-ships.registry';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { WsAuthGuard } from '../../src/auth/ws-auth.guard';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ScanHandlerService } from '../../src/game/commands/handlers/scan.handler';
import { ShipClassCacheService } from '../../src/game/physics/ship-class-cache.service';
import { Random } from '../../src/game/combat/random.port';
import { COMBAT_SHIP_DESTROYED } from '../../src/game/combat/combat-events';
import { I_MEN, I_TROOPS, NUMITEMS } from '../../src/game/constants/items';
import { makeGateway } from '../helpers/make-gateway';
import type { Mock } from 'vitest';

const I_FOOD = 1;

describe('GameGateway — disconnect kill awards spoils (canon killem)', () => {
  let gateway: GameGateway;
  let registry: ConnectedShipsRegistry;
  let eventsEmitMock: Mock;
  let mutateMock: Mock;
  let findAllShipsMock: Mock;
  let getSvcMock: Mock;

  const items = (over: Record<number, bigint> = {}): bigint[] => {
    const arr = new Array<bigint>(NUMITEMS).fill(0n);
    for (const [k, v] of Object.entries(over)) arr[Number(k)] = v;
    return arr;
  };

  const victim = () => ({
    userid: 'user1',
    shipno: 1,
    shipname: 'Defiant',
    shpclass: 3,
    xcoord: 5.7,
    ycoord: 3.2,
    cantexit: 3,
    lastfired: 7,
    status: 1,
    channel: 4,
    items: items({ [I_MEN]: 500n, [I_FOOD]: 100n, [I_TROOPS]: 40n }),
  });

  const attacker = () => ({
    userid: 'Cybrg-2',
    shipno: 2,
    channel: 7,
    shipname: 'Trans-Gal #2128',
    shpclass: 21,
    xcoord: 5.0,
    ycoord: 3.0,
    status: 2,
    kills: 0,
    items: items(),
  });

  const makeSocket = () => ({
    id: 'sock-1',
    connected: true,
    data: { userid: 'user1', activeShipNo: 1, disconnectReason: 'transport close' },
    emit: vi.fn(),
    on: vi.fn(),
    disconnect: vi.fn(),
    join: vi.fn(),
    leave: vi.fn(),
    broadcast: { emit: vi.fn() },
    handshake: { query: { userid: 'user1' } },
  });

  beforeEach(() => {
    eventsEmitMock = vi.fn();
    mutateMock = vi.fn();
    getSvcMock = vi.fn().mockReturnValue(victim());
    findAllShipsMock = vi.fn().mockReturnValue([attacker()]);

    const mockShipStateSvc: Partial<ShipStateService> = {
      get: getSvcMock,
      flushAndUnload: vi.fn().mockResolvedValue(undefined),
      unboard: vi.fn().mockResolvedValue(undefined),
      removeFromGame: vi.fn(),
      findAllShips: findAllShipsMock,
      findByUserid: vi.fn().mockReturnValue([]),
      mutate: mutateMock as never,
    };

    registry = new ConnectedShipsRegistry(mockShipStateSvc as ShipStateService);

    const mockPrisma = {
      ship: { findFirst: vi.fn().mockResolvedValue(null), updateMany: vi.fn() },
      shipClass: { findFirst: vi.fn().mockResolvedValue({ points: 500 }) },
      user: { findUnique: vi.fn().mockResolvedValue(null) },
      mailStat: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;

    const mockClassCache = {
      getTypeName: vi.fn(),
      getMaxTons: vi.fn().mockReturnValue(5000),
      getPoints: vi.fn().mockReturnValue(500),
    } as unknown as ShipClassCacheService;

    gateway = makeGateway({
      shipStateService: mockShipStateSvc as ShipStateService,
      registry,
      wsAuthGuard: { validate: vi.fn() } as unknown as WsAuthGuard,
      prisma: mockPrisma,
      scanHandler: { clearScantab: vi.fn() } as unknown as ScanHandlerService,
      shipClassCache: mockClassCache,
      random: { next: () => 0 } as unknown as Random,
      events: { emit: eventsEmitMock, on: vi.fn() } as never,
    });
    (gateway as unknown as { server: unknown }).server = {
      to: () => ({ emit: () => undefined }),
      emit: vi.fn(),
      sockets: { sockets: { get: vi.fn() }, adapter: { rooms: new Map() } },
    };
    registry.upsert('user1:1', 'sock-1');
  });

  const emittedEvent = () => {
    const call = eventsEmitMock.mock.calls.find((c) => c[0] === COMBAT_SHIP_DESTROYED);
    expect(call).toBeDefined();
    return call![1] as Record<string, unknown>;
  };

  it('names the killer on the event, AI included (GEFUNCS.C:1116)', async () => {
    await gateway.handleDisconnect(makeSocket() as never);
    expect(emittedEvent()).toMatchObject({
      attackerUserid: 'Cybrg-2',
      attackerName: 'Trans-Gal #2128',
    });
  });

  it('transfers cargo to the killer, skipping men and troops (GEFUNCS.C:1122-1136)', async () => {
    await gateway.handleDisconnect(makeSocket() as never);
    const loot = emittedEvent().loot as Array<{ itemIndex: number; amount: bigint }>;
    // random.next() === 0 → divisor 1 → the whole hold of food moves.
    expect(loot).toEqual([{ itemIndex: I_FOOD, amount: 100n }]);
    expect(loot.some((l) => l.itemIndex === I_MEN || l.itemIndex === I_TROOPS)).toBe(false);
    expect(mutateMock).toHaveBeenCalled();
  });

  it('credits the killer with the kill', async () => {
    await gateway.handleDisconnect(makeSocket() as never);
    const target = attacker();
    for (const call of mutateMock.mock.calls) {
      expect(call[0]).toBe('Cybrg-2');
      (call[2] as (s: typeof target) => void)(target);
    }
    expect(target.kills).toBe(1);
    expect(target.items[I_FOOD]).toBe(100n);
  });
});
