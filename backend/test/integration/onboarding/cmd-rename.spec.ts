// Must be set before module instantiation
process.env['JWT_SECRET'] = 'test-secret-rename';

/**
 * Integration tests for the `rename` command (US3, T054–T058).
 * Tests run against a real NestJS app + WebSocket gateway with
 * PrismaService and ShipStateService stubbed out.
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
import { WsAuthGuard } from '../../../src/auth/ws-auth.guard';
import { OnboardingService } from '../../../src/game/onboarding/onboarding.service';
import { RenameService } from '../../../src/game/onboarding/rename.service';
import { ShipState } from '../../../src/game/ship/ship-state.types';

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------
const TEST_USERID = 'u-rename-test';
const TEST_SHIPNO = 1;
const INITIAL_NAME = 'OldFalcon';

function makeShipState(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: TEST_USERID, shipno: TEST_SHIPNO, shipname: INITIAL_NAME,
    shpclass: 1, heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5, ycoord: 3, damage: 0, energy: 1000,
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
    ...overrides,
  };
}

function waitForEvent<T>(socket: Socket, event: string, timeoutMs = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timeout waiting for "${event}"`)),
      timeoutMs,
    );
    socket.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

// ---------------------------------------------------------------------------
// Shared test app builder
// ---------------------------------------------------------------------------
async function buildApp(renameServiceOverride: Partial<RenameService>): Promise<{
  app: INestApplication;
  port: number;
  mutateSpy: jest.Mock;
}> {
  const mutateSpy = jest.fn();
  const testShip = makeShipState();

  const shipStateServiceMock = {
    get: jest.fn().mockReturnValue(testShip),
    mutate: mutateSpy,
    loadShip: jest.fn(),
    size: jest.fn().mockReturnValue(1),
    findAllShips: jest.fn().mockReturnValue([testShip]),
    findByUserid: jest.fn().mockReturnValue([testShip]),
    flushAndUnload: jest.fn().mockResolvedValue(undefined),
    unboard: jest.fn().mockResolvedValue(undefined),
    board: jest.fn(),
  };

  const module: TestingModule = await Test.createTestingModule({
    imports: [GatewayModule],
  })
    .overrideProvider(ShipStateService)
    .useValue(shipStateServiceMock)
    .overrideProvider(PrismaService)
    .useValue({
      shipClass: { findMany: jest.fn().mockResolvedValue([]) },
      mine: { findMany: jest.fn().mockResolvedValue([]) },
      ship: {
        findFirst: jest.fn().mockResolvedValue({
          userid: TEST_USERID,
          shipno: TEST_SHIPNO,
          shipname: INITIAL_NAME,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      user: { findUnique: jest.fn().mockResolvedValue(null) }, // scanPl owner lookup
    })
    .overrideProvider(WsAuthGuard)
    .useValue({
      validate: jest.fn().mockImplementation(
        async (client: import('socket.io').Socket) => {
          client.data.userid = TEST_USERID;
          client.data.username = 'TestPilot';
          return { sub: TEST_USERID, username: 'TestPilot' };
        },
      ),
    })
    .overrideProvider(OnboardingService)
    .useValue({ buildClassListPayload: jest.fn().mockResolvedValue([]) })
    .overrideProvider(RenameService)
    .useValue(renameServiceOverride)
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

  const app = module.createNestApplication();
  app.useWebSocketAdapter(new IoAdapter(app));
  await app.listen(0);
  const url = await app.getUrl();
  const port = parseInt(new URL(url).port, 10);

  return { app, port, mutateSpy };
}

function makeBoundClient(port: number): Socket {
  return ioc(`http://localhost:${port}`, {
    transports: ['websocket'],
    auth: { token: 'mock-valid-token' },
  });
}

// ---------------------------------------------------------------------------
// T054 — Happy path rename
// ---------------------------------------------------------------------------
describe('cmd rename — happy path (T054)', () => {
  let app: INestApplication;
  let port: number;

  beforeAll(async () => {
    const setup = await buildApp({
      rename: jest.fn().mockResolvedValue({
        ok: true,
        oldName: 'OldFalcon',
        newName: 'NewFalcon',
        shipId: `${TEST_USERID}:${TEST_SHIPNO}`,
      }),
    });
    app = setup.app;
    port = setup.port;
  }, 15000);

  afterAll(async () => { await app.close(); }, 10000);

  it('bound socket sending "rename NewFalcon" receives success command:result', async () => {
    const socket = makeBoundClient(port);
    // Wait for welcome message first
    await waitForEvent(socket, 'command:result');

    const resultPromise = waitForEvent<{ lines: Array<{ text: string; category: string }> }>(
      socket,
      'command:result',
    );
    socket.emit('command', { input: 'rename NewFalcon' });
    const result = await resultPromise;

    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].category).toBe('success');
    expect(result.lines[0].text).toContain('OldFalcon');
    expect(result.lines[0].text).toContain('NewFalcon');

    socket.disconnect();
  });

  it('gateway emits player.snapshot globally after rename (T054)', async () => {
    const socket = makeBoundClient(port);
    await waitForEvent(socket, 'command:result'); // welcome

    const snapshotPromise = waitForEvent<{ players: unknown[] }>(socket, 'player.snapshot');
    socket.emit('command', { input: 'rename NewFalcon' });
    const snapshot = await snapshotPromise;

    expect(snapshot).toHaveProperty('players');
    expect(Array.isArray(snapshot.players)).toBe(true);

    socket.disconnect();
  });
});

// ---------------------------------------------------------------------------
// T055 — Taken name returns error
// ---------------------------------------------------------------------------
describe('cmd rename — name taken (T055)', () => {
  let app: INestApplication;
  let port: number;

  beforeAll(async () => {
    const setup = await buildApp({
      rename: jest.fn().mockResolvedValue({ ok: false, reason: 'NAME_TAKEN' }),
    });
    app = setup.app;
    port = setup.port;
  }, 15000);

  afterAll(async () => { await app.close(); }, 10000);

  it('returns system line mentioning "taken"', async () => {
    const socket = makeBoundClient(port);
    await waitForEvent(socket, 'command:result');

    const resultPromise = waitForEvent<{ lines: Array<{ text: string; category: string }> }>(
      socket,
      'command:result',
    );
    socket.emit('command', { input: 'rename TakenName' });
    const result = await resultPromise;

    expect(result.lines[0].category).toBe('system');
    expect(result.lines[0].text).toMatch(/taken/i);

    socket.disconnect();
  });
});

// ---------------------------------------------------------------------------
// T056 — Byte-identical rename is a no-op
// ---------------------------------------------------------------------------
describe('cmd rename — byte-identical no-op (T056)', () => {
  let app: INestApplication;
  let port: number;

  beforeAll(async () => {
    const setup = await buildApp({
      rename: jest.fn().mockResolvedValue({
        ok: true,
        oldName: 'OldFalcon',
        newName: 'OldFalcon',
        shipId: `${TEST_USERID}:${TEST_SHIPNO}`,
      }),
    });
    app = setup.app;
    port = setup.port;
  }, 15000);

  afterAll(async () => { await app.close(); }, 10000);

  it('returns system "unchanged" message and does NOT emit ship.renamed', async () => {
    const socket = makeBoundClient(port);
    await waitForEvent(socket, 'command:result');

    let shipRenamed = false;
    socket.on('ship.renamed', () => { shipRenamed = true; });

    const resultPromise = waitForEvent<{ lines: Array<{ text: string; category: string }> }>(
      socket,
      'command:result',
    );
    socket.emit('command', { input: 'rename OldFalcon' });
    const result = await resultPromise;

    // Give a brief moment for any stray events to arrive
    await new Promise((r) => setTimeout(r, 200));

    expect(result.lines[0].text).toMatch(/unchanged/i);
    expect(shipRenamed).toBe(false);

    socket.disconnect();
  });
});

// ---------------------------------------------------------------------------
// T057 — Casing-only change triggers broadcast (not a no-op)
// ---------------------------------------------------------------------------
describe('cmd rename — casing-only change triggers broadcast (T057)', () => {
  let app: INestApplication;
  let port: number;

  beforeAll(async () => {
    const setup = await buildApp({
      rename: jest.fn().mockResolvedValue({
        ok: true,
        oldName: 'oldfalcon',
        newName: 'Oldfalcon',
        shipId: `${TEST_USERID}:${TEST_SHIPNO}`,
      }),
    });
    app = setup.app;
    port = setup.port;
  }, 15000);

  afterAll(async () => { await app.close(); }, 10000);

  it('returns success and emits player.snapshot', async () => {
    const socket = makeBoundClient(port);
    await waitForEvent(socket, 'command:result');

    const snapshotPromise = waitForEvent<{ players: unknown[] }>(socket, 'player.snapshot');
    const resultPromise = waitForEvent<{ lines: Array<{ text: string; category: string }> }>(
      socket,
      'command:result',
    );
    socket.emit('command', { input: 'rename Oldfalcon' });

    const [result, snapshot] = await Promise.all([resultPromise, snapshotPromise]);

    expect(result.lines[0].category).toBe('success');
    expect(snapshot).toHaveProperty('players');

    socket.disconnect();
  });
});

// ---------------------------------------------------------------------------
// T058 — Unbound socket cannot rename
// ---------------------------------------------------------------------------
describe('cmd rename — unbound socket (T058)', () => {
  let app: INestApplication;
  let port: number;

  beforeAll(async () => {
    const renameSpy = jest.fn().mockResolvedValue({ ok: false, reason: 'SHIP_NOT_FOUND' });
    const mutateSpy = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      imports: [GatewayModule],
    })
      .overrideProvider(ShipStateService)
      .useValue({
        get: jest.fn().mockReturnValue(undefined), // no ship in memory
        mutate: mutateSpy,
        loadShip: jest.fn(),
        size: jest.fn().mockReturnValue(0),
        findByUserid: jest.fn().mockReturnValue([]),
        findAllShips: jest.fn().mockReturnValue([]), // ticks iterate all ships
        flushAndUnload: jest.fn().mockResolvedValue(undefined),
        unboard: jest.fn().mockResolvedValue(undefined),
        board: jest.fn(),
      })
      .overrideProvider(PrismaService)
      .useValue({
        shipClass: { findMany: jest.fn().mockResolvedValue([]) },
        mine: { findMany: jest.fn().mockResolvedValue([]) },
        ship: {
          findFirst: jest.fn().mockResolvedValue(null), // no DB ship → goes to onboarding
          update: jest.fn().mockResolvedValue({}),
        },
        // scanPl owner lookup + onboarding User-exists guard: a live User row
        // must resolve so the gateway emits prompt:ship-name (not auth:logout).
        user: { findUnique: jest.fn().mockResolvedValue({ userid: TEST_USERID }) },
      })
      .overrideProvider(WsAuthGuard)
      .useValue({
        validate: jest.fn().mockImplementation(
          async (client: import('socket.io').Socket) => {
            client.data.userid = TEST_USERID;
            client.data.username = 'TestPilot';
            return { sub: TEST_USERID, username: 'TestPilot' };
          },
        ),
      })
      .overrideProvider(OnboardingService)
      .useValue({ buildClassListPayload: jest.fn().mockResolvedValue([]) })
      .overrideProvider(RenameService)
      .useValue({ rename: renameSpy })
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

  afterAll(async () => { await app.close(); }, 10000);

  it('unbound socket sending rename receives "No active ship." error, not a rename result', async () => {
    // No ship in DB → gateway enters onboarding, activeShipNo never set
    const socket = ioc(`http://localhost:${port}`, {
      transports: ['websocket'],
      auth: { token: 'mock-valid-token' },
    });

    // Wait for the onboarding prompt (not a welcome)
    await waitForEvent(socket, 'prompt:ship-name');

    // Now try to send a command — the gateway rejects it since activeShipNo is unset
    const resultPromise = waitForEvent<{ lines: Array<{ text: string }> }>(
      socket,
      'command:result',
    );
    socket.emit('command', { input: 'rename Anything' });
    const result = await resultPromise;

    expect(result.lines[0].text).toMatch(/no active ship/i);

    socket.disconnect();
  });
});
