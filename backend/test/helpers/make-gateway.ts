/**
 * Builds a GameGateway for unit tests with every dependency defaulted to an
 * inert double, overridable by NAME rather than position.
 *
 * This exists because the gateway's constructor takes ten positional arguments
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
import { ShipRepository } from '../../src/game/ship/ship.repository';
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
  shipRepository: ShipRepository;
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

  const flat: Omit<GatewayDeps, 'shipDestroyed' | 'connectionLifecycle' | 'shipRepository'> = {
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
    // Derived from `flat.prisma` (unless overridden by name) rather than left
    // inert: several existing specs override `prisma` with a `ship.findFirst`
    // mock and assert on it being called — a real ShipRepository wrapping
    // that same mock keeps those assertions true without those specs
    // changing. The same technique `shipDestroyed` and `connectionLifecycle`
    // already use below.
    shipRepository: overrides.shipRepository ?? new ShipRepository(flat.prisma),
    shipDestroyed:
      overrides.shipDestroyed ??
      new ShipDestroyedService(
        flat.prisma,
        flat.shipStateService,
        flat.scanHandler,
        flat.shipClassCache,
        flat.random,
      ),
    // Deliberately NOT inert either, for the same reason as `shipDestroyed`
    // above. The connect and disconnect specs drive the gateway's
    // OnGatewayConnection / OnGatewayDisconnect hooks and assert on what
    // happens behind them — the seat cap, the boarding sequence, the rage-quit
    // kill, the departure notice. A double that did nothing would turn every
    // one of them green without exercising a line of it. Built from the
    // resolved deps above, the same way `registry` and `shipDestroyed` are.
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

  // `wsAuthGuard`, `events` and `presence` stay in `GatewayDeps` — and stay
  // overridable by name — because `ConnectionLifecycleService` is built from
  // them above. The gateway itself no longer takes any of the three.
  return new GameGateway(
    deps.shipStateService,
    deps.commandRouter,
    deps.registry,
    deps.shipRepository,
    deps.onboardingService,
    deps.scanHandler,
    deps.shipClassCache,
    deps.random,
    deps.shipDestroyed,
    deps.connectionLifecycle,
  );
}
