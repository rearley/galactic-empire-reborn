/**
 * T8: Multi-ship full-lifecycle integration test.
 *
 * Proves the end-to-end fleet model:
 *   T8-A: 2 ships on login → prompt:ship-select menu → select #2 → boards #2
 *         (dormancy: ship #1 NOT boarded while #2 is flown)
 *   T8-B: Post-death reconnect — after active ship (#2) is deleted, reconnect
 *         with 1 surviving ship → auto-boards #1 without a selection menu
 *   T8-C: Zero-fleet reconnect — after losing all ships (0 ships in DB),
 *         reconnect enters the onboarding free-starter path (prompt:ship-name)
 *   T8-D: handleCombatShipDestroyed lifecycle at service+DB layer —
 *         delete the killed hull only; decrement noships; survivor untouched
 *
 * Assertion layer:
 *   T8-A / T8-B / T8-C: socket e2e via full GatewayModule + mocked services
 *                        (matches the harness used by onboarding/ship-select.spec.ts)
 *   T8-D: direct gateway handler (matches combat-death-delete.spec.ts pattern)
 *
 * The full lifecycle path:
 *   T8-A (2 ships → select #2) → T8-D (death of #2: noships 2→1) →
 *   T8-B (reconnect 1 ship → auto-board #1) → T8-D (death of #1: noships 1→0) →
 *   T8-C (reconnect 0 ships → free-starter onboarding)
 *
 * @see specs/030-multi-ship — design spec, tasks
 * @see GEFUNCS.C:lookupshp, selectship, killem
 * @see GECMDS.C:4558-4583 new ship (Zygor purchase)
 */

// Must be set before module instantiation
process.env['JWT_SECRET'] = 'test-secret-multi-ship-lifecycle';

import 'reflect-metadata';
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
import { ShipClassCacheService } from '../../src/game/physics/ship-class-cache.service';
import { ShipState } from '../../src/game/ship/ship-state.types';
import { ScanHandlerService } from '../../src/game/commands/handlers/scan.handler';
import {
  COMBAT_SHIP_DESTROYED,
  CombatShipDestroyedEvent,
} from '../../src/game/combat/combat-events';
import { mockRandom } from '../fixtures/mock-random';
import { makeGateway } from '../helpers/make-gateway';
import { makeShip as baseMakeShip } from '../helpers/make-ship';
import type { Mock } from 'vitest';

// ─── Shared constants ────────────────────────────────────────────────────────

const TEST_USERID = 'u-multi-ship-lifecycle';

// ─── Helper factories ────────────────────────────────────────────────────────

function makeShipState(overrides: {
  userid: string;
  shipno: number;
  shipname: string;
  xcoord?: number;
  ycoord?: number;
}): ShipState {
  return baseMakeShip({
    userid: overrides.userid,
    shipno: overrides.shipno,
    shipname: overrides.shipname,
    xcoord: overrides.xcoord ?? 5,
    ycoord: overrides.ycoord ?? 3,
    status: 0,
    topspeed: 0,
  });
}

/** Minimal Prisma-shaped ship row for use in findMany mocks. */
function makePrismaShip(
  shipno: number,
  shipname: string,
  xcoord = 5.5,
  ycoord = 3.5,
) {
  return {
    userid: TEST_USERID,
    shipno,
    shipname,
    shpclass: 1,
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

function makeClient(port: number): Socket {
  return ioc(`http://localhost:${port}`, {
    transports: ['websocket'],
    auth: { token: 'mock-valid-token' },
  });
}

/** Build a NestJS test application with mocked services. */
function makeGatewayApp(
  shipManyRows: object[],
  findFirstResult: object | null,
  boardMock: Mock,
  getMock: Mock,
) {
  const shipStateServiceMock = {
    findByUserid: vi.fn().mockReturnValue([]),
    findAllShips: vi.fn().mockReturnValue([]),
    get: getMock,
    loadShip: vi.fn(),
    mutate: vi.fn(),
    size: vi.fn().mockReturnValue(0),
    flushAndUnload: vi.fn().mockResolvedValue(undefined),
    unboard: vi.fn().mockResolvedValue(undefined),
    board: boardMock,
  };

  const prismaMock = {
    shipClass: { findMany: vi.fn().mockResolvedValue([]) },
    mine: { findMany: vi.fn().mockResolvedValue([]) },
    ship: {
      findMany: vi.fn().mockResolvedValue(shipManyRows),
      findFirst: vi.fn().mockResolvedValue(findFirstResult),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue({ userid: TEST_USERID }),
    },
  };

  return Test.createTestingModule({ imports: [GatewayModule] })
    .overrideProvider(ShipStateService)
    .useValue(shipStateServiceMock)
    .overrideProvider(CommandRouterService)
    .useValue({ register: vi.fn(), dispatch: vi.fn().mockReturnValue({ lines: [] }) })
    .overrideProvider(PrismaService)
    .useValue(prismaMock)
    .overrideProvider(ShipClassCacheService)
    .useValue({ getTypeName: vi.fn().mockReturnValue('Interceptor'), onModuleInit: vi.fn() })
    .overrideProvider(WsAuthGuard)
    .useValue({
      validate: vi.fn().mockImplementation(async (client: import('socket.io').Socket) => {
        client.data.userid = TEST_USERID;
        client.data.username = 'MultiShipPilot';
        return { sub: TEST_USERID, username: 'MultiShipPilot' };
      }),
    })
    .overrideProvider(OnboardingService)
    .useValue({
      buildClassListPayload: vi.fn().mockResolvedValue([]),
      validateNameReply: vi.fn().mockReturnValue(false),
      finalize: vi.fn(),
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
    });
}

/** Build CombatShipDestroyedEvent for direct gateway handler tests. */
const makeDestroyedEvent = (
  victimUserid: string,
  victimShipno: number,
): CombatShipDestroyedEvent => ({
  victimId: `${victimUserid}:${victimShipno}`,
  attackerId: null,
  victimShipKey: `${victimUserid}:${victimShipno}`,
  attackerShipKey: null,
  victimUserid,
  attackerUserid: null,
  attackerChannel: 255,
  weapon: 'phaser',
  sector: { x: 5, y: 3 },
  tickAt: new Date(),
  loot: [],
  scoreAwarded: 0,
});

// ─────────────────────────────────────────────────────────────────────────────
// T8-A: 2 ships on login → prompt:ship-select → select #2 → boards #2
//       Dormancy: ship #1 is NOT boarded while the player flies #2
// ─────────────────────────────────────────────────────────────────────────────

describe('Lifecycle T8-A: fleet purchase simulation + ship-select + dormancy', () => {
  let app: INestApplication;
  let port: number;
  let boardMock: Mock;
  let inMemoryMap: Map<string, ShipState>;

  const ship1 = makePrismaShip(1, 'Falcon', 5.5, 3.5);
  const ship2 = makePrismaShip(2, 'Hawk', 12.5, 7.5);
  const ship2State = makeShipState({ userid: TEST_USERID, shipno: 2, shipname: 'Hawk', xcoord: 12, ycoord: 7 });

  beforeAll(async () => {
    // The in-memory map is shared by all tests in this suite.
    // beforeEach clears it so each test starts with a cold cache —
    // guaranteeing board() fires and the warm-cache path is not hit.
    inMemoryMap = new Map<string, ShipState>();
    boardMock = vi.fn();
    boardMock.mockImplementation((state: ShipState) => {
      inMemoryMap.set(`${state.userid}:${state.shipno}`, state);
    });
    const getMock = vi.fn().mockImplementation((userid: string, shipno: number) => {
      return inMemoryMap.get(`${userid}:${shipno}`);
    });

    const findFirstImpl = vi.fn().mockImplementation(
      (args: { where: { userid: string; shipno: number } }) => {
        const { shipno } = args?.where ?? {};
        if (shipno === 1) return Promise.resolve(ship1);
        if (shipno === 2) return Promise.resolve(ship2);
        return Promise.resolve(null);
      },
    );

    // Override ship.findFirst to use the per-shipno impl
    void ship2State; // referenced via inMemoryMap after boarding

    const module: TestingModule = await makeGatewayApp(
      [ship1, ship2], // DB has 2 ships — simulates having bought a 2nd at Zygor
      null,
      boardMock,
      getMock,
    ).compile();

    // Patch findFirst on the prisma mock
    const prisma = module.get(PrismaService) as unknown as {
      ship: { findMany: Mock; findFirst: Mock; updateMany: Mock };
    };
    prisma.ship.findFirst = findFirstImpl;

    app = module.createNestApplication();
    app.useWebSocketAdapter(new IoAdapter(app));
    await app.listen(0);
    port = parseInt(new URL(await app.getUrl()).port, 10);
  }, 15_000);

  afterAll(async () => { await app.close(); }, 10_000);

  // Clear the in-memory map and mock call records before each test so that
  // the warm-cache path is never hit and board() fires fresh each time.
  beforeEach(() => {
    inMemoryMap.clear();
    boardMock.mockClear();
  });

  it('connect with 2 ships → receives prompt:ship-select listing both hulls', async () => {
    const socket = makeClient(port);

    const payload = await waitForEvent<{
      step: string;
      ships: Array<{ index: number; shipno: number; shipname: string; sector: { x: number; y: number } }>;
    }>(socket, 'prompt:ship-select');

    expect(payload.step).toBe('SHIP_SELECT');
    expect(payload.ships).toHaveLength(2);

    // First entry = ship #1 (Falcon, sector 5,3)
    expect(payload.ships[0]).toMatchObject({ index: 1, shipno: 1, shipname: 'Falcon', sector: { x: 5, y: 3 } });
    // Second entry = ship #2 (Hawk, sector 12,7)
    expect(payload.ships[1]).toMatchObject({ index: 2, shipno: 2, shipname: 'Hawk', sector: { x: 12, y: 7 } });

    socket.disconnect();
  });

  it('select #2 → boards ship #2, emits welcome + snapshot', async () => {
    const socket = makeClient(port);

    await waitForEvent(socket, 'prompt:ship-select');

    const [result, snapshot] = await Promise.all([
      waitForEvent<{ lines: Array<{ text: string }> }>(socket, 'command:result'),
      waitForEvent<{ players: unknown[] }>(socket, 'player.snapshot'),
      Promise.resolve().then(() => socket.emit('prompt:reply', { value: '2' })),
    ]);

    expect(result.lines[0].text).toMatch(/Welcome aboard/i);
    expect(snapshot).toHaveProperty('players');

    // board() must have been called with shipno: 2
    expect(boardMock).toHaveBeenCalledWith(expect.objectContaining({ shipno: 2 }));

    socket.disconnect();
  });

  it('DORMANCY — board() called only for ship #2 (the chosen hull); ship #1 never boarded', async () => {
    const socket = makeClient(port);

    await waitForEvent(socket, 'prompt:ship-select');

    await Promise.all([
      waitForEvent(socket, 'command:result'),
      waitForEvent(socket, 'player.snapshot'),
      Promise.resolve().then(() => socket.emit('prompt:reply', { value: '2' })),
    ]);

    // board() must have been called exactly once — for ship #2
    expect(boardMock).toHaveBeenCalledTimes(1);
    expect(boardMock).toHaveBeenCalledWith(expect.objectContaining({ shipno: 2 }));

    // board() must NOT have been called for ship #1 — it is dormant (DB-only)
    const boardedWithShip1 = boardMock.mock.calls.some(
      ([state]) => (state as ShipState).shipno === 1,
    );
    expect(boardedWithShip1).toBe(false);

    socket.disconnect();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T8-B: Post-death reconnect — only 1 ship survives → auto-boards (no menu)
//
// Scenario: ship #2 was active and got killed (T8-D proves the delete).
// On next login the DB has only ship #1. Gateway must auto-board it directly
// without showing prompt:ship-select.
// ─────────────────────────────────────────────────────────────────────────────

describe('Lifecycle T8-B: post-death reconnect → survivor auto-board (no selection menu)', () => {
  let app: INestApplication;
  let port: number;
  let boardMock: Mock;
  let inMemoryMap: Map<string, ShipState>;

  const ship1 = makePrismaShip(1, 'Falcon', 5.5, 3.5);

  beforeAll(async () => {
    inMemoryMap = new Map<string, ShipState>();
    boardMock = vi.fn();
    boardMock.mockImplementation((state: ShipState) => {
      inMemoryMap.set(`${state.userid}:${state.shipno}`, state);
    });
    const getMock = vi.fn().mockImplementation((userid: string, shipno: number) => {
      return inMemoryMap.get(`${userid}:${shipno}`);
    });

    const module: TestingModule = await makeGatewayApp(
      [ship1], // DB has exactly 1 ship — ship #2 was deleted on death
      null,
      boardMock,
      getMock,
    ).compile();

    app = module.createNestApplication();
    app.useWebSocketAdapter(new IoAdapter(app));
    await app.listen(0);
    port = parseInt(new URL(await app.getUrl()).port, 10);
  }, 15_000);

  afterAll(async () => { await app.close(); }, 10_000);

  beforeEach(() => {
    inMemoryMap.clear();
    boardMock.mockClear();
  });

  it('reconnect with 1 surviving ship → auto-boards it (no prompt:ship-select emitted)', async () => {
    const socket = makeClient(port);

    let gotShipSelect = false;
    socket.on('prompt:ship-select', () => { gotShipSelect = true; });

    const result = await waitForEvent<{ lines: Array<{ text: string }> }>(socket, 'command:result');

    expect(result.lines[0].text).toMatch(/Welcome aboard/i);
    expect(gotShipSelect).toBe(false);

    socket.disconnect();
  });

  it('auto-board used the correct survivor shipno (1)', async () => {
    const socket = makeClient(port);

    await waitForEvent(socket, 'command:result');

    // board() must have been called (ship was cold; get() returned undefined)
    expect(boardMock).toHaveBeenCalledWith(expect.objectContaining({ shipno: 1 }));

    socket.disconnect();
  });

  it('no prompt:ship-name emitted either — this is a returning player, not new', async () => {
    const socket = makeClient(port);

    let gotShipName = false;
    socket.on('prompt:ship-name', () => { gotShipName = true; });

    await waitForEvent(socket, 'command:result');

    await new Promise(r => setTimeout(r, 80));
    expect(gotShipName).toBe(false);

    socket.disconnect();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T8-C: Zero-fleet reconnect → onboarding free-starter path
//
// Scenario: a player lost their last ship (ship #1 killed after ship #2 was
// already dead). noships == 0. On next login the gateway finds 0 ship rows
// and routes to the onboarding free-starter grant (prompt:ship-name).
// ─────────────────────────────────────────────────────────────────────────────

describe('Lifecycle T8-C: zero-fleet reconnect → free-starter onboarding path', () => {
  let app: INestApplication;
  let port: number;

  beforeAll(async () => {
    const boardMock = vi.fn();
    const getMock = vi.fn().mockReturnValue(undefined);

    const module: TestingModule = await makeGatewayApp(
      [], // DB has 0 ships — both hulls deleted
      null,
      boardMock,
      getMock,
    ).compile();

    app = module.createNestApplication();
    app.useWebSocketAdapter(new IoAdapter(app));
    await app.listen(0);
    port = parseInt(new URL(await app.getUrl()).port, 10);
  }, 15_000);

  afterAll(async () => { await app.close(); }, 10_000);

  it('0 ships → receives prompt:ship-name (onboarding), never prompt:ship-select', async () => {
    const socket = makeClient(port);

    let gotShipSelect = false;
    socket.on('prompt:ship-select', () => { gotShipSelect = true; });

    await waitForEvent(socket, 'prompt:ship-name');

    await new Promise(r => setTimeout(r, 80));
    expect(gotShipSelect).toBe(false);

    socket.disconnect();
  });

  it('0 ships → prompt:ship-name carries NAME step + printable-ASCII rule', async () => {
    const socket = makeClient(port);

    const prompt = await waitForEvent<{ step: string; rule: string }>(socket, 'prompt:ship-name');

    expect(prompt.step).toBe('NAME');
    expect(prompt.rule).toMatch(/printable/i);

    socket.disconnect();
  });

  it('0 ships → no welcome command:result emitted before name prompt', async () => {
    const socket = makeClient(port);

    let gotWelcome = false;
    socket.on('command:result', () => { gotWelcome = true; });

    await waitForEvent(socket, 'prompt:ship-name');

    await new Promise(r => setTimeout(r, 80));
    expect(gotWelcome).toBe(false);

    socket.disconnect();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T8-D: handleCombatShipDestroyed — lifecycle service+DB layer
//
// Proves the death-delete contract in the multi-ship context:
//   - killing ship #2 (of a 2-ship user) deletes only ship #2's row
//   - noships decrements from 2 → 1 (ship #1 survives)
//   - killing the LAST ship (noships 1→0) triggers the final decrement
//   - removeFromGame evicts from memory in both cases
//
// This pairs with T8-A (how the state got to 2 ships) and T8-B/C (what
// happens when the player reconnects after each death).
// ─────────────────────────────────────────────────────────────────────────────

describe('Lifecycle T8-D: handleCombatShipDestroyed — multi-ship delete + noships decrement', () => {
  let deleteManyMock: Mock;
  let userFindUniqueMock: Mock;
  let userUpdateMock: Mock;
  let transactionMock: Mock;
  let removeFromGameMock: Mock;
  let serverEmitMock: Mock;

  const buildGateway = (noships: number, deletedCount = 1) => {
    serverEmitMock = vi.fn();
    deleteManyMock = vi.fn().mockResolvedValue({ count: deletedCount });
    userFindUniqueMock = vi.fn().mockResolvedValue({ noships });
    userUpdateMock = vi.fn().mockResolvedValue(undefined);
    removeFromGameMock = vi.fn();

    const txMock = {
      // findFirst is the in-transaction AI-status fallback used when the victim is
      // not in memory (get → undefined here). status 1 = PLAYER → delete proceeds.
      ship: { deleteMany: deleteManyMock, findFirst: vi.fn().mockResolvedValue({ status: 1 }) },
      user: { findUnique: userFindUniqueMock, update: userUpdateMock },
    };
    transactionMock = vi.fn().mockImplementation(
      (fn: (tx: typeof txMock) => Promise<void>) => fn(txMock),
    );

    const mockPrisma = {
      ship: {
        findFirst: vi.fn().mockResolvedValue(null),
        updateMany: vi.fn(),
      },
      user: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: transactionMock,
    } as unknown as PrismaService;

    const mockShipStateSvc: Partial<ShipStateService> = {
      get: vi.fn().mockReturnValue(undefined),
      flushAndUnload: vi.fn().mockResolvedValue(undefined),
      unboard: vi.fn().mockResolvedValue(undefined),
      board: vi.fn(),
      removeFromGame: removeFromGameMock,
      findAllShips: vi.fn().mockReturnValue([]),
      findByUserid: vi.fn().mockReturnValue([]),
    };

    const gw = makeGateway({
      shipStateService: mockShipStateSvc as ShipStateService,
      wsAuthGuard: { validate: vi.fn() } as unknown as WsAuthGuard,
      prisma: mockPrisma,
      onboardingService: { buildClassListPayload: vi.fn().mockResolvedValue([]) } as unknown as OnboardingService,
      scanHandler: { clearScantab: vi.fn() } as unknown as ScanHandlerService,
      random: mockRandom,
    });
    (gw as unknown as { server: unknown }).server = {
      // handleCombatShipDestroyed also sends YOURDEAD to the victim's own room
      // (GEFUNCS.C:978-987), so the double needs a to().
      to: vi.fn(() => ({ emit: vi.fn() })),
      except: vi.fn(() => ({ emit: vi.fn() })),
      emit: serverEmitMock,
      sockets: { sockets: { get: vi.fn().mockReturnValue(undefined) } },
    };
    return gw;
  };

  // ── 2-ship user: kill ship #2 → only ship #2 deleted, noships 2 → 1 ─────

  it('killing ship #2 (of 2) — deleteMany targets shipno:2 only, noships 2 → 1', async () => {
    const gw = buildGateway(2);
    gw.handleCombatShipDestroyed(makeDestroyedEvent(TEST_USERID, 2));
    for (let i = 0; i < 8; i++) await Promise.resolve();

    // Only ship #2 deleted — ship #1 untouched
    expect(deleteManyMock).toHaveBeenCalledWith({
      where: { userid: TEST_USERID, shipno: 2 },
    });
    expect(deleteManyMock).toHaveBeenCalledTimes(1);

    // noships decremented: 2 → 1 (one survivor: ship #1)
    expect(userUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userid: TEST_USERID },
        data: { noships: { decrement: 1 } },
      }),
    );

    // memory eviction for ship #2
    expect(removeFromGameMock).toHaveBeenCalledWith({ userid: TEST_USERID, shipno: 2 });
  });

  it('killing ship #2 does NOT evict ship #1 from memory', async () => {
    const gw = buildGateway(2);
    gw.handleCombatShipDestroyed(makeDestroyedEvent(TEST_USERID, 2));
    for (let i = 0; i < 8; i++) await Promise.resolve();

    // removeFromGame must have been called exactly once with shipno:2
    expect(removeFromGameMock).toHaveBeenCalledTimes(1);
    expect(removeFromGameMock).not.toHaveBeenCalledWith({ userid: TEST_USERID, shipno: 1 });
  });

  // ── Last-ship kill: noships 1 → 0 (free-starter on next login) ───────────

  it('killing last ship (noships 1 → 0) — decrements to 0 (triggers free-starter path on reconnect)', async () => {
    const gw = buildGateway(1);
    gw.handleCombatShipDestroyed(makeDestroyedEvent(TEST_USERID, 1));
    for (let i = 0; i < 8; i++) await Promise.resolve();

    expect(deleteManyMock).toHaveBeenCalledWith({
      where: { userid: TEST_USERID, shipno: 1 },
    });
    // noships was 1; decrement → 0 triggers T8-C (0 ships on reconnect → onboarding)
    expect(userUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: { noships: { decrement: 1 } } }),
    );
    expect(removeFromGameMock).toHaveBeenCalledWith({ userid: TEST_USERID, shipno: 1 });
  });

  it('noships underflow guard — does NOT decrement when noships already 0', async () => {
    const gw = buildGateway(0); // stale/raced state: noships already 0
    gw.handleCombatShipDestroyed(makeDestroyedEvent(TEST_USERID, 1));
    for (let i = 0; i < 8; i++) await Promise.resolve();

    expect(userUpdateMock).not.toHaveBeenCalled();
    expect(removeFromGameMock).toHaveBeenCalledWith({ userid: TEST_USERID, shipno: 1 });
  });

  // ── Race guard: row already gone → no decrement ─────────────────────────

  it('row already gone (deleteMany count=0) → no noships decrement (race safety)', async () => {
    const gw = buildGateway(2, 0); // deletedCount=0 → already deleted
    gw.handleCombatShipDestroyed(makeDestroyedEvent(TEST_USERID, 2));
    for (let i = 0; i < 8; i++) await Promise.resolve();

    expect(deleteManyMock).toHaveBeenCalledTimes(1);
    expect(userUpdateMock).not.toHaveBeenCalled();
    // memory eviction still happens even when DB row was already gone
    expect(removeFromGameMock).toHaveBeenCalledWith({ userid: TEST_USERID, shipno: 2 });
  });

  // ── COMBAT_SHIP_DESTROYED broadcast fires after delete ──────────────────

  it('broadcasts COMBAT_SHIP_DESTROYED galaxy-wide after the delete transaction', async () => {
    const gw = buildGateway(2);
    gw.handleCombatShipDestroyed(makeDestroyedEvent(TEST_USERID, 2));
    for (let i = 0; i < 8; i++) await Promise.resolve();

    expect(serverEmitMock).toHaveBeenCalledWith(
      COMBAT_SHIP_DESTROYED,
      // The payload is scoped to what the client renders — `victimUserid` and
      // the rest of the internal event no longer travel.
      // @see test/gateway/destroyed-payload-scoping.spec.ts
      expect.objectContaining({ victimId: `${TEST_USERID}:2` }),
    );
  });
});
