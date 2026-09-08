// Must be set before module instantiation
process.env['JWT_SECRET'] = 'test-secret-ship-select';

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
import { ShipClassCacheService } from '../../../src/game/physics/ship-class-cache.service';
import { ShipState } from '../../../src/game/ship/ship-state.types';

const TEST_USERID = 'u-ship-select-test';

function makeShipState(overrides: { userid: string; shipno: number; shipname: string; xcoord?: number; ycoord?: number }): ShipState {
  return {
    userid: overrides.userid,
    shipno: overrides.shipno,
    shipname: overrides.shipname,
    shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: overrides.xcoord ?? 5, ycoord: overrides.ycoord ?? 3,
    damage: 0, energy: 1000,
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
    autoShield: false, autoRepair: false,
  };
}

/** Minimal Prisma-shaped ship row for use in findMany mocks. */
function makePrismaShip(shipno: number, shipname: string, shpclass = 1, xcoord = 5.5, ycoord = 3.5) {
  return {
    userid: TEST_USERID,
    shipno,
    shipname,
    shpclass,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord, ycoord,
    damage: 0, energy: 1000,
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
    autoShield: false, autoRepair: false,
  };
}

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

function makeBaseModule(
  shipMany: object[],
  findFirstResult: object | null = null,
  boardMock: jest.Mock = jest.fn(),
  getMock: jest.Mock = jest.fn().mockReturnValue(undefined),
  shipClassCacheMock: object = { getTypeName: jest.fn().mockReturnValue('Scout'), onModuleInit: jest.fn() },
) {
  const shipStateServiceMock = {
    findByUserid: jest.fn().mockReturnValue([]),
    findAllShips: jest.fn().mockReturnValue([]),
    get: getMock,
    loadShip: jest.fn(),
    mutate: jest.fn(),
    size: jest.fn().mockReturnValue(0),
    flushAndUnload: jest.fn().mockResolvedValue(undefined),
    unboard: jest.fn().mockResolvedValue(undefined),
    board: boardMock,
  };

  const prismaMock = {
    shipClass: { findMany: jest.fn().mockResolvedValue([]) },
    mine: { findMany: jest.fn().mockResolvedValue([]) },
    ship: {
      findMany: jest.fn().mockResolvedValue(shipMany),
      findFirst: jest.fn().mockResolvedValue(findFirstResult),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ userid: TEST_USERID }),
    },
  };

  return Test.createTestingModule({
    imports: [GatewayModule],
  })
    .overrideProvider(ShipStateService)
    .useValue(shipStateServiceMock)
    .overrideProvider(CommandRouterService)
    .useValue({ register: jest.fn(), dispatch: jest.fn().mockReturnValue({ lines: [] }) })
    .overrideProvider(PrismaService)
    .useValue(prismaMock)
    .overrideProvider(ShipClassCacheService)
    .useValue(shipClassCacheMock)
    .overrideProvider(WsAuthGuard)
    .useValue({
      validate: jest.fn().mockImplementation(async (client: import('socket.io').Socket) => {
        client.data.userid = TEST_USERID;
        client.data.username = 'TestPilot';
        return { sub: TEST_USERID, username: 'TestPilot' };
      }),
    })
    .overrideProvider(OnboardingService)
    .useValue({
      buildClassListPayload: jest.fn().mockResolvedValue([]),
      validateNameReply: jest.fn().mockReturnValue(false),
      finalize: jest.fn(),
    })
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
    });
}

// ---------------------------------------------------------------------------
// T7-A: 0 ships → new-player onboarding (no ship-select prompt)
// ---------------------------------------------------------------------------
describe('Ship-select T7-A: 0 ships → onboarding free-starter path', () => {
  let app: INestApplication;
  let port: number;

  beforeAll(async () => {
    const module: TestingModule = await makeBaseModule(
      [], // findMany returns empty
    ).compile();

    app = module.createNestApplication();
    app.useWebSocketAdapter(new IoAdapter(app));
    await app.listen(0);
    port = parseInt(new URL(await app.getUrl()).port, 10);
  }, 15000);

  afterAll(async () => { await app.close(); }, 10000);

  it('0 ships → emits prompt:ship-name, never prompt:ship-select', async () => {
    const socket = makeClient(port);

    let gotShipSelect = false;
    socket.on('prompt:ship-select', () => { gotShipSelect = true; });

    await waitForEvent(socket, 'prompt:ship-name');

    // Give a brief moment in case ship-select fires asynchronously
    await new Promise(r => setTimeout(r, 100));
    expect(gotShipSelect).toBe(false);

    socket.disconnect();
  });
});

// ---------------------------------------------------------------------------
// T7-B: 1 ship → auto-boards (no prompt:ship-select)
// ---------------------------------------------------------------------------
describe('Ship-select T7-B: 1 ship → auto-boards without selection menu', () => {
  let app: INestApplication;
  let port: number;
  let boardMock: jest.Mock;
  let getMock: jest.Mock;

  beforeAll(async () => {
    boardMock = jest.fn();
    const shipState = makeShipState({ userid: TEST_USERID, shipno: 1, shipname: 'Solo' });
    getMock = jest.fn().mockReturnValue(shipState);

    const module: TestingModule = await makeBaseModule(
      [makePrismaShip(1, 'Solo')],
      null,
      boardMock,
      getMock,
    ).compile();

    app = module.createNestApplication();
    app.useWebSocketAdapter(new IoAdapter(app));
    await app.listen(0);
    port = parseInt(new URL(await app.getUrl()).port, 10);
  }, 15000);

  afterAll(async () => { await app.close(); }, 10000);

  it('1 ship → receives welcome command:result (no ship-select prompt)', async () => {
    const socket = makeClient(port);

    let gotShipSelect = false;
    socket.on('prompt:ship-select', () => { gotShipSelect = true; });

    const result = await waitForEvent<{ lines: Array<{ text: string }> }>(socket, 'command:result');

    expect(result.lines[0].text).toMatch(/Welcome aboard/i);
    expect(gotShipSelect).toBe(false);

    socket.disconnect();
  });

  it('1 ship → auto-board used warm cache: get() called for shipno 1, board() NOT called', async () => {
    getMock.mockClear();
    boardMock.mockClear();
    const socket = makeClient(port);

    await waitForEvent(socket, 'command:result');

    // get() must have been called with (TEST_USERID, 1) — confirms auto-board ran for ship 1
    expect(getMock).toHaveBeenCalledWith(TEST_USERID, 1);
    // board() is NOT called when get() already returns the ship (warm-cache hit)
    expect(boardMock).not.toHaveBeenCalled();

    socket.disconnect();
  });
});

// ---------------------------------------------------------------------------
// T7-C: >1 ships → emits prompt:ship-select with fleet list; does not board
// ---------------------------------------------------------------------------
describe('Ship-select T7-C: >1 ships → emits selection menu without boarding', () => {
  let app: INestApplication;
  let port: number;
  let boardMock: jest.Mock;

  beforeAll(async () => {
    boardMock = jest.fn();
    const getMock = jest.fn().mockReturnValue(undefined); // no warm cache

    const module: TestingModule = await makeBaseModule(
      [
        makePrismaShip(1, 'Falcon', 1, 5.5, 3.5),
        makePrismaShip(2, 'Hawk', 2, 12.5, 7.5),
      ],
      null,
      boardMock,
      getMock,
    ).compile();

    app = module.createNestApplication();
    app.useWebSocketAdapter(new IoAdapter(app));
    await app.listen(0);
    port = parseInt(new URL(await app.getUrl()).port, 10);
  }, 15000);

  afterAll(async () => { await app.close(); }, 10000);

  it('>1 ships → emits prompt:ship-select with fleet list; does NOT board', async () => {
    const socket = makeClient(port);

    let gotWelcome = false;
    socket.on('command:result', () => { gotWelcome = true; });

    const payload = await waitForEvent<{
      step: string;
      ships: Array<{ index: number; shipno: number; className: string; shipname: string; sector: { x: number; y: number } }>;
    }>(socket, 'prompt:ship-select');

    // Menu structure
    expect(payload.step).toBe('SHIP_SELECT');
    expect(Array.isArray(payload.ships)).toBe(true);
    expect(payload.ships).toHaveLength(2);

    expect(payload.ships[0].index).toBe(1);
    expect(payload.ships[0].shipno).toBe(1);
    expect(payload.ships[0].shipname).toBe('Falcon');
    expect(payload.ships[0].sector).toEqual({ x: 5, y: 3 });

    expect(payload.ships[1].index).toBe(2);
    expect(payload.ships[1].shipno).toBe(2);
    expect(payload.ships[1].shipname).toBe('Hawk');
    expect(payload.ships[1].sector).toEqual({ x: 12, y: 7 });

    // className comes from ShipClassCacheService (mocked to 'Scout')
    expect(typeof payload.ships[0].className).toBe('string');

    // Did not auto-board
    await new Promise(r => setTimeout(r, 100));
    expect(gotWelcome).toBe(false);
    expect(boardMock).not.toHaveBeenCalled();

    socket.disconnect();
  });
});

// ---------------------------------------------------------------------------
// T7-D: valid reply → boards chosen ship; invalid reply → re-emits menu
// ---------------------------------------------------------------------------
describe('Ship-select T7-D: prompt:reply handling', () => {
  let app: INestApplication;
  let port: number;
  let boardMock: jest.Mock;
  let prismaMock: { ship: { findMany: jest.Mock; findFirst: jest.Mock; updateMany: jest.Mock }; shipClass: { findMany: jest.Mock }; mine: { findMany: jest.Mock }; user: { findUnique: jest.Mock } };

  // shipno 1 and 4: index 1 = shipno 1, index 2 = shipno 4 — makes index ≠ shipno for index 2
  const ship1 = makePrismaShip(1, 'Falcon', 1, 5.5, 3.5);
  const ship2 = makePrismaShip(4, 'Hawk', 2, 12.5, 7.5);

  beforeAll(async () => {
    const shipState2 = makeShipState({ userid: TEST_USERID, shipno: 4, shipname: 'Hawk', xcoord: 12, ycoord: 7 });

    // Simulate in-memory map: board() stores the state, get() retrieves it.
    const inMemoryMap = new Map<string, ShipState>();
    boardMock = jest.fn().mockImplementation((state: ShipState) => {
      inMemoryMap.set(`${state.userid}:${state.shipno}`, state);
    });
    const getMock = jest.fn().mockImplementation((userid: string, shipno: number) => {
      return inMemoryMap.get(`${userid}:${shipno}`);
    });

    // findFirst honors the where-clause so an off-by-one or always-index-1 bug would fail.
    const makeFindFirstImpl = () =>
      jest.fn().mockImplementation((args: { where: { userid: string; shipno: number } }) => {
        const shipno = args?.where?.shipno;
        if (shipno === 1) return Promise.resolve(ship1);
        if (shipno === 4) return Promise.resolve(ship2);
        return Promise.resolve(null);
      });

    prismaMock = {
      shipClass: { findMany: jest.fn().mockResolvedValue([]) },
      mine: { findMany: jest.fn().mockResolvedValue([]) },
      ship: {
        findMany: jest.fn().mockResolvedValue([ship1, ship2]),
        findFirst: makeFindFirstImpl(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ userid: TEST_USERID }),
      },
    };

    void shipState2; // used implicitly via inMemoryMap after boarding

    const shipStateServiceMock = {
      findByUserid: jest.fn().mockReturnValue([]),
      findAllShips: jest.fn().mockReturnValue([]),
      get: getMock,
      loadShip: jest.fn(),
      mutate: jest.fn(),
      size: jest.fn().mockReturnValue(0),
      flushAndUnload: jest.fn().mockResolvedValue(undefined),
      unboard: jest.fn().mockResolvedValue(undefined),
      board: boardMock,
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
      .overrideProvider(ShipClassCacheService)
      .useValue({ getTypeName: jest.fn().mockReturnValue('Scout'), onModuleInit: jest.fn() })
      .overrideProvider(WsAuthGuard)
      .useValue({
        validate: jest.fn().mockImplementation(async (client: import('socket.io').Socket) => {
          client.data.userid = TEST_USERID;
          client.data.username = 'TestPilot';
          return { sub: TEST_USERID, username: 'TestPilot' };
        }),
      })
      .overrideProvider(OnboardingService)
      .useValue({
        buildClassListPayload: jest.fn().mockResolvedValue([]),
        validateNameReply: jest.fn().mockReturnValue(false),
        finalize: jest.fn(),
      })
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
    port = parseInt(new URL(await app.getUrl()).port, 10);
  }, 15000);

  afterAll(async () => { await app.close(); }, 10000);

  it('valid reply "2" → boards ship at index 2 (shipno 4, not 2), emits welcome + snapshot', async () => {
    boardMock.mockClear();
    const socket = makeClient(port);

    // Wait for the selection menu
    await waitForEvent(socket, 'prompt:ship-select');

    // Reply with index 2 — which maps to shipno 4 (Hawk), NOT shipno 2
    const [result, snapshot] = await Promise.all([
      waitForEvent<{ lines: Array<{ text: string }> }>(socket, 'command:result'),
      waitForEvent<{ players: unknown[] }>(socket, 'player.snapshot'),
      Promise.resolve().then(() => { socket.emit('prompt:reply', { value: '2' }); }),
    ]);

    expect(result.lines[0].text).toMatch(/Welcome aboard/i);
    expect(snapshot).toHaveProperty('players');

    // Core contract: board() was called with the ship at index 2 = shipno 4, NOT shipno 2.
    // An off-by-one or always-index-1 bug would make this fail.
    expect(boardMock).toHaveBeenCalledWith(expect.objectContaining({ shipno: 4 }));

    socket.disconnect();
  });

  /**
   * The browser client sends the chosen index as a NUMBER — `emitPromptReply`
   * is typed `number | string` and App passes the parsed index. The gateway
   * accepted strings only, coerced anything else to '', and re-emitted the menu:
   * a captain who bought a second ship could never board either of them, and
   * every backend test here had been sending strings so nothing caught it.
   */
  it('accepts a numeric index, as the browser client sends', async () => {
    boardMock.mockClear();
    const socket = makeClient(port);

    await waitForEvent(socket, 'prompt:ship-select');

    const [result] = await Promise.all([
      waitForEvent<{ lines: Array<{ text: string }> }>(socket, 'command:result'),
      Promise.resolve().then(() => { socket.emit('prompt:reply', { value: 2 }); }),
    ]);

    // Assert on the welcome rather than boardMock: by this point the preceding
    // test has already warmed shipno 4 into the state map, so board() is
    // legitimately not called again (see the warm-cache case above).
    expect(result.lines[0].text).toMatch(/Welcome aboard Commander/i);

    socket.disconnect();
  });

  it('invalid reply "9" → re-emits prompt:ship-select, does not board', async () => {
    boardMock.mockClear();
    const socket = makeClient(port);

    // Wait for initial selection menu
    await waitForEvent(socket, 'prompt:ship-select');

    // Listen for re-emit
    const reEmit = waitForEvent<{ step: string }>(socket, 'prompt:ship-select');

    socket.emit('prompt:reply', { value: '9' });

    const menu = await reEmit;
    expect(menu.step).toBe('SHIP_SELECT');
    expect(boardMock).not.toHaveBeenCalled();

    socket.disconnect();
  });

  it('invalid reply "x" → re-emits prompt:ship-select, does not board', async () => {
    boardMock.mockClear();
    const socket = makeClient(port);

    await waitForEvent(socket, 'prompt:ship-select');

    const reEmit = waitForEvent<{ step: string }>(socket, 'prompt:ship-select');
    socket.emit('prompt:reply', { value: 'x' });

    const menu = await reEmit;
    expect(menu.step).toBe('SHIP_SELECT');
    expect(boardMock).not.toHaveBeenCalled();

    socket.disconnect();
  });

  it('race: ship destroyed mid-select → findFirst returns null → re-emits menu, does not board', async () => {
    boardMock.mockClear();
    const socket = makeClient(port);

    // Wait for initial selection menu (findMany still returns 2 ships)
    await waitForEvent(socket, 'prompt:ship-select');

    // Simulate the selected ship being destroyed between menu and reply:
    // findFirst now returns null regardless of shipno.
    prismaMock.ship.findFirst.mockResolvedValue(null);

    const reEmit = waitForEvent<{ step: string }>(socket, 'prompt:ship-select');

    // Send a valid index (1) — but the ship no longer exists in DB
    socket.emit('prompt:reply', { value: '1' });

    const menu = await reEmit;
    // Menu re-emitted — the null-guard path fired
    expect(menu.step).toBe('SHIP_SELECT');
    // board() must NOT have been called
    expect(boardMock).not.toHaveBeenCalled();

    socket.disconnect();

    // Restore findFirst for subsequent tests (if any)
    prismaMock.ship.findFirst.mockImplementation((args: { where: { userid: string; shipno: number } }) => {
      const shipno = args?.where?.shipno;
      if (shipno === 1) return Promise.resolve(ship1);
      if (shipno === 4) return Promise.resolve(ship2);
      return Promise.resolve(null);
    });
  });
});
