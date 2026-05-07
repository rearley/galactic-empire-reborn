/**
 * T045-T046 — Password gate tests for MaintHandlerService.
 * Covers FR-014-060 (no arg + passworded), FR-014-061 (wrong arg),
 * FR-014-062 (password == "none" bypass), FR-014-063 (correct arg),
 * and order-preservation (gate fires after FR-209, before FR-204).
 * @see GECMDS.C:4471 MAINT2, :4479 MAINT3
 * @see research.md D10
 */
import { MaintHandlerService } from '../../../../src/game/commands/handlers/maint.handler';
import { ShipStateService } from '../../../../src/game/ship/ship-state.service';
import { PlanetStateService } from '../../../../src/game/planet/planet-state.service';
import { PrismaService } from '../../../../src/prisma/prisma.service';
import { ShipState } from '../../../../src/game/ship/ship-state.types';
import { formatMessage, MessageId } from '../../../../src/game/commands/messages';
import { MAINT_COST_NORMAL } from '../../../../src/game/commands/_ship-management-constants';
import { NUMITEMS } from '../../../../src/game/constants/items';

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
    where: 10,
    ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: Array(NUMITEMS).fill(0n) as bigint[],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 5, warncntr: 0,
    scanNames: false, scanHome: false,
    dirty: false,
    ...overrides,
  };
}

function makePlanetWithPassword(password: string) {
  return {
    items: [{ qty: 50_000n }],
    password,
  };
}

function makeService(opts: {
  planet?: ReturnType<typeof makePlanetWithPassword> | null;
  cash?: bigint;
} = {}) {
  const { planet = makePlanetWithPassword(''), cash = BigInt(MAINT_COST_NORMAL) * 2n } = opts;

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
  return { handler, mockShipState, mockPrisma };
}

type Lines = { lines: { text: string; category: string }[] };

// ---------------------------------------------------------------------------
// T045 — Four password-state combinations
// ---------------------------------------------------------------------------

describe('MaintHandlerService — password gate (T045)', () => {
  it('FR-014-060: no arg + passworded planet → MAINT2 and cash unchanged', async () => {
    const { handler, mockPrisma } = makeService({ planet: makePlanetWithPassword('secret') });
    const ship = makeShip({ where: 10, xcoord: 5.5, ycoord: 5.5, damage: 30 });
    const result = await handler.command.handler(ship, [], {}) as Lines;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.MAINT2));
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('FR-014-061: wrong password arg → MAINT3 and cash unchanged', async () => {
    const { handler, mockPrisma } = makeService({ planet: makePlanetWithPassword('secret') });
    const ship = makeShip({ where: 10, xcoord: 5.5, ycoord: 5.5, damage: 30 });
    const result = await handler.command.handler(ship, ['wrongpass'], {}) as Lines;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.MAINT3));
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('FR-014-063: correct arg (case-insensitive) → maintenance proceeds', async () => {
    const { handler, mockPrisma } = makeService({ planet: makePlanetWithPassword('SECRET') });
    const ship = makeShip({ where: 10, xcoord: 5.5, ycoord: 5.5, damage: 30 });
    // Provide correct password in different case
    const result = await handler.command.handler(ship, ['secret'], {}) as Lines;
    expect(result.lines[0].text).toContain('Maintenance complete');
    expect(mockPrisma.user.update).toHaveBeenCalled();
  });

  it('FR-014-062: password == "none" → gate bypassed regardless of arg', async () => {
    const { handler, mockPrisma } = makeService({ planet: makePlanetWithPassword('none') });
    const ship = makeShip({ where: 10, xcoord: 5.5, ycoord: 5.5, damage: 30 });
    // No arg needed when password is "none"
    const result = await handler.command.handler(ship, [], {}) as Lines;
    expect(result.lines[0].text).toContain('Maintenance complete');
    expect(mockPrisma.user.update).toHaveBeenCalled();
  });

  it('FR-014-062: password == "NONE" (case-insensitive) → gate bypassed', async () => {
    const { handler } = makeService({ planet: makePlanetWithPassword('NONE') });
    const ship = makeShip({ where: 10, xcoord: 5.5, ycoord: 5.5, damage: 30 });
    const result = await handler.command.handler(ship, [], {}) as Lines;
    expect(result.lines[0].text).toContain('Maintenance complete');
  });

  it('FR-014-062: empty password string → gate bypassed', async () => {
    const { handler } = makeService({ planet: makePlanetWithPassword('') });
    const ship = makeShip({ where: 10, xcoord: 5.5, ycoord: 5.5, damage: 30 });
    const result = await handler.command.handler(ship, [], {}) as Lines;
    expect(result.lines[0].text).toContain('Maintenance complete');
  });

  it('SC-007: no cash deduction on FR-014-060 rejection', async () => {
    const { handler, mockPrisma } = makeService({ planet: makePlanetWithPassword('secret') });
    const ship = makeShip({ where: 10, xcoord: 5.5, ycoord: 5.5, damage: 30 });
    await handler.command.handler(ship, [], {});
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('SC-007: no cash deduction on FR-014-061 rejection', async () => {
    const { handler, mockPrisma } = makeService({ planet: makePlanetWithPassword('secret') });
    const ship = makeShip({ where: 10, xcoord: 5.5, ycoord: 5.5, damage: 30 });
    await handler.command.handler(ship, ['wrong'], {});
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// T046 — Order preservation: gate fires AFTER FR-209, BEFORE FR-204
// ---------------------------------------------------------------------------

describe('MaintHandlerService — password gate ordering (T046)', () => {
  it('FR-209 (NZ non-Zygor) fires before password gate', async () => {
    // Sector (0,0) plnum=2 → NZ non-Zygor AND planet has password
    // Neutral zone error should be emitted, NOT MAINT2
    const { handler } = makeService({ planet: makePlanetWithPassword('secret') });
    // where=12 → plnum=2 (not Zygor 0 or 1), xcoord=0.5, ycoord=0.5 → sector (0,0) → NZ
    const ship = makeShip({ where: 12, xcoord: 0.5, ycoord: 0.5, damage: 30 });
    const result = await handler.command.handler(ship, [], {}) as Lines;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.MAINT_NZ));
    expect(result.lines[0].text).not.toBe(formatMessage(MessageId.MAINT2));
  });

  it('password gate fires before FR-204 (no damage)', async () => {
    // Ship has NO damage (FR-204 would fire) AND planet is passworded
    // Password error should be emitted, NOT MAINT_NO_DAMAGE
    const { handler } = makeService({ planet: makePlanetWithPassword('secret') });
    const ship = makeShip({ where: 10, xcoord: 5.5, ycoord: 5.5, damage: 0 });
    const result = await handler.command.handler(ship, [], {}) as Lines;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.MAINT2));
    expect(result.lines[0].text).not.toBe(formatMessage(MessageId.MAINT_NO_DAMAGE));
  });
});
