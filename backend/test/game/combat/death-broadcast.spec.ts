/**
 * T055 — death-broadcast: GameGateway forwards COMBAT_SHIP_DESTROYED to
 * EVERY connected client (server.emit) — NOT scoped to the victim's sector
 * room. Per FR-031 / R-7 the original game broadcasts ship destruction
 * galaxy-wide.
 *
 * @see specs/006b-combat/tasks.md T055
 */
import 'reflect-metadata';
import { GameGateway } from '../../../src/gateway/game.gateway';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { CommandRouterService } from '../../../src/game/commands/command-router.service';
import { ConnectedShipsRegistry } from '../../../src/gateway/connected-ships.registry';
import { WsAuthGuard } from '../../../src/auth/ws-auth.guard';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { OnboardingService } from '../../../src/game/onboarding/onboarding.service';
import {
  COMBAT_SHIP_DESTROYED,
  CombatShipDestroyedEvent,
} from '../../../src/game/combat/combat-events';

describe('GameGateway — COMBAT_SHIP_DESTROYED broadcast (T055)', () => {
  let gateway: GameGateway;
  let toMock: jest.Mock;
  let serverEmitMock: jest.Mock;

  beforeEach(() => {
    toMock = jest.fn().mockReturnValue({ emit: jest.fn() });
    serverEmitMock = jest.fn();

    const mockWsGuard = { validate: jest.fn() } as unknown as WsAuthGuard;
    const mockPrisma = { ship: { findFirst: jest.fn() } } as unknown as PrismaService;
    const mockOnboarding = { buildClassListPayload: jest.fn().mockResolvedValue([]) } as unknown as OnboardingService;
    gateway = new GameGateway({} as ShipStateService, {} as CommandRouterService, {} as ConnectedShipsRegistry, mockWsGuard, mockPrisma, mockOnboarding);
    (gateway as unknown as { server: { to: jest.Mock; emit: jest.Mock } }).server = {
      to: toMock,
      emit: serverEmitMock,
    };
  });

  it('emits galaxy-wide via server.emit (no room filter)', () => {
    const event: CombatShipDestroyedEvent = {
      victimId: 'b:2',
      attackerId: 'a:7',
      victimShipKey: 'b:2',
      attackerShipKey: 'a:7',
      victimUserid: 'b',
      attackerUserid: 'a',
      attackerChannel: 7,
      weapon: null,
      sector: { x: 12, y: 3 },
      tickAt: new Date(),
      loot: [],
      scoreAwarded: 0,
    };
    gateway.handleCombatShipDestroyed(event);
    expect(serverEmitMock).toHaveBeenCalledWith(COMBAT_SHIP_DESTROYED, event);
    expect(toMock).not.toHaveBeenCalled();
  });

  it('payload is forwarded unchanged (victimId, attackerId, channel, sector, tickAt)', () => {
    const tickAt = new Date('2026-01-01T00:00:00Z');
    const event: CombatShipDestroyedEvent = {
      victimId: 'x:1',
      attackerId: null,
      victimShipKey: 'x:1',
      attackerShipKey: null,
      victimUserid: 'x',
      attackerUserid: null,
      attackerChannel: 99,
      weapon: null,
      sector: { x: 0, y: 0 },
      tickAt,
      loot: [],
      scoreAwarded: 0,
    };
    gateway.handleCombatShipDestroyed(event);
    expect(serverEmitMock).toHaveBeenCalledTimes(1);
    expect(serverEmitMock.mock.calls[0][1]).toBe(event);
  });
});
