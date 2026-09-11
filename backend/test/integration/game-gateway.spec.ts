// Must be set before module instantiation
process.env['JWT_SECRET'] = 'test-secret-gateway';

import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { io as ioc, Socket } from 'socket.io-client';
import { Server } from 'socket.io';
import { GatewayModule } from '../../src/gateway/gateway.module';
import { GameGateway } from '../../src/gateway/game.gateway';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { CommandRouterService } from '../../src/game/commands/command-router.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { GalaxyService } from '../../src/game/galaxy/galaxy.service';
import { PlanetStateService } from '../../src/game/planet/planet-state.service';
import { ShipState } from '../../src/game/ship/ship-state.types';
import { WsAuthGuard } from '../../src/auth/ws-auth.guard';
import { OnboardingService } from '../../src/game/onboarding/onboarding.service';
import { makeShip as baseMakeShip } from '../helpers/make-ship';

function makeShipState(
  overrides: { userid: string; shipno: number; shipname: string },
): ShipState {
  return baseMakeShip({
    userid: overrides.userid,
    shipno: overrides.shipno,
    shipname: overrides.shipname,
    status: 0,
    topspeed: 0,
  });
}

const TEST_USERID = 'u-gateway-test';
const TEST_SHIP = makeShipState({ userid: TEST_USERID, shipno: 1, shipname: 'Test Ship' });

function makeClient(port: number, _userid = TEST_USERID): Socket {
  return ioc(`http://localhost:${port}`, {
    transports: ['websocket'],
    auth: { token: 'mock-valid-token' },
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

describe('GameGateway integration', () => {
  let app: INestApplication;
  let port: number;
  let ioServer: Server;

  beforeAll(async () => {
    const shipServiceMock = {
      findByUserid: vi.fn().mockReturnValue([TEST_SHIP]),
      findAllShips: vi.fn().mockReturnValue([TEST_SHIP]),
      get: vi.fn().mockReturnValue(TEST_SHIP),
      loadShip: vi.fn(),
      mutate: vi.fn(),
      size: vi.fn().mockReturnValue(1),
      flushAndUnload: vi.fn().mockResolvedValue(undefined),
      unboard: vi.fn().mockResolvedValue(undefined),
      board: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [GatewayModule],
    })
      .overrideProvider(ShipStateService)
      .useValue(shipServiceMock)
      .overrideProvider(CommandRouterService)
      .useValue({ register: vi.fn(), dispatch: vi.fn().mockReturnValue({ lines: [] }) })
      .overrideProvider(PrismaService)
      .useValue({
        shipClass: { findMany: vi.fn().mockResolvedValue([]) },
        mine: { findMany: vi.fn().mockResolvedValue([]) },
        ship: {
          findMany: vi.fn().mockResolvedValue([{ userid: TEST_USERID, shipno: 1, shipname: 'TestShip' }]),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        user: { findUnique: vi.fn().mockResolvedValue(null) }, // scanPl owner lookup
      })
      .overrideProvider(WsAuthGuard)
      .useValue({
        validate: vi.fn().mockImplementation(async (client: import('socket.io').Socket) => {
          client.data.userid = TEST_USERID;
          client.data.username = 'TestPilot';
          return { sub: TEST_USERID, username: 'TestPilot' };
        }),
      })
      .overrideProvider(OnboardingService)
      .useValue({ buildClassListPayload: vi.fn().mockResolvedValue([]) })
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
      .compile();

    app = module.createNestApplication();
    app.useWebSocketAdapter(new IoAdapter(app));
    await app.listen(0);
    const url = await app.getUrl();
    port = parseInt(new URL(url).port, 10);
    ioServer = module.get(GameGateway).server;
  }, 10000);

  afterAll(async () => {
    await app.close();
  }, 10000);

  /**
   * `sector:join` / `sector:leave` were removed on 2026-09-09. They took the
   * coordinates from the client and joined that room, gated only on "are you a
   * bound player" — so any player could subscribe to all 201x201 rooms and read
   * every `player.sector` update, which carries explicit coordinates. Nothing
   * called them; the frontend never emitted either event and ships are placed
   * in their room server-side. @see docs/audits/2026-09-09-security-review.md M4
   */
  describe('sector:join is gone', () => {
    it('does not answer a client that asks to join a sector room', async () => {
      const socket = makeClient(port);
      await waitForEvent(socket, 'command:result'); // welcome message

      socket.emit('sector:join', { x: 5, y: 5 });
      const replied = await Promise.race([
        waitForEvent(socket, 'sector:joined').then(() => true),
        new Promise<false>((r) => setTimeout(() => r(false), 300)),
      ]);

      expect(replied).toBe(false);
      socket.disconnect();
    });

    it('does not put the socket in a room it asked for', async () => {
      const socket = makeClient(port);
      await waitForEvent(socket, 'command:result');

      socket.emit('sector:join', { x: 42, y: 17 });
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(ioServer.sockets.adapter.rooms.get('sector:42:17')).toBeUndefined();
      socket.disconnect();
    });
  });
});
