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
import { WsAuthGuard } from '../../../src/auth/ws-auth.guard';

// Must be set before AppModule/GatewayModule is instantiated so ConfigModule picks it up.
process.env['JWT_SECRET'] = 'test-secret-handshake-auth';

/**
 * T025 — Gateway handshake auth (TDD, intentionally failing until implementation).
 *
 * After the onboarding update, the GameGateway validates a JWT passed via
 * `socket.handshake.auth.token`.  Clients that connect without a valid token
 * should receive an `error` event with `{ code: 'AUTH_REQUIRED' }` and then
 * be forcefully disconnected by the server.
 *
 * @see specs/011-onboarding/plan.md §Auth gateway handshake
 */

function waitForEvent<T>(socket: Socket, event: string, timeoutMs = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timeout waiting for "${event}" event`)),
      timeoutMs,
    );
    socket.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

function waitForDisconnect(socket: Socket, timeoutMs = 3000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!socket.connected) {
      resolve();
      return;
    }
    const timer = setTimeout(
      () => reject(new Error('timeout waiting for socket disconnect')),
      timeoutMs,
    );
    socket.once('disconnect', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/**
 * Mock WsAuthGuard that inspects `socket.handshake.auth.token`.
 * - No token or token === 'invalid'  → emits AUTH_REQUIRED error and disconnects
 * - token === 'valid-token'          → returns a minimal JWT payload
 */
const mockWsAuthGuard = {
  validate: vi.fn().mockImplementation(async (socket: Socket) => {
    const token = (socket as any).handshake?.auth?.token as string | undefined;
    if (!token || token === 'invalid') {
      socket.emit('error', { code: 'AUTH_REQUIRED', message: 'No token provided.' });
      (socket as any).disconnect(true);
      return null;
    }
    return { sub: 'user-123', username: 'TestUser' };
  }),
};

describe('GameGateway — handshake auth (T025)', () => {
  let app: INestApplication;
  let port: number;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [GatewayModule],
    })
      .overrideProvider(ShipStateService)
      .useValue({ findByUserid: vi.fn().mockReturnValue([]), get: vi.fn() })
      .overrideProvider(CommandRouterService)
      .useValue({ register: vi.fn(), dispatch: vi.fn() })
      .overrideProvider(PrismaService)
      .useValue({
        shipClass: { findMany: vi.fn().mockResolvedValue([]) },
        mine: { findMany: vi.fn().mockResolvedValue([]) },
      })
      .overrideProvider(GalaxyService)
      .useValue({
        onModuleInit: vi.fn(),
        getSectorPlanets: vi.fn().mockReturnValue([]),
        getSectorWormholes: vi.fn().mockReturnValue([]),
        findPlanetByName: vi.fn().mockReturnValue(null),
        getMeta: vi.fn(),
      })
      .overrideProvider(PlanetStateService)
      .useValue({
        get: vi.fn().mockReturnValue(undefined),
        all: vi.fn().mockReturnValue([]),
        size: vi.fn().mockReturnValue(0),
        claim: vi.fn(), buy: vi.fn(), sell: vi.fn(),
      })
      // Replace the real WsAuthGuard with our controlled mock so the test
      // exercises the gateway's wiring without needing a real JWT secret.
      .overrideProvider(WsAuthGuard)
      .useValue(mockWsAuthGuard)
      .compile();

    app = module.createNestApplication();
    app.useWebSocketAdapter(new IoAdapter(app));
    await app.listen(0);
    const url = await app.getUrl();
    port = parseInt(new URL(url).port, 10);
  }, 15000);

  afterAll(async () => {
    await app.close();
  }, 10000);

  it('connect without token → receives error { code: AUTH_REQUIRED } and socket disconnects', async () => {
    // Connect with NO auth object at all.
    const socket = ioc(`http://localhost:${port}`, {
      transports: ['websocket'],
      // Deliberately omit auth: { token: ... }
    });

    const [errorPayload] = await Promise.all([
      waitForEvent<{ code: string; message: string }>(socket, 'error'),
      waitForDisconnect(socket),
    ]);

    expect(errorPayload.code).toBe('AUTH_REQUIRED');
    expect(socket.connected).toBe(false);
  });

  it('connect with invalid token → receives error { code: AUTH_REQUIRED } and socket disconnects', async () => {
    const socket = ioc(`http://localhost:${port}`, {
      transports: ['websocket'],
      auth: { token: 'invalid' },
    });

    const [errorPayload] = await Promise.all([
      waitForEvent<{ code: string; message: string }>(socket, 'error'),
      waitForDisconnect(socket),
    ]);

    expect(errorPayload.code).toBe('AUTH_REQUIRED');
    expect(socket.connected).toBe(false);
  });
});
