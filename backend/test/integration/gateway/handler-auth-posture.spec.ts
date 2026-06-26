process.env['JWT_SECRET'] = 'test-secret-posture';

/**
 * Verifies that each @SubscribeMessage handler in GameGateway rejects
 * authenticated-but-unbound (onboarding) sockets before mutating state.
 *
 * T020b: command pipeline hardening — Phase 2 foundational requirement.
 */
import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { io as ioc, Socket } from 'socket.io-client';
import { GatewayModule } from '../../../src/gateway/gateway.module';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { CommandRouterService } from '../../../src/game/commands/command-router.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { GalaxyService } from '../../../src/game/galaxy/galaxy.service';
import { PlanetStateService } from '../../../src/game/planet/planet-state.service';
import { ConnectedShipsRegistry } from '../../../src/gateway/connected-ships.registry';
import { WsAuthGuard } from '../../../src/auth/ws-auth.guard';
import { OnboardingService } from '../../../src/game/onboarding/onboarding.service';

/**
 * Build a client that connects via JWT auth.token.
 * The WsAuthGuard mock will accept this token, look up no ship (prisma mock returns null),
 * and the gateway will enter onboarding mode (prompt:ship-name).
 */
function makeUnboundClient(port: number): Socket {
  return ioc(`http://localhost:${port}`, {
    transports: ['websocket'],
    auth: { token: 'valid-onboarding-token' },
  });
}

function waitForEvent<T>(socket: Socket, event: string, timeoutMs = 2000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs);
    socket.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

describe('GameGateway handler auth posture (T020b)', () => {
  let app: INestApplication;
  let port: number;
  let client: Socket;
  /** Resolves once the gateway emits prompt:ship-name for the current client. */
  let onboardingReady: Promise<void>;

  const dispatchMock = jest.fn().mockReturnValue({ lines: [] });

  beforeAll(async () => {
    const shipServiceMock = {
      findByUserid: jest.fn().mockReturnValue([]),
      get: jest.fn().mockReturnValue(undefined),
      mutate: jest.fn(),
      size: jest.fn().mockReturnValue(0),
      // Combat/ship ticks call findAllShips on the service every tick.
      findAllShips: jest.fn().mockReturnValue([]),
      loadShip: jest.fn(),
      // Gateway calls flushAndUnload during disconnect for bound sockets.
      flushAndUnload: jest.fn().mockResolvedValue(undefined),
      unboard: jest.fn().mockResolvedValue(undefined),
      board: jest.fn(),
    };
    const registryMock = {
      upsert: jest.fn(),
      remove: jest.fn(),
      list: jest.fn().mockReturnValue([]),
      isBound: jest.fn().mockReturnValue(false), // key: all sockets are treated as unbound
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [GatewayModule],
    })
      .overrideProvider(ShipStateService).useValue(shipServiceMock)
      .overrideProvider(CommandRouterService).useValue({ register: jest.fn(), dispatch: dispatchMock })
      .overrideProvider(PrismaService).useValue({
        ship: { findFirst: jest.fn().mockResolvedValue(null) }, // no ship → onboarding
        shipClass: { findMany: jest.fn().mockResolvedValue([]) }, // ShipClassCacheService.onModuleInit
        mine: { findMany: jest.fn().mockResolvedValue([]) },     // CombatTickService.onModuleInit
        // scanPl owner resolution + onboarding User-exists guard: a live User
        // row must resolve so the gateway emits prompt:ship-name (not auth:logout).
        user: { findUnique: jest.fn().mockResolvedValue({ userid: 'onboarding-user-unbound' }) },
      })
      .overrideProvider(GalaxyService).useValue({})
      .overrideProvider(PlanetStateService).useValue({ all: jest.fn().mockReturnValue([]) })
      .overrideProvider(ConnectedShipsRegistry).useValue(registryMock)
      .overrideProvider(WsAuthGuard)
      .useValue({
        validate: jest.fn().mockImplementation(async (client: import('socket.io').Socket) => {
          // Simulate a valid JWT user with no ship
          client.data.userid = 'onboarding-user-unbound';
          client.data.username = 'OnboardingUser';
          return { sub: 'onboarding-user-unbound', username: 'OnboardingUser' };
        }),
      })
      .overrideProvider(OnboardingService)
      .useValue({
        buildClassListPayload: jest.fn().mockResolvedValue([]),
        validateClassReply: jest.fn().mockResolvedValue(true),
        validateNameReply: jest.fn().mockReturnValue(true),
        finalize: jest.fn().mockResolvedValue(null),
      })
      .compile();

    app = module.createNestApplication();
    app.useWebSocketAdapter(new IoAdapter(app));
    await app.init();
    const address = app.getHttpServer().listen();
    port = (address.address() as { port: number }).port;
  });

  afterAll(async () => {
    client?.disconnect();
    await app.close();
  });

  beforeEach((done) => {
    client = makeUnboundClient(port);
    // Register the prompt:ship-name listener BEFORE the connect fires so we
    // never miss the event that handleConnection emits immediately on connect.
    onboardingReady = new Promise<void>((resolve) => {
      client.once('prompt:ship-name', () => resolve());
    });
    client.on('connect', done);
  });

  afterEach(() => {
    client.disconnect();
  });

  it('sector:join from unbound socket → rejection, no room join', async () => {
    // Wait for ship-name prompt (confirms handleConnection completed, socket is in onboarding mode)
    await onboardingReady;

    client.emit('sector:join', { x: 1, y: 1 });
    const result = await waitForEvent<{ lines: Array<{ text: string }> }>(client, 'command:result');
    expect(result.lines[0].text).toMatch(/not authenticated|not in play/i);
  });

  it('sector:leave from unbound socket → rejection', async () => {
    // Wait for ship-name prompt (confirms handleConnection completed, socket is in onboarding mode)
    await onboardingReady;

    client.emit('sector:leave', { x: 1, y: 1 });
    const result = await waitForEvent<{ lines: Array<{ text: string }> }>(client, 'command:result');
    expect(result.lines[0].text).toMatch(/not authenticated|not in play/i);
  });

  it('command from unbound socket (no activeShipNo) → rejection, dispatch NOT called', async () => {
    dispatchMock.mockClear();
    // Wait for ship-name prompt (confirms handleConnection completed, socket is in onboarding mode)
    await onboardingReady;

    client.emit('command', { input: 'scan' });
    const result = await waitForEvent<{ lines: Array<{ text: string }> }>(client, 'command:result', 2000);
    expect(result.lines[0].text).toMatch(/no active ship/i);
    expect(dispatchMock).not.toHaveBeenCalled();
  });
});
