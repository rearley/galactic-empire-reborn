process.env['JWT_SECRET'] = 'test-secret-roundtrip';

import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { io as ioc, Socket } from 'socket.io-client';
import { GatewayModule } from '../../src/gateway/gateway.module';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { CommandsModule } from '../../src/game/commands/commands.module';
import { CommandRouterService } from '../../src/game/commands/command-router.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { GalaxyService } from '../../src/game/galaxy/galaxy.service';
import { PlanetStateService } from '../../src/game/planet/planet-state.service';
import { TickKind } from '../../src/game/tick/tick.types';
import { ShipState } from '../../src/game/ship/ship-state.types';
import { ScanCell } from '../../src/game/commands/command.types';
import { WsAuthGuard } from '../../src/auth/ws-auth.guard';
import { OnboardingService } from '../../src/game/onboarding/onboarding.service';

function waitForEvent<T>(socket: Socket, event: string, timeoutMs = 2000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs);
    socket.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

function makeShipState(overrides: { userid: string; shipno: number; shipname: string; topspeed?: number }): ShipState {
  return {
    userid: overrides.userid,
    shipno: overrides.shipno,
    shipname: overrides.shipname,
    shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 0, ycoord: 0, damage: 0, energy: 1000,
    // phasrtype:1, shieldtype:1 (not 0). ShipStateService.onModuleInit
    // self-heals phasrtype/shieldtype 0 → 1 and marks the ship dirty, which
    // would falsely fail "no ship.update calls" assertions.
    phasr: 0, phasrtype: 1, kills: 0, lastfired: 0,
    shieldtype: 1, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0], items: [],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 0, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0,
    topspeed: overrides.topspeed ?? 5,
    warncntr: 0,
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
  };
}

describe('command round-trip integration (US1)', () => {
  let app: INestApplication;
  let port: number;
  let shipServiceFake: ShipStateService;
  let prismaMock: {
    ship: { findMany: jest.Mock; findFirst: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
    shipClass: { findMany: jest.Mock };
    mine: { findMany: jest.Mock };
  };
  let flushTick: (() => Promise<void>) | undefined;

  const USERID = 'roundtrip-user';
  const SHIPNO = 1;
  const SHIPNAME = 'Roundtrip';

  beforeEach(async () => {
    const ship = makeShipState({ userid: USERID, shipno: SHIPNO, shipname: SHIPNAME, topspeed: 5 });

    prismaMock = {
      ship: {
        findMany: jest.fn().mockResolvedValue([ship]),
        findFirst: jest.fn().mockResolvedValue({ userid: USERID, shipno: SHIPNO }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      shipClass: {
        findMany: jest.fn().mockResolvedValue([{ classNumber: 1, scanRange: 10000, typeName: 'Scout', hasCloak: false }]),
      },
      mine: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const tickServiceMock = {
      subscribe: jest.fn().mockImplementation(
        (_kind: TickKind, handler: () => Promise<void>) => {
          if (_kind === TickKind.SHIP_UPDATE) flushTick = handler;
          return () => {};
        },
      ),
      registerSnapshotProvider: jest.fn(),
    };

    // Construct a real ShipStateService using the mocked deps, then initialise it manually
    // so the in-memory map is loaded before we build the NestJS app.
    shipServiceFake = new ShipStateService(
      prismaMock as never,
      tickServiceMock as never,
    );
    await shipServiceFake.onModuleInit();

    const galaxyServiceMock = {
      onModuleInit: jest.fn(),
      getSectorPlanets: jest.fn().mockReturnValue([]),
      getSectorWormholes: jest.fn().mockReturnValue([]),
      findPlanetByName: jest.fn().mockReturnValue(null),
      getMeta: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [GatewayModule, CommandsModule],
    })
      .overrideProvider(ShipStateService)
      .useValue(shipServiceFake)
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(GalaxyService)
      .useValue(galaxyServiceMock)
      .overrideProvider(PlanetStateService)
      .useValue({
        get: jest.fn().mockReturnValue(undefined),
        all: jest.fn().mockReturnValue([]),
        size: jest.fn().mockReturnValue(0),
        claim: jest.fn(), buy: jest.fn(), sell: jest.fn(),
      })
      .overrideProvider(WsAuthGuard)
      .useValue({
        validate: jest.fn().mockImplementation(async (client: import('socket.io').Socket) => {
          client.data.userid = USERID;
          client.data.username = SHIPNAME;
          return { sub: USERID, username: SHIPNAME };
        }),
      })
      .overrideProvider(OnboardingService)
      .useValue({ buildClassListPayload: jest.fn().mockResolvedValue([]) })
      .compile();

    app = module.createNestApplication();
    app.useWebSocketAdapter(new IoAdapter(app));
    await app.listen(0);
    const url = await app.getUrl();
    port = parseInt(new URL(url).port, 10);
  }, 10000);

  afterEach(async () => {
    flushTick = undefined;
    await app.close();
  }, 10000);

  function makeClient(): Socket {
    return ioc(`http://localhost:${port}`, {
      transports: ['websocket'],
      auth: { token: 'mock-valid-token' },
    });
  }

  it('rot 45 → command:result with NOWTURN success line', async () => {
    const client = makeClient();
    await waitForEvent(client, 'command:result'); // welcome
    client.emit('command', { input: 'rot 45' });
    const result = await waitForEvent<{ lines: Array<{ text: string; category: string }> }>(
      client,
      'command:result',
    );
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].category).toBe('success');
    expect(result.lines[0].text).toContain('45');
    client.disconnect();
  });

  it('rot 45 → after flush, ship.degrees == 45 in state', async () => {
    const client = makeClient();
    await waitForEvent(client, 'command:result'); // welcome
    client.emit('command', { input: 'rot 45' });
    await waitForEvent(client, 'command:result');
    // Verify in-memory state was mutated
    const state = shipServiceFake.get(USERID, SHIPNO);
    expect(state?.degrees).toBe(45);
    expect(state?.dirty).toBe(true);
    client.disconnect();
  });

  it('after flush tick: degrees=45 written to Prisma, dirty cleared', async () => {
    const client = makeClient();
    await waitForEvent(client, 'command:result'); // welcome
    client.emit('command', { input: 'rot 45' });
    await waitForEvent(client, 'command:result');
    // Advance the SHIP_UPDATE tick
    await flushTick!();
    expect(prismaMock.ship.update).toHaveBeenCalledTimes(1);
    const state = shipServiceFake.get(USERID, SHIPNO);
    expect(state?.dirty).toBe(false);
    client.disconnect();
  });

  it('imp 50 → command:result with ENGFIRE success line', async () => {
    const client = makeClient();
    await waitForEvent(client, 'command:result'); // welcome
    client.emit('command', { input: 'imp 50' });
    const result = await waitForEvent<{ lines: Array<{ text: string; category: string }> }>(
      client,
      'command:result',
    );
    expect(result.lines[0].category).toBe('success');
    client.disconnect();
  });

  it('warp 3 → command:result with ENGFIRE success line', async () => {
    const client = makeClient();
    await waitForEvent(client, 'command:result'); // welcome
    client.emit('command', { input: 'warp 3' });
    const result = await waitForEvent<{ lines: Array<{ text: string; category: string }> }>(
      client,
      'command:result',
    );
    expect(result.lines.at(-1)!.category).toBe('success');
    client.disconnect();
  });

  it('zero prisma.ship.update calls when no command issued (SC-003)', async () => {
    const client = makeClient();
    await waitForEvent(client, 'command:result'); // welcome
    await flushTick!();
    expect(prismaMock.ship.update).not.toHaveBeenCalled();
    client.disconnect();
  });

  // T038: US2 round-trip cases
  it('scan → scan:render event carries cells (US2)', async () => {
    const client = makeClient();
    await waitForEvent(client, 'command:result'); // welcome
    client.emit('command', { input: 'scan' });
    const scanEvent = await waitForEvent<{ cells?: unknown[] }>(
      client,
      'scan:render',
    );
    expect(scanEvent.cells).toBeDefined();
    expect(Array.isArray(scanEvent.cells)).toBe(true);
    client.disconnect();
  });

  it('scan emits zero Ship writes (read-only, SC-003)', async () => {
    const client = makeClient();
    await waitForEvent(client, 'command:result'); // welcome
    client.emit('command', { input: 'scan' });
    await waitForEvent(client, 'command:result');
    await flushTick!();
    expect(prismaMock.ship.update).not.toHaveBeenCalled();
    client.disconnect();
  });

  it('report nav → command:result with multi-line read-out (US2)', async () => {
    const client = makeClient();
    await waitForEvent(client, 'command:result'); // welcome
    client.emit('command', { input: 'report nav' });
    const result = await waitForEvent<{ lines: Array<{ text: string; category: string }> }>(
      client,
      'command:result',
    );
    expect(result.lines.length).toBeGreaterThan(2);
    // Header line should reference class typename and ship name
    expect(result.lines[0].category).toBe('system');
    client.disconnect();
  });

  it('report nav emits zero Ship writes (read-only, SC-003)', async () => {
    const client = makeClient();
    await waitForEvent(client, 'command:result'); // welcome
    client.emit('command', { input: 'report nav' });
    await waitForEvent(client, 'command:result');
    await flushTick!();
    expect(prismaMock.ship.update).not.toHaveBeenCalled();
    client.disconnect();
  });

  // T024: scan lo with GalaxyService mock returns planet and wormhole cells
  it('scan lo with galaxy returns planet and wormhole cells', async () => {
    process.env.GALAXY_SEED = '12648430';

    // Mock GalaxyService returning one planet and one wormhole in sector (0,0)
    const galaxyServiceMock = {
      getSectorPlanets: jest.fn().mockReturnValue([
        {
          xsect: 0, ysect: 0, plnum: 1, type: 2,
          xcoord: 0.3, ycoord: 0.3,
          userid: null, name: 'Zygor-3',
          enviorn: 1, resource: 2,
          cash: BigInt(0), debt: BigInt(0), tax: BigInt(0),
          taxrate: 0, warnings: 0, password: 'none',
          lastattack: '', beacon: '', spyowner: '',
          technology: 0, teamcode: BigInt(0),
          itemsQty: [], itemsRate: [], itemsSell: [],
          itemsReserve: [], itemsMarkup2a: [], itemsSold2a: [],
        },
      ]),
      getSectorWormholes: jest.fn().mockReturnValue([
        {
          xsect: 0, ysect: 0, plnum: 6, type: 3,
          xcoord: 0.6, ycoord: 0.6,
          visible: 1,
          destXcoord: 5.5, destYcoord: 5.5,
          name: '',
        },
      ]),
      findPlanetByName: jest.fn().mockReturnValue(null),
      getMeta: jest.fn().mockReturnValue({
        id: 1,
        seed: BigInt(12648430),
        plodds: 4,
        wormodds: 10,
        maxplanets: 5,
        generatedAt: new Date(),
      }),
      onModuleInit: jest.fn(),
    };

    const ship = makeShipState({ userid: USERID, shipno: SHIPNO, shipname: SHIPNAME, topspeed: 5 });
    // Place ship at sector (0,0) — galaxy coords within first sector cell
    ship.xcoord = 0.0;
    ship.ycoord = 0.0;

    const localPrismaMock = {
      ship: {
        findMany: jest.fn().mockResolvedValue([ship]),
        findFirst: jest.fn().mockResolvedValue({ userid: USERID, shipno: SHIPNO }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      shipClass: {
        findMany: jest.fn().mockResolvedValue([
          { classNumber: 1, scanRange: 10000, typeName: 'Scout', hasCloak: false },
        ]),
      },
      mine: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const localTickMock = {
      subscribe: jest.fn().mockImplementation(
        (_kind: TickKind, handler: () => Promise<void>) => {
          if (_kind === TickKind.SHIP_UPDATE) flushTick = handler;
          return () => {};
        },
      ),
      registerSnapshotProvider: jest.fn(),
    };

    const localShipService = new ShipStateService(
      localPrismaMock as never,
      localTickMock as never,
    );
    await localShipService.onModuleInit();

    const galaxyModule: TestingModule = await Test.createTestingModule({
      imports: [GatewayModule, CommandsModule],
    })
      .overrideProvider(ShipStateService)
      .useValue(localShipService)
      .overrideProvider(PrismaService)
      .useValue(localPrismaMock)
      .overrideProvider(GalaxyService)
      .useValue(galaxyServiceMock)
      .overrideProvider(PlanetStateService)
      .useValue({
        get: jest.fn().mockReturnValue(undefined),
        all: jest.fn().mockReturnValue([]),
        size: jest.fn().mockReturnValue(0),
        claim: jest.fn(), buy: jest.fn(), sell: jest.fn(),
      })
      .overrideProvider(WsAuthGuard)
      .useValue({
        validate: jest.fn().mockImplementation(async (client: import('socket.io').Socket) => {
          client.data.userid = USERID;
          client.data.username = SHIPNAME;
          return { sub: USERID, username: SHIPNAME };
        }),
      })
      .overrideProvider(OnboardingService)
      .useValue({ buildClassListPayload: jest.fn().mockResolvedValue([]) })
      .compile();

    const galaxyApp = galaxyModule.createNestApplication();
    galaxyApp.useWebSocketAdapter(new IoAdapter(galaxyApp));
    await galaxyApp.listen(0);
    const galaxyUrl = await galaxyApp.getUrl();
    const galaxyPort = parseInt(new URL(galaxyUrl).port, 10);

    const client = ioc(`http://localhost:${galaxyPort}`, {
      transports: ['websocket'],
      auth: { token: 'mock-valid-token' },
    });

    try {
      await waitForEvent(client, 'command:result'); // welcome

      client.emit('command', { input: 'scan lo' });
      const scanEvent = await waitForEvent<{ kind: string; cells: ScanCell[] }>(
        client,
        'scan:render',
      );

      expect(scanEvent.cells).toBeDefined();
      expect(Array.isArray(scanEvent.cells)).toBe(true);

      // Planet cell uses char 'P' (was 'O' in an earlier version of the renderer).
      const planetCells = scanEvent.cells.filter((c) => c.type === 'planet');
      expect(planetCells.length).toBeGreaterThan(0);
      expect(planetCells[0].char).toBe('P');

      // T024: assert at least one wormhole cell with char 'W'
      const wormholeCells = scanEvent.cells.filter((c) => c.type === 'wormhole');
      expect(wormholeCells.length).toBeGreaterThan(0);
      expect(wormholeCells[0].char).toBe('W');
    } finally {
      client.disconnect();
      await galaxyApp.close();
      delete process.env.GALAXY_SEED;
    }
  });

  // T040: gateway try/catch error path
  it('handler that throws → client receives internal error line, connection stays open', async () => {
    const client = makeClient();
    await waitForEvent(client, 'command:result'); // welcome

    // Register a throw-on-purpose command via the router directly
    const router = app.get<CommandRouterService>(CommandRouterService);
    router.register({
      keyword: '__throw_test__',
      aliases: [],
      minArgs: 0,
      argMissingMessage: '',
      handler: () => { throw new Error('intentional test throw'); },
    });

    client.emit('command', { input: '__throw_test__' });
    const result = await waitForEvent<{ lines: Array<{ text: string; category: string }> }>(
      client,
      'command:result',
    );
    expect(result.lines[0].text).toBe('Internal error processing command.');
    expect(result.lines[0].category).toBe('system');
    expect(client.connected).toBe(true);
    client.disconnect();
  });
});
