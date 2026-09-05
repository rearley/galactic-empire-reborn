/**
 * T014 — Unit tests for MaintenanceService.
 * Covers all 7 gate conditions in canonical order (FR-206 through FR-205),
 * password gate positioning, and applyMaintenance mutations.
 *
 * @see backend/src/game/ship/maintenance.service.ts MaintenanceService
 * @see GECMDS.C:4452 cmd_maint
 * @see specs/019-physics-polish/spec.md FR-206..FR-210,FR-204,FR-205
 */
import { MaintenanceService } from '../../../src/game/ship/maintenance.service';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { PlanetStateService } from '../../../src/game/planet/planet-state.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { MAINT_COST_NORMAL, MAINT_COST_NEUTRAL } from '../../../src/game/commands/_ship-management-constants';

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
    items: Array(14).fill(0n) as bigint[],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 5, warncntr: 0,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...overrides,
  };
}

function makeService(opts: {
  planet?: { items: { qty: bigint }[]; password?: string | null } | null;
  cash?: bigint;
} = {}) {
  const { planet = { items: [{ qty: 50_000n }], password: null }, cash = BigInt(MAINT_COST_NORMAL) * 5n } = opts;

  const mutated: Record<string, unknown> = {};
  const mockShipState = {
    mutate: jest.fn().mockImplementation(
      (_uid: string, _no: number, fn: (s: ShipState) => void) => {
        const s = makeShip();
        fn(s);
        Object.assign(mutated, s);
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

  const svc = new MaintenanceService(mockShipState, mockPlanetService, mockPrisma);
  return { svc, mockShipState, mockPlanetService, mockPrisma, mutated };
}

// ---------------------------------------------------------------------------
// FR-206: must be in orbit (where >= 10)
// ---------------------------------------------------------------------------

describe('MaintenanceService — FR-206 orbit gate', () => {
  it('returns not-in-orbit when where < 10', async () => {
    const { svc } = makeService();
    const result = await svc.evaluateGates(makeShip({ where: 0 }));
    expect(result).toEqual({ ok: false, reason: 'not-in-orbit' });
  });

  it('returns not-in-orbit when where === 9', async () => {
    const { svc } = makeService();
    const result = await svc.evaluateGates(makeShip({ where: 9 }));
    expect(result).toEqual({ ok: false, reason: 'not-in-orbit' });
  });

  it('passes orbit gate when where === 10', async () => {
    const { svc } = makeService();
    const result = await svc.evaluateGates(makeShip({ where: 10 }));
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// FR-207: planet inhabited, population >= 25000
// ---------------------------------------------------------------------------

describe('MaintenanceService — FR-207 facility gate', () => {
  it('returns no-facility when planet does not exist', async () => {
    const { svc } = makeService({ planet: null });
    const result = await svc.evaluateGates(makeShip({ where: 10 }));
    expect(result).toEqual({ ok: false, reason: 'no-facility' });
  });

  it('returns no-facility when planet population < 25000', async () => {
    const { svc } = makeService({ planet: { items: [{ qty: 24_999n }] } });
    const result = await svc.evaluateGates(makeShip({ where: 10 }));
    expect(result).toEqual({ ok: false, reason: 'no-facility' });
  });

  it('passes facility gate when population === 25000', async () => {
    const { svc } = makeService({ planet: { items: [{ qty: 25_000n }] } });
    const result = await svc.evaluateGates(makeShip({ where: 10 }));
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// FR-208: not combat-locked (cantexit === 0)
// ---------------------------------------------------------------------------

describe('MaintenanceService — FR-208 combat-lock gate', () => {
  it('returns combat-locked when cantexit > 0', async () => {
    const { svc } = makeService();
    const result = await svc.evaluateGates(makeShip({ cantexit: 3 }));
    expect(result).toEqual({ ok: false, reason: 'combat-locked' });
  });

  it('passes when cantexit === 0', async () => {
    const { svc } = makeService();
    const result = await svc.evaluateGates(makeShip({ cantexit: 0 }));
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// FR-209: neutral zone only at Zygor (plnum 0 or 1)
// ---------------------------------------------------------------------------

describe('MaintenanceService — FR-209 neutral zone gate', () => {
  it('returns nz-not-zygor for non-Zygor planet in NZ (plnum=2)', async () => {
    const { svc } = makeService();
    // where=12 → plnum=2, xcoord=0.5, ycoord=0.5 → sector (0,0) → NZ
    const result = await svc.evaluateGates(makeShip({ where: 12, xcoord: 0.5, ycoord: 0.5 }));
    expect(result).toEqual({ ok: false, reason: 'nz-not-zygor' });
  });

  it('passes for Zygor plnum=0 in NZ', async () => {
    // Zygor uses MAINT_COST_NEUTRAL (2500) — provide sufficient cash
    const { svc } = makeService({ cash: BigInt(MAINT_COST_NEUTRAL) * 2n });
    const result = await svc.evaluateGates(makeShip({ where: 10, xcoord: 0.5, ycoord: 0.5 }));
    expect(result.ok).toBe(true);
  });

  it('passes for Zygor plnum=1 in NZ', async () => {
    const { svc } = makeService({ cash: BigInt(MAINT_COST_NEUTRAL) * 2n });
    const result = await svc.evaluateGates(makeShip({ where: 11, xcoord: 0.5, ycoord: 0.5 }));
    expect(result.ok).toBe(true);
  });

  it('non-NZ sector with any plnum is allowed', async () => {
    const { svc } = makeService();
    // xcoord=5.5, ycoord=5.5 → sector (5,5) → not NZ
    const result = await svc.evaluateGates(makeShip({ where: 12, xcoord: 5.5, ycoord: 5.5 }));
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// FR-210: password gate (AFTER NZ, BEFORE damage)
// ---------------------------------------------------------------------------

describe('MaintenanceService — FR-210 password gate', () => {
  it('returns password-required when planet has password and no arg given', async () => {
    const { svc } = makeService({ planet: { items: [{ qty: 50_000n }], password: 'secret' } });
    const result = await svc.evaluateGates(makeShip(), '');
    expect(result).toEqual({ ok: false, reason: 'password-required' });
  });

  it('returns wrong-password when wrong arg given', async () => {
    const { svc } = makeService({ planet: { items: [{ qty: 50_000n }], password: 'secret' } });
    const result = await svc.evaluateGates(makeShip(), 'wrong');
    expect(result).toEqual({ ok: false, reason: 'wrong-password' });
  });

  it('passes on correct password (case-insensitive)', async () => {
    const { svc } = makeService({ planet: { items: [{ qty: 50_000n }], password: 'SECRET' } });
    const result = await svc.evaluateGates(makeShip(), 'secret');
    expect(result.ok).toBe(true);
  });

  it('bypasses password gate when password is "none"', async () => {
    const { svc } = makeService({ planet: { items: [{ qty: 50_000n }], password: 'none' } });
    const result = await svc.evaluateGates(makeShip(), '');
    expect(result.ok).toBe(true);
  });

  it('bypasses password gate when passwordArg is undefined (tick-layer caller)', async () => {
    const { svc } = makeService({ planet: { items: [{ qty: 50_000n }], password: 'secret' } });
    const result = await svc.evaluateGates(makeShip());
    // passwordArg undefined → skip gate entirely, proceed to damage check
    expect(result.ok).toBe(true);
  });

  it('NZ gate fires before password gate (gate ordering)', async () => {
    const { svc } = makeService({ planet: { items: [{ qty: 50_000n }], password: 'secret' } });
    // NZ non-Zygor should fire before password check
    const result = await svc.evaluateGates(makeShip({ where: 12, xcoord: 0.5, ycoord: 0.5 }), '');
    expect(result).toEqual({ ok: false, reason: 'nz-not-zygor' });
  });

  it('password gate fires before no-damage gate (gate ordering)', async () => {
    const { svc } = makeService({ planet: { items: [{ qty: 50_000n }], password: 'secret' } });
    // damage=0, ship in orbit with password — password fires first
    const result = await svc.evaluateGates(makeShip({ damage: 0 }), '');
    expect(result).toEqual({ ok: false, reason: 'password-required' });
  });
});

// ---------------------------------------------------------------------------
// FR-204: must have damage
// ---------------------------------------------------------------------------

describe('MaintenanceService — there is no damage gate', () => {
  it('lets an undamaged ship through, as cmd_maint does', async () => {
    // cmd_maint gates on orbit, password, facility, combat lock and cash, and
    // nothing else. It then computes `repair = damage/3 + 1` unconditionally,
    // so zero damage buys a one-centock job at full price. FR-204 was the
    // port's own kindness, and its refusal text was invented too.
    const { svc } = makeService();
    const result = await svc.evaluateGates(makeShip({ damage: 0 }));
    expect(result.ok).toBe(true);
  });

  it('passes an ordinary damaged ship as well', async () => {
    const { svc } = makeService();
    const result = await svc.evaluateGates(makeShip({ damage: 1 }));
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// FR-205: sufficient cash
// ---------------------------------------------------------------------------

describe('MaintenanceService — FR-205 cash gate', () => {
  it('returns insufficient-cash when cash < MAINT_COST_NORMAL', async () => {
    const { svc } = makeService({ cash: BigInt(MAINT_COST_NORMAL) - 1n });
    const result = await svc.evaluateGates(makeShip({ damage: 10 }));
    expect(result).toEqual({ ok: false, reason: 'insufficient-cash' });
  });

  it('passes cash gate when cash === MAINT_COST_NORMAL', async () => {
    const { svc } = makeService({ cash: BigInt(MAINT_COST_NORMAL) });
    const result = await svc.evaluateGates(makeShip({ damage: 10 }));
    expect(result.ok).toBe(true);
  });

  it('uses MAINT_COST_NEUTRAL at Zygor', async () => {
    const { svc } = makeService({ cash: BigInt(MAINT_COST_NEUTRAL) });
    // Zygor plnum=0, NZ sector
    const result = await svc.evaluateGates(makeShip({ where: 10, xcoord: 0.5, ycoord: 0.5, damage: 10 }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.price).toBe(BigInt(MAINT_COST_NEUTRAL));
    }
  });
});

// ---------------------------------------------------------------------------
// Happy path — repairAmt formula
// ---------------------------------------------------------------------------

describe('MaintenanceService — ok=true result', () => {
  it('repairAmt = floor(damage/3) + 1', async () => {
    const { svc } = makeService();
    const result = await svc.evaluateGates(makeShip({ damage: 30 }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.repairAmt).toBe(Math.floor(30 / 3) + 1); // 11
    }
  });

  it('repairAmt formula for damage=1', async () => {
    const { svc } = makeService();
    const result = await svc.evaluateGates(makeShip({ damage: 1 }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.repairAmt).toBe(1);
    }
  });
});

// ---------------------------------------------------------------------------
// applyMaintenance — debits cash and queues repair
// ---------------------------------------------------------------------------

describe('MaintenanceService — applyMaintenance', () => {
  it('decrements user cash by price', async () => {
    const { svc, mockPrisma } = makeService();
    const ship = makeShip({ damage: 30 });
    await svc.applyMaintenance(ship, BigInt(MAINT_COST_NORMAL), 11);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { userid: 'u1' },
      data: { cash: { decrement: BigInt(MAINT_COST_NORMAL) } },
    });
  });

  it('sets ship.repair to repairAmt via mutate', async () => {
    const { svc, mockShipState } = makeService();
    const ship = makeShip({ damage: 30 });
    await svc.applyMaintenance(ship, BigInt(MAINT_COST_NORMAL), 11);
    expect(mockShipState.mutate).toHaveBeenCalledWith('u1', 1, expect.any(Function));
  });
});

// ---------------------------------------------------------------------------
// runAutoRepair — skips if repair already in progress
// ---------------------------------------------------------------------------

describe('MaintenanceService — runAutoRepair', () => {
  it('does not run if repair > 0 (repair already queued)', async () => {
    const { svc, mockPrisma } = makeService();
    const ship = makeShip({ damage: 30, repair: 5 });
    await svc.runAutoRepair(ship);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('runs maintenance when repair === 0', async () => {
    const { svc, mockPrisma } = makeService();
    const ship = makeShip({ damage: 30, repair: 0 });
    await svc.runAutoRepair(ship);
    expect(mockPrisma.user.update).toHaveBeenCalled();
  });
});
