/**
 * T066 — Planet command round-trip integration tests.
 *
 * Exercises the full text-command path through CommandRouterService for
 * planet-related commands: orbit, land (claim), report cargo, and alias dispatch.
 *
 * Pattern mirrors command-roundtrip.spec.ts but avoids spinning up a full NestJS
 * HTTP/WS app — it uses a focused TestingModule with CommandsModule only, with all
 * injected dependencies overridden by mocks.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { CommandsModule } from '../../src/game/commands/commands.module';
import { CommandRouterService } from '../../src/game/commands/command-router.service';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { GalaxyService } from '../../src/game/galaxy/galaxy.service';
import { PlanetStateService } from '../../src/game/planet/planet-state.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TickService } from '../../src/game/tick/tick.service';
import { TickKind } from '../../src/game/tick/tick.types';
import { formatMessage, MessageId } from '../../src/game/commands/messages';
import { ShipState } from '../../src/game/ship/ship-state.types';
import { CommandResult } from '../../src/game/commands/command.types';
import { NUMITEMS } from '../../src/game/constants/items';
import { PlanetState } from '../../src/game/planet/planet-state.types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeShipState(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1',
    shipno: 1,
    shipname: 'Enterprise',
    shpclass: 1,
    heading: 0,
    head2b: 0,
    speed: 0,
    speed2b: 0,
    xcoord: 5.5,
    ycoord: 3.5,
    damage: 0,
    energy: 1000,
    phasr: 0,
    phasrtype: 0,
    kills: 0,
    lastfired: 0,
    shieldtype: 0,
    shieldstat: 0,
    shield: 0,
    cloak: 0,
    degrees: 0,
    percent: 0,
    tactical: 0,
    helm: 0,
    train: 0,
    where: 0,
    ltorpsChannel: [],
    ltorpsDistance: [],
    lmisslChannel: [],
    lmisslDistance: [],
    lmisslEnergy: [],
    decout: [],
    jammer: 0,
    freq: [0, 0, 0],
    items: Array<bigint>(NUMITEMS).fill(0n),
    titem: 0,
    hostile: 0,
    cantexit: 0,
    repair: 0,
    hypha: 0,
    firecntl: 0,
    destruct: 0,
    status: 0,
    cybmine: 0,
    cybskill: 0,
    cybupdate: 0,
    tick: 0,
    emulate: 0,
    minesnear: 0,
    lock: 0,
    holdcourse: 0,
    topspeed: 5,
    warncntr: 0,
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...overrides,
  };
}

function makePlanetState(overrides: Partial<PlanetState> = {}): PlanetState {
  return {
    xsect: 5,
    ysect: 3,
    plnum: 1,
    type: 2,
    xcoord: 5.5,
    ycoord: 3.5,
    userid: null,
    name: '',
    enviorn: 1,
    resource: 1,
    cash: 0n,
    debt: 0n,
    tax: 0n,
    taxrate: 0,
    warnings: 0,
    password: '',
    lastattack: '',
    beacon: '',
    spyowner: '',
    technology: 0,
    teamcode: 0n,
    items: Array.from({ length: NUMITEMS }, () => ({
      qty: 1000n,
      rate: 10,
      sell: true,
      reserve: 0,
      markup2a: 5,
      sold2a: 0n,
    })),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('command round-trip (planet) integration (T066)', () => {
  let module: TestingModule;
  let commandRouter: CommandRouterService;
  let shipService: ShipStateService;

  const USERID = 'u1';
  const SHIPNO = 1;

  beforeEach(async () => {
    // Build a real ShipStateService backed by a minimal Prisma mock.
    // We initialise it manually so the in-memory map is populated before compile().
    const tickServiceMock = {
      subscribe: jest.fn().mockImplementation(
        (_kind: TickKind, _handler: () => Promise<void>) => () => {},
      ),
      registerSnapshotProvider: jest.fn(),
      startPlanetUpdateTimer: jest.fn(),
      onModuleInit: jest.fn(),
    };

    const prismaMockForShip = {
      ship: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
      shipClass: {
        findMany: jest.fn().mockResolvedValue([
          {
            classNumber: 1,
            scanRange: 5000,
            typeName: 'Interceptor',
            hasCloak: false,
            maxTons: 200,
          },
        ]),
      },
      user: { update: jest.fn().mockResolvedValue({}) },
      mine: { findMany: jest.fn().mockResolvedValue([]) },
    };

    // Construct a real ShipStateService and inject the test ship manually.
    shipService = new ShipStateService(
      prismaMockForShip as never,
      tickServiceMock as never,
    );
    await shipService.onModuleInit(); // empty DB → empty map

    // Inject the ship directly into the private map.
    const ship = makeShipState();
    (shipService as unknown as { map: Map<string, ShipState> }).map.set(
      `${USERID}:${SHIPNO}`,
      ship,
    );

    const planet = makePlanetState();

    const galaxyMock = {
      getSectorPlanets: jest.fn().mockReturnValue([planet]),
      getSectorWormholes: jest.fn().mockReturnValue([]),
      findPlanetByName: jest.fn().mockReturnValue(null),
      getMeta: jest.fn(),
      onModuleInit: jest.fn(),
    };

    const planetServiceMock = {
      get: jest.fn().mockReturnValue(planet),
      claim: jest.fn().mockResolvedValue({ ok: true }),
      buy: jest.fn().mockResolvedValue({ ok: true, transferred: 10, unitPrice: 2, totalCost: 20n }),
      sell: jest.fn().mockResolvedValue({ ok: true, transferred: 5, proceeds: 9n, fee: 1n }),
      all: jest.fn().mockReturnValue([]),
      onModuleInit: jest.fn(),
    };

    module = await Test.createTestingModule({
      imports: [CommandsModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMockForShip)
      .overrideProvider(ShipStateService)
      .useValue(shipService)
      .overrideProvider(GalaxyService)
      .useValue(galaxyMock)
      .overrideProvider(PlanetStateService)
      .useValue(planetServiceMock)
      .overrideProvider(TickService)
      .useValue(tickServiceMock)
      .compile();

    // Triggers onModuleInit on CommandsModule (registers all handlers) and
    // ReportHandlerService.onModuleInit (populates class cache).
    await module.init();

    commandRouter = module.get(CommandRouterService);
  }, 15_000);

  afterEach(async () => {
    await module.close();
  }, 10_000);

  // -------------------------------------------------------------------------
  // T066-1: orbit → sets ship.where to 10 + plnum
  // -------------------------------------------------------------------------
  it('orbit → sets ship.where to 10 + plnum', async () => {
    const ship = shipService.get(USERID, SHIPNO)!;
    expect(ship.where).toBe(0); // precondition: not in orbit

    commandRouter.dispatch('orbit', ship, {}) as CommandResult;

    const updated = shipService.get(USERID, SHIPNO);
    expect(updated?.where).toBe(11); // 10 + plnum(1)
  });

  // -------------------------------------------------------------------------
  // T066-2: land Aurora on unowned planet → LAND_CLAIMED
  // -------------------------------------------------------------------------
  it('land Aurora on unowned planet → LAND_CLAIMED message', async () => {
    // Put ship in orbit of plnum=1
    const ship = shipService.get(USERID, SHIPNO)!;
    shipService.mutate(USERID, SHIPNO, (s) => {
      s.where = 11;
    });
    const shipInOrbit = shipService.get(USERID, SHIPNO)!;

    // `land` awaits the claim now, so its outcome (including a PLANET_LIMIT
    // refusal) reaches the player instead of being fire-and-forget.
    const result = (await commandRouter.dispatch('land Aurora', shipInOrbit, {})) as CommandResult;

    // Args are now passed with original casing preserved (keyword is lowercased, args are not).
    expect(result.lines[0].text).toBe(formatMessage(MessageId.LAND_CLAIMED, 'Aurora'));
    expect(result.lines[0].category).toBe('success');

    void ship; // referenced to keep lint happy
  });

  // -------------------------------------------------------------------------
  // T066-3: report cargo on empty ship → REP_CARGO_NONE line
  // -------------------------------------------------------------------------
  it('report cargo on empty ship → contains REP_CARGO_NONE line', async () => {
    const ship = shipService.get(USERID, SHIPNO)!;
    expect(ship.items.every((qty) => qty === 0n)).toBe(true); // precondition

    const result = await (commandRouter.dispatch('report cargo', ship, {}) as Promise<CommandResult>);

    const hasNoneLine = result.lines.some(
      (l) => l.text === formatMessage(MessageId.REP_CARGO_NONE),
    );
    expect(hasNoneLine).toBe(true);
  });

  // -------------------------------------------------------------------------
  // T066-4: alias "orb" dispatches to orbit handler (not UNKNOWN_CMD / REPFMT)
  // -------------------------------------------------------------------------
  it('alias "orb" dispatches to orbit handler (not UNKNOWN_CMD)', () => {
    const ship = shipService.get(USERID, SHIPNO)!;

    const result = commandRouter.dispatch('orb', ship, {}) as CommandResult;

    // Should NOT be an unknown-command error
    const unknownText = formatMessage(MessageId.UNKNOWN_CMD);
    expect(result.lines[0]?.text).not.toBe(unknownText);

    // Should NOT be the report-format error (guard against mis-routing to report)
    const repfmtText = formatMessage(MessageId.REPFMT);
    expect(result.lines[0]?.text).not.toBe(repfmtText);

    // Should produce the orbit result (success or "already in orbit" — both are valid
    // orbit-handler responses, not routing failures).
    const orbitTexts = [
      formatMessage(MessageId.ORBITALR),
      formatMessage(MessageId.ORBITNO),
    ];
    const isOrbitResponse =
      result.lines[0]?.category === 'success' ||
      orbitTexts.some((t) => result.lines[0]?.text === t);
    expect(isOrbitResponse).toBe(true);
  });
});
