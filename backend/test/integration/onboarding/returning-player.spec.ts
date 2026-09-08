// Must be set before module instantiation
process.env['JWT_SECRET'] = 'test-secret-returning';

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

const TEST_USERID = 'u-returning-test';
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

function makeClient(port: number): Socket {
  return ioc(`http://localhost:${port}`, {
    transports: ['websocket'],
    auth: { token: 'mock-valid-token' },
  });
}

// ---------------------------------------------------------------------------
// T046 — Returning player welcome sequence
// ---------------------------------------------------------------------------
describe('Returning player (T046)', () => {
  let app: INestApplication;
  let port: number;
  let loadShipMock: jest.Mock;

  beforeAll(async () => {
    loadShipMock = jest.fn();

    // Ship is always warm in memory — hydration path is skipped
    const shipStateServiceMock = {
      findByUserid: jest.fn().mockReturnValue([TEST_SHIP]),
      findAllShips: jest.fn().mockReturnValue([TEST_SHIP]),
      get: jest.fn().mockReturnValue(TEST_SHIP),
      loadShip: loadShipMock,
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

  it('JWT-authed connect with existing Ship → receives welcome command:result, no prompt:class-list', async () => {
    const socket = makeClient(port);

    // Track whether prompt:class-list fires before timeout
    let receivedClassList = false;
    socket.on('prompt:class-list', () => { receivedClassList = true; });

    const result = await waitForEvent<{ lines: Array<{ text: string; category: string }> }>(
      socket,
      'command:result',
    );

    expect(result.lines).toHaveLength(1);
    // Canon greets the commander, not the hull. @see GEFUNCS.C:172 WELCOM
    expect(result.lines[0].text).toBe(
      'Welcome aboard Commander TestPilot, the con is yours. Type ? if you need assistance.',
    );
    expect(receivedClassList).toBe(false);

    socket.disconnect();
  });

  it('Returning player receives player.snapshot after welcome (T046)', async () => {
    const socket = makeClient(port);

    // Listen for both events in parallel — they arrive in quick succession
    const [, snapshot] = await Promise.all([
      waitForEvent(socket, 'command:result'),
      waitForEvent<{ players: unknown[] }>(socket, 'player.snapshot'),
    ]);

    expect(snapshot).toHaveProperty('players');
    expect(Array.isArray(snapshot.players)).toBe(true);

    socket.disconnect();
  });
});

// ---------------------------------------------------------------------------
// T047 — Warm cache: hydration skipped when ship already in memory
// ---------------------------------------------------------------------------
describe('Warm cache (T047)', () => {
  let app: INestApplication;
  let port: number;
  let loadShipSpy: jest.Mock;

  beforeAll(async () => {
    loadShipSpy = jest.fn();

    // get() ALWAYS returns the ship — warm cache, no hydration needed
    const shipStateServiceMock = {
      findByUserid: jest.fn().mockReturnValue([TEST_SHIP]),
      findAllShips: jest.fn().mockReturnValue([TEST_SHIP]),
      get: jest.fn().mockReturnValue(TEST_SHIP),
      loadShip: loadShipSpy,
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

  it('ShipState already in memory → connect skips hydration, still emits welcome', async () => {
    const socket = makeClient(port);

    const result = await waitForEvent<{ lines: Array<{ text: string }> }>(socket, 'command:result');

    // Welcome message should still be emitted
    expect(result.lines[0].text).toMatch(/Welcome aboard/i);

    // loadShip must NOT have been called (cache was warm)
    expect(loadShipSpy).not.toHaveBeenCalled();

    socket.disconnect();
  });
});
