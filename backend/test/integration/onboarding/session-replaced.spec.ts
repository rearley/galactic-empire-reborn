// Must be set before module instantiation
process.env['JWT_SECRET'] = 'test-secret-session-replaced';

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
import { OnboardingService } from '../../../src/game/onboarding/onboarding.service';
import { ShipState } from '../../../src/game/ship/ship-state.types';

/**
 * T048 — SESSION_REPLACED: same JWT connects twice → first socket receives
 * SESSION_REPLACED error and is force-disconnected by the server.
 *
 * The ConnectedShipsRegistry is NOT mocked here — we rely on the real
 * upsert() behaviour to return the prior socket ID so the gateway can
 * displace it.
 *
 * @see specs/011-onboarding/plan.md §US2
 * @see backend/src/gateway/connected-ships.registry.ts
 */

const TEST_USERID = 'u-session-replaced-test';
const TEST_SHIPNO = 1;

function makeShipState(overrides: { userid: string; shipno: number; shipname: string }): ShipState {
  return {
    userid: overrides.userid,
    shipno: overrides.shipno,
    shipname: overrides.shipname,
    shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 1, ycoord: 1, damage: 0, energy: 1000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0], items: [],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 0, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 0, warncntr: 0,
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
  };
}

const TEST_SHIP = makeShipState({ userid: TEST_USERID, shipno: TEST_SHIPNO, shipname: 'StarFalcon' });

function waitForEvent<T>(socket: Socket, event: string, timeoutMs = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for "${event}"`)), timeoutMs);
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
      () => reject(new Error('timeout waiting for socket to disconnect')),
      timeoutMs,
    );
    socket.once('disconnect', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function makeClient(port: number): Socket {
  return ioc(`http://localhost:${port}`, {
    transports: ['websocket'],
    auth: { token: 'mock-valid-token' },
  });
}

describe('Session replaced (T048)', () => {
  let app: INestApplication;
  let port: number;

  beforeAll(async () => {
    // ShipStateService is mocked — ship is always warm in memory.
    // ConnectedShipsRegistry is NOT overridden; the real instance is used
    // so upsert() correctly tracks and returns the prior socket ID.
    const shipStateServiceMock = {
      findByUserid: jest.fn().mockReturnValue([TEST_SHIP]),
      findAllShips: jest.fn().mockReturnValue([TEST_SHIP]),
      get: jest.fn().mockReturnValue(TEST_SHIP),
      loadShip: jest.fn(),
      mutate: jest.fn(),
      size: jest.fn().mockReturnValue(1),
      flushAndUnload: jest.fn().mockResolvedValue(undefined),
      unboard: jest.fn().mockResolvedValue(undefined),
      board: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [GatewayModule],
    })
      .overrideProvider(ShipStateService)
      .useValue(shipStateServiceMock)
      .overrideProvider(CommandRouterService)
      .useValue({ register: jest.fn(), dispatch: jest.fn().mockReturnValue({ lines: [] }) })
      .overrideProvider(PrismaService)
      .useValue({
        shipClass: { findMany: jest.fn().mockResolvedValue([]) },
        mine: { findMany: jest.fn().mockResolvedValue([]) },
        ship: {
          findMany: jest.fn().mockResolvedValue([{
            userid: TEST_USERID,
            shipno: TEST_SHIPNO,
            shipname: 'StarFalcon',
          }]),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      })
      .overrideProvider(WsAuthGuard)
      .useValue({
        // Both sockets present as the SAME user — identical shipId in registry
        validate: jest.fn().mockImplementation(async (client: import('socket.io').Socket) => {
          client.data.userid = TEST_USERID;
          client.data.username = 'TestPilot';
          return { sub: TEST_USERID, username: 'TestPilot' };
        }),
      })
      .overrideProvider(OnboardingService)
      .useValue({ buildClassListPayload: jest.fn().mockResolvedValue([]) })
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

  it('same JWT connects twice → first socket receives SESSION_REPLACED error and disconnects', async () => {
    const socket1 = makeClient(port);

    // Wait for socket1 to be fully welcomed and registered
    await waitForEvent(socket1, 'command:result');

    // Register error + disconnect listeners on socket1 BEFORE connecting socket2
    const socket1Error = waitForEvent<{ code: string; message: string }>(socket1, 'error');
    const socket1Disconnected = waitForDisconnect(socket1);

    // Connect socket2 with the same user credentials — triggers SESSION_REPLACED on socket1
    const socket2 = makeClient(port);
    const socket2Welcome = waitForEvent<{ lines: Array<{ text: string }> }>(socket2, 'command:result');

    // socket1 should receive the SESSION_REPLACED error and be disconnected
    const [errorPayload] = await Promise.all([
      socket1Error,
      socket1Disconnected,
    ]);

    expect(errorPayload.code).toBe('SESSION_REPLACED');
    expect(errorPayload.message).toMatch(/another session/i);
    expect(socket1.connected).toBe(false);

    // socket2 should receive a normal welcome
    const welcome = await socket2Welcome;
    expect(welcome.lines[0].text).toMatch(/Welcome aboard/i);

    socket2.disconnect();
  });
});
