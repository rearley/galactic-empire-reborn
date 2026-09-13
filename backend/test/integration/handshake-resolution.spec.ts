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
import type { Mock } from 'vitest';

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
    get: Mock;
    findByUserid: Mock;
    findAllShips: Mock;
    mutate: Mock;
    size: Mock;
    loadShip: Mock;
    flushAndUnload: Mock;
    unboard: Mock;
    board: Mock;
  };
  let prismaMock: {
    ship: { findMany: Mock; findFirst: Mock; updateMany: Mock };
    shipClass: { findMany: Mock };
    mine: { findMany: Mock };
    user: { findUnique: Mock };
  };

  beforeEach(async () => {
    shipStateServiceMock = {
      get: vi.fn().mockReturnValue(undefined),
      findByUserid: vi.fn().mockReturnValue([]),
      // Combat/ship ticks now call findAllShips on the service.
      findAllShips: vi.fn().mockReturnValue([]),
      mutate: vi.fn(),
      size: vi.fn().mockReturnValue(0),
      loadShip: vi.fn(),
      // Gateway calls flushAndUnload during disconnect.
      flushAndUnload: vi.fn().mockResolvedValue(undefined),
      unboard: vi.fn().mockResolvedValue(undefined),
      board: vi.fn(),
    };

    prismaMock = {
      ship: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      shipClass: { findMany: vi.fn().mockResolvedValue([]) },
      mine: { findMany: vi.fn().mockResolvedValue([]) },
      // scan_pl uses prisma.user.findUnique for owner resolution, and the
      // gateway's onboarding User-exists guard requires a live User row before
      // it will emit prompt:ship-name (otherwise it force-logs-out).
      user: { findUnique: vi.fn().mockResolvedValue({ userid: TEST_USERID }) },
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [GatewayModule],
    })
      .overrideProvider(ShipStateService)
      .useValue(shipStateServiceMock)
      .overrideProvider(CommandRouterService)
      .useValue({ register: vi.fn(), dispatch: vi.fn().mockReturnValue({ lines: [] }) })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
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
      .overrideProvider(WsAuthGuard)
      .useValue({
        validate: vi.fn().mockImplementation(async (client: unknown) => {
          (client as { data: Record<string, unknown> }).data.userid = TEST_USERID;
          return { sub: TEST_USERID, username: 'TestUser' };
        }),
      })
      .overrideProvider(OnboardingService)
      .useValue({
        buildClassListPayload: vi.fn().mockResolvedValue([]),
        validateClassReply: vi.fn().mockResolvedValue(true),
        validateNameReply: vi.fn().mockReturnValue(true),
        finalize: vi.fn(),
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
