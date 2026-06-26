import 'reflect-metadata';
import { GameGateway } from '../../src/gateway/game.gateway';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { CommandRouterService } from '../../src/game/commands/command-router.service';
import { ConnectedShipsRegistry } from '../../src/gateway/connected-ships.registry';
import { WsAuthGuard } from '../../src/auth/ws-auth.guard';
import { PrismaService } from '../../src/prisma/prisma.service';
import { OnboardingService } from '../../src/game/onboarding/onboarding.service';
import { ScanHandlerService } from '../../src/game/commands/handlers/scan.handler';
import { mockRandom } from '../fixtures/mock-random';
import {
  COMBAT_DECOY_INTERCEPT,
  COMBAT_HIT,
  COMBAT_MINE_DETONATION,
  COMBAT_MISS,
  COMBAT_PHASER_FIRED,
  COMBAT_SUBSYSTEM_DAMAGED,
  CombatDecoyInterceptEvent,
  CombatHitEvent,
  CombatMineDetonationEvent,
  CombatMissEvent,
  CombatPhaserFiredEvent,
  CombatSubsystemDamagedEvent,
} from '../../src/game/combat/combat-events';

/**
 * Verifies that the GameGateway forwards combat events to the firer/victim's
 * sector room (FR-031). Uses a mock socket.io Server so no network is needed.
 *
 * @see specs/006b-combat/contracts/combat-events.md
 */
describe('GameGateway combat broadcasts', () => {
  let gateway: GameGateway;
  let toMock: jest.Mock;
  let emitMock: jest.Mock;

  beforeEach(() => {
    emitMock = jest.fn();
    toMock = jest.fn().mockReturnValue({ emit: emitMock });

    const mockWsGuard = { validate: jest.fn() } as unknown as WsAuthGuard;
    const mockPrisma = { ship: { findFirst: jest.fn() } } as unknown as PrismaService;
    const mockOnboarding = { buildClassListPayload: jest.fn().mockResolvedValue([]) } as unknown as OnboardingService;
    const mockScanHandler = { clearScantab: jest.fn() } as unknown as ScanHandlerService;
    gateway = new GameGateway(
      {} as ShipStateService,
      {} as CommandRouterService,
      { getSocketId: jest.fn().mockReturnValue(undefined) } as unknown as ConnectedShipsRegistry,
      mockWsGuard,
      mockPrisma,
      mockOnboarding,
      mockScanHandler,
      { getTypeName: jest.fn() } as never,
      mockRandom,
      { emit: jest.fn(), on: jest.fn() } as never,
    );
    // Inject the mock io Server.
    (gateway as unknown as { server: { to: jest.Mock } }).server = { to: toMock };
  });

  it('broadcasts COMBAT_PHASER_FIRED to sector room', () => {
    const event: CombatPhaserFiredEvent = {
      shipId: 'a:1',
      bearing: 90,
      percent: 50,
      hyper: false,
      sector: { x: 5, y: 7 },
      tickAt: new Date(),
    };
    gateway.handleCombatPhaserFired(event);
    expect(toMock).toHaveBeenCalledWith('sector:5:7');
    expect(emitMock).toHaveBeenCalledWith(COMBAT_PHASER_FIRED, event);
  });

  it('broadcasts COMBAT_HIT to sector room', () => {
    const event: CombatHitEvent = {
      attackerId: 'a:1',
      victimId: 'b:2',
      weapon: 'phaser',
      damageHull: 5,
      damageShield: 100,
      sector: { x: 12, y: 3 },
      tickAt: new Date(),
    };
    gateway.handleCombatHit(event);
    expect(toMock).toHaveBeenCalledWith('sector:12:3');
    expect(emitMock).toHaveBeenCalledWith(COMBAT_HIT, event);
  });

  it('broadcasts COMBAT_DECOY_INTERCEPT to sector room', () => {
    const event: CombatDecoyInterceptEvent = {
      defenderId: 'b:2',
      attackerId: 'a:1',
      weapon: 'torpedo',
      sector: { x: 4, y: 9 },
      tickAt: new Date(),
    };
    gateway.handleCombatDecoyIntercept(event);
    expect(toMock).toHaveBeenCalledWith('sector:4:9');
    expect(emitMock).toHaveBeenCalledWith(COMBAT_DECOY_INTERCEPT, event);
  });

  it('broadcasts COMBAT_MISS to sector room', () => {
    const event: CombatMissEvent = {
      attackerId: 'a:1',
      weapon: 'phaser',
      sector: { x: 0, y: 0 },
      tickAt: new Date(),
    };
    gateway.handleCombatMiss(event);
    expect(toMock).toHaveBeenCalledWith('sector:0:0');
    expect(emitMock).toHaveBeenCalledWith(COMBAT_MISS, event);
  });

  it('broadcasts COMBAT_MINE_DETONATION to sector room', () => {
    const event: CombatMineDetonationEvent = {
      mineId: 42,
      channel: 99,
      sector: { x: 8, y: 4 },
      tickAt: new Date(),
    };
    gateway.handleCombatMineDetonation(event);
    expect(toMock).toHaveBeenCalledWith('sector:8:4');
    expect(emitMock).toHaveBeenCalledWith(COMBAT_MINE_DETONATION, event);
  });
});

// Fix 3 — COMBAT_SUBSYSTEM_DAMAGED routed to victim's socket
describe('GameGateway — COMBAT_SUBSYSTEM_DAMAGED broadcast (Fix 3)', () => {
  it('delivers per-subsystem event.log notice to the victim socket', () => {
    const victimEmit = jest.fn();
    const mockSocket = { emit: victimEmit };
    const mockSockets = new Map<string, typeof mockSocket>();
    mockSockets.set('victim-socket-id', mockSocket);

    const mockWsGuard = { validate: jest.fn() } as unknown as WsAuthGuard;
    const mockPrisma = { ship: { findFirst: jest.fn() } } as unknown as PrismaService;
    const mockOnboarding = { buildClassListPayload: jest.fn().mockResolvedValue([]) } as unknown as OnboardingService;
    const mockScanHandler = { clearScantab: jest.fn() } as unknown as ScanHandlerService;

    // Registry returns a socket ID for the victim
    const mockRegistry = {
      getSocketId: jest.fn().mockImplementation((id: string) =>
        id === 'b:2' ? 'victim-socket-id' : undefined,
      ),
    } as unknown as ConnectedShipsRegistry;

    const gw = new GameGateway(
      {} as ShipStateService,
      {} as CommandRouterService,
      mockRegistry,
      mockWsGuard,
      mockPrisma,
      mockOnboarding,
      mockScanHandler,
      { getTypeName: jest.fn() } as never,
      mockRandom,
      { emit: jest.fn(), on: jest.fn() } as never,
    );

    const emitMock2 = jest.fn();
    const toMock2 = jest.fn().mockReturnValue({ emit: emitMock2 });
    (gw as unknown as { server: unknown }).server = {
      to: toMock2,
      sockets: { sockets: mockSockets },
    };

    const event: CombatSubsystemDamagedEvent = {
      victimId: 'b:2',
      subsystem: 'phasr',
      sector: { x: 3, y: 5 },
      tickAt: new Date(),
    };
    gw.handleCombatSubsystemDamaged(event);
    // Victim's socket should receive an event.log notice
    expect(victimEmit).toHaveBeenCalledWith('event.log', expect.objectContaining({
      category: expect.any(String),
      text: expect.stringContaining('damaged'),
    }));
  });
});
