import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { io as ioc, Socket } from 'socket.io-client';
import { GatewayModule } from '../../src/gateway/gateway.module';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { CommandRouterService } from '../../src/game/commands/command-router.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { GalaxyService } from '../../src/game/galaxy/galaxy.service';
import { PlanetStateService } from '../../src/game/planet/planet-state.service';

function makeClient(port: number, userid?: string): Socket {
  return ioc(`http://localhost:${port}`, {
    transports: ['websocket'],
    query: userid ? { userid } : {},
  });
}

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

function waitForDisconnect(socket: Socket, timeoutMs = 2000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('timeout waiting for disconnect')),
      timeoutMs,
    );
    socket.once('disconnect', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

describe('GameGateway handshake resolution', () => {
  let app: INestApplication;
  let port: number;
  let shipServiceMock: {
    findByUserid: jest.Mock;
    get: jest.Mock;
    mutate: jest.Mock;
    size: jest.Mock;
  };
  let warnSpy: jest.SpyInstance;

  function makeShipState(overrides: { userid: string; shipno: number; shipname: string }) {
    return {
      userid: overrides.userid,
      shipno: overrides.shipno,
      shipname: overrides.shipname,
      shpclass: 1,
      heading: 0, head2b: 0, speed: 0, speed2b: 0,
      xcoord: 0, ycoord: 0, damage: 0, energy: 1000,
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
      dirty: false,
    };
  }

  beforeEach(async () => {
    shipServiceMock = {
      findByUserid: jest.fn().mockReturnValue([]),
      get: jest.fn().mockReturnValue(undefined),
      mutate: jest.fn(),
      size: jest.fn().mockReturnValue(0),
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [GatewayModule],
    })
      .overrideProvider(ShipStateService)
      .useValue(shipServiceMock)
      .overrideProvider(CommandRouterService)
      .useValue({ register: jest.fn(), dispatch: jest.fn().mockReturnValue({ lines: [] }) })
      .overrideProvider(PrismaService)
      .useValue({ shipClass: { findMany: jest.fn().mockResolvedValue([]) } })
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
    // Capture logger output
    warnSpy = jest.spyOn(Logger.prototype, 'warn');
    await app.listen(0);
    const url = await app.getUrl();
    port = parseInt(new URL(url).port, 10);
  }, 10000);

  afterEach(async () => {
    warnSpy.mockRestore();
    await app.close();
  }, 10000);

  it('no userid in query → emits error NO_USER and disconnects', async () => {
    const client = makeClient(port); // no userid
    // Register disconnect promise before awaiting error so we don't miss the event
    const disconnectP = waitForDisconnect(client);
    const error = await waitForEvent<{ code: string; message: string }>(client, 'error');
    await disconnectP;
    expect(error.code).toBe('NO_USER');
    expect(client.connected).toBe(false);
  });

  it('userid with 0 ships → emits error NO_SHIP, disconnects, no Ship row created', async () => {
    shipServiceMock.findByUserid.mockReturnValue([]);
    const client = makeClient(port, 'u-noship');
    // Register disconnect promise before awaiting error so we don't miss the event
    const disconnectP = waitForDisconnect(client);
    const error = await waitForEvent<{ code: string; message: string }>(client, 'error');
    await disconnectP;
    expect(error.code).toBe('NO_SHIP');
    expect(client.connected).toBe(false);
  });

  it('userid with 1 ship → binds and emits welcome line', async () => {
    const ship = makeShipState({ userid: 'u-one', shipno: 1, shipname: 'USS Pioneer' });
    shipServiceMock.findByUserid.mockReturnValue([ship]);
    const client = makeClient(port, 'u-one');
    const result = await waitForEvent<{ lines: Array<{ text: string; category: string }> }>(
      client,
      'command:result',
    );
    expect(result.lines[0].text).toBe('Welcome aboard, USS Pioneer.');
    expect(result.lines[0].category).toBe('system');
    client.disconnect();
  });

  it('userid with 3 ships → binds lowest shipno and logs exact warn string', async () => {
    const ships = [
      makeShipState({ userid: 'u-multi', shipno: 1, shipname: 'Ship One' }),
      makeShipState({ userid: 'u-multi', shipno: 2, shipname: 'Ship Two' }),
      makeShipState({ userid: 'u-multi', shipno: 3, shipname: 'Ship Three' }),
    ];
    shipServiceMock.findByUserid.mockReturnValue(ships);
    const client = makeClient(port, 'u-multi');
    const result = await waitForEvent<{ lines: Array<{ text: string }> }>(
      client,
      'command:result',
    );
    // Should bind lowest shipno=1 and emit welcome for Ship One
    expect(result.lines[0].text).toBe('Welcome aboard, Ship One.');
    // Logger should have captured the exact warn string
    expect(warnSpy).toHaveBeenCalledWith(
      '[ShipStateService] WARN multiple ships for userid=u-multi, picked lowest shipno=1',
    );
    client.disconnect();
  });
});
