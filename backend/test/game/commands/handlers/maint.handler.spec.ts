/**
 * T019 — Unit spec for MaintHandlerService.
 * Covers happy path (normal planet, Zygor NZ planet) and all rejection paths.
 * @see GECMDS.C:4452 cmd_maint
 * @see contracts/commands.md §maint
 */
import { MaintHandlerService } from '../../../../src/game/commands/handlers/maint.handler';
import { ShipStateService } from '../../../../src/game/ship/ship-state.service';
import { PlanetStateService } from '../../../../src/game/planet/planet-state.service';
import { PrismaService } from '../../../../src/prisma/prisma.service';
import { ShipState } from '../../../../src/game/ship/ship-state.types';
import { formatMessage, MessageId } from '../../../../src/game/commands/messages';
import { MAINT_COST_NORMAL, MAINT_COST_NEUTRAL } from '../../../../src/game/commands/_ship-management-constants';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'Test', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5.5, ycoord: 5.5, damage: 30, energy: 10000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 10, // in orbit of planet 0
    ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: Array(14).fill(0n) as bigint[],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 5, warncntr: 0,
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false,
    dirty: false,
    ...overrides,
  };
}

/** Build a planet object with the given population in items[0].qty */
function makePlanet(population: number) {
  return {
    items: [{ qty: BigInt(population) }],
  };
}

function makeService(opts: {
  planet?: ReturnType<typeof makePlanet> | null;
  cash?: bigint;
} = {}) {
  const { planet = makePlanet(50_000), cash = BigInt(MAINT_COST_NORMAL) * 2n } = opts;

  const mutated: Partial<ShipState> = {};
  const mockShipState = {
    mutate: jest.fn().mockImplementation(
      (_uid: string, _no: number, fn: (s: ShipState) => void) => {
        const s = makeShip();
        fn(s);
        Object.assign(mutated, s);
        return s;
      },
    ),
  } as unknown as ShipStateService;

  const mockPlanetService = {
    get: jest.fn().mockReturnValue(planet),
  } as unknown as PlanetStateService;

  const mockPrisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue({ cash }),
      update: jest.fn().mockResolvedValue({}),
    },
  } as unknown as PrismaService;

  const handler = new MaintHandlerService(mockShipState, mockPlanetService, mockPrisma);
  return { handler, mockShipState, mockPlanetService, mockPrisma, mutated };
}

// ---------------------------------------------------------------------------
// Happy paths
// ---------------------------------------------------------------------------

describe('MaintHandlerService — happy path (normal planet)', () => {
  it('returns MAINT_OK with repair count on success (SC-007)', async () => {
    const { handler } = makeService();
    const ship = makeShip({ damage: 30, where: 10, xcoord: 5.5, ycoord: 5.5 });
    const result = await handler.command.handler(ship, [], {}) as { lines: { text: string; category: string }[] };
    const expectedRepair = Math.floor(30 / 3) + 1; // = 11
    expect(result.lines[0].text).toBe(formatMessage(MessageId.MAINT_OK, expectedRepair));
    expect(result.lines[0].category).toBe('success');
  });

  it('debits MAINT_COST_NORMAL (200 cr) from player cash', async () => {
    const { handler, mockPrisma } = makeService();
    const ship = makeShip({ damage: 30, where: 10, xcoord: 5.5, ycoord: 5.5 });
    await handler.command.handler(ship, [], {});
    expect(mockPrisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { cash: { decrement: BigInt(MAINT_COST_NORMAL) } },
    }));
  });

  it('sets ship.repair = floor(damage/3) + 1 via mutate', async () => {
    const { handler, mockShipState } = makeService();
    const ship = makeShip({ damage: 60, where: 10, xcoord: 5.5, ycoord: 5.5 });
    await handler.command.handler(ship, [], {});
    expect(mockShipState.mutate).toHaveBeenCalled();
    const mutateCall = (mockShipState.mutate as jest.Mock).mock.calls[0];
    const stateCopy = makeShip({ damage: 60 });
    mutateCall[2](stateCopy);
    expect(stateCopy.repair).toBe(Math.floor(60 / 3) + 1); // = 21
  });
});

describe('MaintHandlerService — happy path (Zygor neutral-zone planet)', () => {
  it('charges MAINT_COST_NEUTRAL (2500 cr) at Zygor (plnum=0, sector 0,0)', async () => {
    const { handler, mockPrisma } = makeService({ cash: 10_000n });
    // Planet 0 at sector (0,0) = Zygor
    const ship = makeShip({ damage: 30, where: 10, xcoord: 0.5, ycoord: 0.5 });
    const result = await handler.command.handler(ship, [], {}) as { lines: { text: string }[] };
    expect(mockPrisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { cash: { decrement: BigInt(MAINT_COST_NEUTRAL) } },
    }));
    expect(result.lines[0].text).toContain('Maintenance complete');
  });

  it('charges MAINT_COST_NEUTRAL at Zygor plnum=1 (where=11)', async () => {
    const { handler, mockPrisma } = makeService({ cash: 10_000n });
    const ship = makeShip({ damage: 30, where: 11, xcoord: 0.5, ycoord: 0.5 });
    await handler.command.handler(ship, [], {});
    expect(mockPrisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { cash: { decrement: BigInt(MAINT_COST_NEUTRAL) } },
    }));
  });
});

// ---------------------------------------------------------------------------
// Rejection paths
// ---------------------------------------------------------------------------

describe('MaintHandlerService — rejection paths', () => {
  it('FR-206: where < 10 (not in orbit) → MAINT_NOT_ORBIT', async () => {
    const { handler } = makeService();
    const ship = makeShip({ where: 0 });
    const result = await handler.command.handler(ship, [], {}) as { lines: { text: string }[] };
    expect(result.lines[0].text).toBe(formatMessage(MessageId.MAINT_NOT_ORBIT));
  });

  it('FR-207: no planet at location → MAINT_NO_FACILITY', async () => {
    const { handler } = makeService({ planet: null });
    const ship = makeShip({ where: 10 });
    const result = await handler.command.handler(ship, [], {}) as { lines: { text: string }[] };
    expect(result.lines[0].text).toBe(formatMessage(MessageId.MAINT_NO_FACILITY));
  });

  it('FR-207: planet population < 25000 → MAINT_NO_FACILITY', async () => {
    const { handler } = makeService({ planet: makePlanet(24_999) });
    const ship = makeShip({ where: 10 });
    const result = await handler.command.handler(ship, [], {}) as { lines: { text: string }[] };
    expect(result.lines[0].text).toBe(formatMessage(MessageId.MAINT_NO_FACILITY));
  });

  it('FR-207: planet population exactly 25000 → succeeds (boundary)', async () => {
    const { handler } = makeService({ planet: makePlanet(25_000), cash: 10_000n });
    const ship = makeShip({ damage: 10, where: 10, xcoord: 5.5, ycoord: 5.5 });
    const result = await handler.command.handler(ship, [], {}) as { lines: { text: string }[] };
    expect(result.lines[0].text).toContain('Maintenance complete');
  });

  it('FR-208: cantexit > 0 (combat-locked) → MAINT_COMBAT', async () => {
    const { handler } = makeService();
    const ship = makeShip({ where: 10, cantexit: 3 });
    const result = await handler.command.handler(ship, [], {}) as { lines: { text: string }[] };
    expect(result.lines[0].text).toBe(formatMessage(MessageId.MAINT_COMBAT));
  });

  it('FR-209: NZ sector (0,0) with plnum=2 (not Zygor) → MAINT_NZ', async () => {
    const { handler } = makeService();
    // plnum = where - 10 = 12 - 10 = 2
    const ship = makeShip({ where: 12, xcoord: 0.5, ycoord: 0.5, damage: 30 });
    const result = await handler.command.handler(ship, [], {}) as { lines: { text: string }[] };
    expect(result.lines[0].text).toBe(formatMessage(MessageId.MAINT_NZ));
  });

  it('FR-204: damage == 0 → MAINT_NO_DAMAGE', async () => {
    const { handler } = makeService();
    const ship = makeShip({ where: 10, damage: 0 });
    const result = await handler.command.handler(ship, [], {}) as { lines: { text: string }[] };
    expect(result.lines[0].text).toBe(formatMessage(MessageId.MAINT_NO_DAMAGE));
  });

  it('FR-205: cash < price → MAINT_NO_CASH', async () => {
    const { handler } = makeService({ cash: BigInt(MAINT_COST_NORMAL - 1) });
    const ship = makeShip({ where: 10, damage: 30, xcoord: 5.5, ycoord: 5.5 });
    const result = await handler.command.handler(ship, [], {}) as { lines: { text: string }[] };
    expect(result.lines[0].text).toBe(formatMessage(MessageId.MAINT_NO_CASH));
  });

  it('FR-205: cash == 0 → MAINT_NO_CASH', async () => {
    const { handler } = makeService({ cash: 0n });
    const ship = makeShip({ where: 10, damage: 30, xcoord: 5.5, ycoord: 5.5 });
    const result = await handler.command.handler(ship, [], {}) as { lines: { text: string }[] };
    expect(result.lines[0].text).toBe(formatMessage(MessageId.MAINT_NO_CASH));
  });
});

describe('MaintHandlerService — command metadata', () => {
  it('keyword is "maint", no aliases (mai moved to MaiHandlerService, T013), minArgs is 0', () => {
    const { handler } = makeService();
    expect(handler.command.keyword).toBe('maint');
    expect(handler.command.aliases).not.toContain('mai');
    expect(handler.command.minArgs).toBe(0);
  });
});
