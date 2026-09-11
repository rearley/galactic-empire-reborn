/**
 * Builds a GameGateway for unit tests with every dependency defaulted to an
 * inert double, overridable by NAME rather than position.
 *
 * This exists because the gateway's constructor takes 11 positional arguments
 * and 43 test files were calling it directly. Every restructure task that adds
 * or removes a dependency would otherwise be a 43-file diff no reviewer could
 * read. Change the constructor, change this file; the specs do not move.
 *
 * Defaults are deliberately inert: a default returns undefined / empty rather
 * than something plausible, so a test that depends on a collaborator must say
 * so by overriding it. A helpful default is how a factory starts making tests
 * pass for reasons their authors did not choose.
 *
 * @see src/gateway/game.gateway.ts constructor
 */
import { GameGateway } from '../../src/gateway/game.gateway';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { CommandRouterService } from '../../src/game/commands/command-router.service';
import { ConnectedShipsRegistry } from '../../src/gateway/connected-ships.registry';
import { WsAuthGuard } from '../../src/auth/ws-auth.guard';
import { PrismaService } from '../../src/prisma/prisma.service';
import { OnboardingService } from '../../src/game/onboarding/onboarding.service';
import { ScanHandlerService } from '../../src/game/commands/handlers/scan.handler';
import { ShipClassCacheService } from '../../src/game/physics/ship-class-cache.service';
import { Random } from '../../src/game/combat/random.port';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PresenceService } from '../../src/public/presence.service';
import { ShipDestroyedService } from '../../src/gateway/ship-destroyed.service';
import { ConnectionLifecycleService } from '../../src/gateway/connection-lifecycle.service';

export interface GatewayDeps {
  shipStateService: ShipStateService;
  commandRouter: CommandRouterService;
  registry: ConnectedShipsRegistry;
  wsAuthGuard: WsAuthGuard;
  prisma: PrismaService;
  onboardingService: OnboardingService;
  scanHandler: ScanHandlerService;
  shipClassCache: ShipClassCacheService;
  random: Random;
  events: EventEmitter2;
  presence: PresenceService;
  shipDestroyed: ShipDestroyedService;
  connectionLifecycle: ConnectionLifecycleService;
}

export function makeGateway(overrides: Partial<GatewayDeps> = {}): GameGateway {
  // registry's own constructor needs a ShipStateService, so its default is
  // built from the (possibly overridden) shipStateService rather than a
  // second, disconnected stub.
  const shipStateService =
    overrides.shipStateService ??
    ({
      get: jest.fn(),
      findAllShips: jest.fn(() => []),
      findByUserid: jest.fn(() => []),
      size: jest.fn(() => 0),
    } as unknown as ShipStateService);

  const flat: Omit<GatewayDeps, 'shipDestroyed' | 'connectionLifecycle'> = {
    shipStateService,
    commandRouter: { dispatch: jest.fn() } as unknown as CommandRouterService,
    registry: new ConnectedShipsRegistry(shipStateService),
    wsAuthGuard: { validate: jest.fn() } as unknown as WsAuthGuard,
    prisma: {} as unknown as PrismaService,
    onboardingService: {} as unknown as OnboardingService,
    scanHandler: {
      clearScantab: jest.fn(),
      lettersFor: jest.fn(() => []),
    } as unknown as ScanHandlerService,
    shipClassCache: { getTypeName: jest.fn() } as unknown as ShipClassCacheService,
    random: { next: jest.fn(() => 0) } as unknown as Random,
    events: { emit: jest.fn(), on: jest.fn() } as unknown as EventEmitter2,
    presence: new PresenceService(),
    ...overrides,
  };

  // Deliberately NOT inert. Every death spec drives the gateway's @OnEvent
  // handler and asserts on what the service does behind it — the transaction,
  // the manifest line, the KILLEDBY broadcast. An inert double would turn all
  // of them green for the wrong reason. Built from the resolved deps above,
  // the same way `registry` is built from the resolved ShipStateService.
  const deps: GatewayDeps = {
    ...flat,
    shipDestroyed:
      overrides.shipDestroyed ??
      new ShipDestroyedService(
        flat.prisma,
        flat.shipStateService,
        flat.scanHandler,
        flat.shipClassCache,
        flat.random,
      ),
    // Inert for the same reason `shipDestroyed` is not: the connect and
    // disconnect specs drive the gateway's OnGatewayConnection hooks and assert
    // on what happens behind them — the seat cap, the boarding, the rage-quit
    // kill. A double that did nothing would turn every one of them green
    // without exercising a line of it.
    connectionLifecycle:
      overrides.connectionLifecycle ??
      new ConnectionLifecycleService(
        flat.shipStateService,
        flat.registry,
        flat.wsAuthGuard,
        flat.prisma,
        flat.scanHandler,
        flat.shipClassCache,
        flat.random,
        flat.events,
        flat.presence,
      ),
  };

  return new GameGateway(
    deps.shipStateService,
    deps.commandRouter,
    deps.registry,
    deps.wsAuthGuard,
    deps.prisma,
    deps.onboardingService,
    deps.scanHandler,
    deps.shipClassCache,
    deps.random,
    deps.events,
    deps.presence,
    deps.shipDestroyed,
    deps.connectionLifecycle,
  );
}
