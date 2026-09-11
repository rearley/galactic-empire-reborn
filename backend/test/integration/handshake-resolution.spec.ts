import 'reflect-metadata';
process.env['JWT_SECRET'] = 'test-secret-resolution';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { io as ioc, Socket } from 'socket.io-client';
import { GatewayModule } from '../../src/gateway/gateway.module';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { CommandRouterService } from '../../src/game/commands/command-router.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { GalaxyService } from '../../src/game/galaxy/galaxy.service';
import { PlanetStateService } from '../../src/game/planet/planet-state.service';
import { WsAuthGuard } from '../../src/auth/ws-auth.guard';
import { OnboardingService } from '../../src/game/onboarding/onboarding.service';
import { makeShip as baseMakeShip } from '../helpers/make-ship';

const TEST_USERID = 'u-resolution-test';

function waitForEvent<T>(socket: Socket, event: string, timeoutMs = 2000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timeout waiting for ${event}`)),
      timeoutMs,
    );
    socket.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

function makeShipState(overrides: { userid: string; shipno: number; shipname: string }) {
  return baseMakeShip({
    userid: overrides.userid,
    shipno: overrides.shipno,
    shipname: overrides.shipname,
    status: 0,
    topspeed: 0,
  });
}

describe('GameGateway handshake resolution', () => {
  let app: INestApplication;
  let port: number;
  let shipStateServiceMock: {
    get: jest.Mock;
    findByUserid: jest.Mock;
    findAllShips: jest.Mock;
    mutate: jest.Mock;
    size: jest.Mock;
    loadShip: jest.Mock;
    flushAndUnload: jest.Mock;
    unboard: jest.Mock;
    board: jest.Mock;
  };
  let prismaMock: {
    ship: { findMany: jest.Mock; findFirst: jest.Mock; updateMany: jest.Mock };
    shipClass: { findMany: jest.Mock };
    mine: { findMany: jest.Mock };
    user: { findUnique: jest.Mock };
  };

  beforeEach(async () => {
    shipStateServiceMock = {
      get: jest.fn().mockReturnValue(undefined),
      findByUserid: jest.fn().mockReturnValue([]),
      // Combat/ship ticks now call findAllShips on the service.
      findAllShips: jest.fn().mockReturnValue([]),
      mutate: jest.fn(),
      size: jest.fn().mockReturnValue(0),
      loadShip: jest.fn(),
      // Gateway calls flushAndUnload during disconnect.
      flushAndUnload: jest.fn().mockResolvedValue(undefined),
      unboard: jest.fn().mockResolvedValue(undefined),
      board: jest.fn(),
    };

    prismaMock = {
      ship: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      shipClass: { findMany: jest.fn().mockResolvedValue([]) },
      mine: { findMany: jest.fn().mockResolvedValue([]) },
      // scan_pl uses prisma.user.findUnique for owner resolution, and the
      // gateway's onboarding User-exists guard requires a live User row before
      // it will emit prompt:ship-name (otherwise it force-logs-out).
      user: { findUnique: jest.fn().mockResolvedValue({ userid: TEST_USERID }) },
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [GatewayModule],
    })
      .overrideProvider(ShipStateService)
      .useValue(shipStateServiceMock)
      .overrideProvider(CommandRouterService)
      .useValue({ register: jest.fn(), dispatch: jest.fn().mockReturnValue({ lines: [] }) })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(GalaxyService)
      .useValue({
        onModuleInit: jest.fn(),
        getSectorPlanets: jest.fn().mockReturnValue([]),
        getSectorWormholes: jest.fn().mockReturnValue([]),
        findPlanetByName: jest.fn().mockReturnValue(null),
        getMeta: jest.fn(),
      })
      .overrideProvider(PlanetStateService)
      .useValue({
        get: jest.fn().mockReturnValue(undefined),
        all: jest.fn().mockReturnValue([]),
        size: jest.fn().mockReturnValue(0),
        claim: jest.fn(), buy: jest.fn(), sell: jest.fn(),
      })
      .overrideProvider(WsAuthGuard)
      .useValue({
        validate: jest.fn().mockImplementation(async (client: unknown) => {
          (client as { data: Record<string, unknown> }).data.userid = TEST_USERID;
          return { sub: TEST_USERID, username: 'TestUser' };
        }),
      })
      .overrideProvider(OnboardingService)
      .useValue({
        buildClassListPayload: jest.fn().mockResolvedValue([]),
        validateClassReply: jest.fn().mockResolvedValue(true),
        validateNameReply: jest.fn().mockReturnValue(true),
        finalize: jest.fn(),
      })
      .compile();

    app = module.createNestApplication();
    app.useWebSocketAdapter(new IoAdapter(app));
    await app.listen(0);
    const url = await app.getUrl();
    port = parseInt(new URL(url).port, 10);
  }, 10000);

  afterEach(async () => {
    await app.close();
  }, 10000);

  it('returning player: valid JWT + ship in DB → emits welcome command:result', async () => {
    // Arrange: DB has a ship for this user
    const dbShip = { userid: TEST_USERID, shipno: 1, shipname: 'USS Pioneer', shpclass: 1 };
    prismaMock.ship.findMany.mockResolvedValue([dbShip]);

    // ShipStateService.get returns undefined initially (triggers loadShip path)
    // then returns the ship after loadShip is called
    const shipState = makeShipState({ userid: TEST_USERID, shipno: 1, shipname: 'USS Pioneer' });
    shipStateServiceMock.get
      .mockReturnValueOnce(undefined)   // first call: not yet loaded → triggers loadShip
      .mockReturnValue(shipState);       // subsequent calls: loaded

    const client = ioc(`http://localhost:${port}`, {
      transports: ['websocket'],
      auth: { token: 'valid-token' },
    });

    try {
      const result = await waitForEvent<{ lines: Array<{ text: string; category: string }> }>(
        client,
        'command:result',
      );
      // Canon's WELCOM greets the COMMANDER, not the hull, and this fixture's
      // ShipState carries no username — so the JWT handle on client.data is
      // what names them. @see GEFUNCS.C:172
      expect(result.lines[0].text).toContain('Welcome aboard Commander');
      expect(result.lines[0].text).toContain('Type ? if you need assistance');
      expect(result.lines[0].category).toBe('system');
    } finally {
      client.disconnect();
    }
  });

  it('new player: valid JWT + no ship in DB → emits prompt:ship-name', async () => {
    // Arrange: DB has no ship for this user
    prismaMock.ship.findMany.mockResolvedValue([]);

    const client = ioc(`http://localhost:${port}`, {
      transports: ['websocket'],
      auth: { token: 'valid-token' },
    });

    try {
      const payload = await waitForEvent<{ step: string; rule: string }>(
        client,
        'prompt:ship-name',
      );
      expect(payload.step).toBe('NAME');
    } finally {
      client.disconnect();
    }
  });
});
