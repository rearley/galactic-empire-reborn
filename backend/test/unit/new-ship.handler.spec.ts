/**
 * Unit tests for NewShipHandlerService — `new ship <N>` command.
 * Covers all paths: success, rejection conditions, list, usage, shield stub.
 * @see GECMDS.C:cmd_new
 */
import { NewShipHandlerService } from '../../src/game/commands/handlers/new-ship.handler';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { ShipState } from '../../src/game/ship/ship-state.types';
import { MAXSHIPS, GESTAT_AVAIL } from '../../src/game/constants';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u-test', shipno: 1, shipname: 'USS Test', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 0.5, ycoord: 0.5, // neutral zone (0,0) by floor
    damage: 0, energy: 65000,
    phasr: 100, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 10, // orbiting
    ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: [0n, 0n, 0n, 0n, 3n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 10, warncntr: 0,
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...overrides,
  };
}

const PLAYER_CLASS_4 = {
  id: 'cls-4',
  classNumber: 4,
  typeName: 'Destroyer',
  category: 'PLAYER',
  maxPrice: 600_000n,
  shipNameTemplate: 'Destroyer #{n}',
  maxShields: 3000,
  maxPhaser: 3000,
  maxWarp: 7,
  hasTorpedo: true,
  hasMissile: true,
  scanRange: 8000,
  maxAcceleration: 3000,
  hasCloak: false,
  description: null,
};

const DROID_CLASS = {
  ...PLAYER_CLASS_4,
  classNumber: 31,
  typeName: 'Lydorian Scow',
  category: 'DROID',
};

/**
 * Build a test harness.
 * @param prismaOverrides - Partial prisma mock overrides
 * @param noships - User's current fleet size (default 1)
 * @param topshipno - User's highest allocated ship number (default 1)
 * @param cash - User's cash balance (default 1_000_000n)
 */
function makeService(
  prismaOverrides: Record<string, unknown> = {},
  noships = 1,
  topshipno = 1,
  cash = 1_000_000n,
) {
  const prismaMock = {
    shipClass: {
      findMany: jest.fn().mockResolvedValue([PLAYER_CLASS_4]),
      findFirst: jest.fn().mockImplementation(
        async (args: { where: { classNumber: number } }) => {
          if (args.where.classNumber === 4) return PLAYER_CLASS_4;
          if (args.where.classNumber === 31) return DROID_CLASS;
          return null;
        },
      ),
    },
    ship: {
      create: jest.fn().mockImplementation(async (args: { data: Record<string, unknown> }) => ({
        userid: 'u-test',
        shipno: args.data['shipno'] as number,
        shipname: args.data['shipname'],
        shpclass: args.data['shpclass'],
        xcoord: 0,
        ycoord: 0,
        energy: 65000,
        phasr: 100,
        shield: 0,
        heading: 0, head2b: 0, speed: 0, speed2b: 0,
        damage: 0, kills: 0, lastfired: 0,
        shieldtype: 0, shieldstat: 0, cloak: 0, degrees: 0, percent: 0,
        tactical: 0, helm: 0, train: 0, where: 0,
        ltorpsChannel: [], ltorpsDistance: [],
        lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
        decout: [], jammer: 0, freq: [0, 0, 0],
        items: args.data['items'],
        titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
        firecntl: 0, destruct: 0,
        status: args.data['status'] as number ?? 1,
        cybmine: 0,
        cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
        minesnear: 0, lock: 0, holdcourse: 0, topspeed: 0, warncntr: 0,
        navTargetX: null, navTargetY: null,
      })),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ userid: 'u-test', cash, noships, topshipno }),
      update: jest.fn().mockResolvedValue({ userid: 'u-test', cash: cash - 600_000n, noships: noships + 1, topshipno: topshipno + 1 }),
    },
    $transaction: jest.fn().mockImplementation(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    ...prismaOverrides,
  };

  const shipStateMock: Pick<ShipStateService, 'loadShip'> = {
    loadShip: jest.fn(),
  };

  const service = new NewShipHandlerService(
    prismaMock as unknown as PrismaService,
    shipStateMock as unknown as ShipStateService,
  );

  return { service, prismaMock, shipStateMock };
}

describe('NewShipHandlerService', () => {
  describe('new (no args) → usage help', () => {
    it('returns usage message', async () => {
      const { service } = makeService();
      const result = await service.command.handler(makeShip(), [], {});
      expect(result.lines[0].text).toMatch(/usage/i);
    });
  });

  describe('new ship (no class) → list PLAYER classes with prices', () => {
    it('returns list with Destroyer entry', async () => {
      const { service } = makeService();
      const result = await service.command.handler(makeShip(), ['ship'], {});
      const text = result.lines.map((l: { text: string }) => l.text).join('\n');
      expect(text).toMatch(/Destroyer/);
      expect(text).toMatch(/600/); // price contains 600
    });
  });

  describe('new ship <N> — success purchase', () => {
    it('creates Ship row via transaction and decrements User.cash', async () => {
      const { service, prismaMock } = makeService();
      const result = await service.command.handler(makeShip(), ['ship', '4'], {});
      expect(prismaMock.ship.create).toHaveBeenCalledTimes(1);
      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userid: 'u-test' },
          data: expect.objectContaining({ cash: { decrement: 600_000n } }),
        }),
      );
      expect(result.lines[0].text).toMatch(/Destroyer/);
      expect(result.lines[0].text).toMatch(/docked at Zygor/i);
    });

    it('auto-names ship as "<TypeName> #N" using topshipno+1', async () => {
      // topshipno=2 → newShipno=3 → name "Destroyer #3"
      const { service, prismaMock } = makeService({}, 1, 2);
      await service.command.handler(makeShip(), ['ship', '4'], {});
      const createCall = (prismaMock.ship.create as jest.Mock).mock.calls[0][0] as { data: Record<string, unknown> };
      expect(String(createCall.data['shipname'])).toMatch(/Destroyer #3/);
    });
  });

  describe('new ship <N> — fleet cap enforcement', () => {
    it('rejects purchase when fleet is at MAXSHIPS — no ship created, no cash deducted', async () => {
      const { service, prismaMock } = makeService({}, MAXSHIPS, MAXSHIPS);
      const result = await service.command.handler(makeShip(), ['ship', '4'], {});
      expect(result.lines[0].text).toMatch(/fleet is full|cannot own more ships/i);
      expect(prismaMock.ship.create).not.toHaveBeenCalled();
      expect(prismaMock.user.update).not.toHaveBeenCalled();
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('new ship <N> — monotonic shipno allocation', () => {
    it('allocates shipno = topshipno + 1 and wires noships/topshipno counters', async () => {
      // user has 1 ship, topshipno=3 → new ship gets shipno 4; user updated topshipno→4, noships→2
      const { service, prismaMock } = makeService({}, 1, 3);
      await service.command.handler(makeShip(), ['ship', '4'], {});
      const createCall = (prismaMock.ship.create as jest.Mock).mock.calls[0][0] as { data: Record<string, unknown> };
      expect(createCall.data['shipno']).toBe(4);
      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            noships: { increment: 1 },
            topshipno: 4,
          }),
        }),
      );
    });
  });

  describe('new ship <N> — dormant status', () => {
    it('creates the new ship with status GESTAT_AVAIL (0) — dormant, not in memory map', async () => {
      const { service, prismaMock, shipStateMock } = makeService();
      await service.command.handler(makeShip(), ['ship', '4'], {});
      const createCall = (prismaMock.ship.create as jest.Mock).mock.calls[0][0] as { data: Record<string, unknown> };
      expect(createCall.data['status']).toBe(GESTAT_AVAIL);
      // Dormant ship is NOT loaded into in-memory ShipStateService
      expect((shipStateMock.loadShip as jest.Mock)).not.toHaveBeenCalled();
    });
  });

  describe('new ship <N> — rejection: not in neutral zone', () => {
    it('returns sector requirement message', async () => {
      const { service } = makeService();
      const result = await service.command.handler(
        makeShip({ xcoord: 5.5, ycoord: 3.2 }),
        ['ship', '4'],
        {},
      );
      expect(result.lines[0].text).toMatch(/zygor|neutral zone/i);
    });
  });

  describe('new ship <N> — rejection: not orbiting', () => {
    it('returns orbit requirement message', async () => {
      const { service } = makeService();
      const result = await service.command.handler(
        makeShip({ xcoord: 0.5, ycoord: 0.5, where: 0 }), // where < 10 = not orbiting
        ['ship', '4'],
        {},
      );
      expect(result.lines[0].text).toMatch(/orbit/i);
    });
  });

  describe('new ship <N> — rejection: invalid class (non-existent)', () => {
    it('returns invalid class message for unknown class number', async () => {
      const { service } = makeService();
      const result = await service.command.handler(makeShip(), ['ship', '99'], {});
      expect(result.lines[0].text).toMatch(/invalid ship class/i);
    });
  });

  describe('new ship <N> — rejection: AI/CPU class', () => {
    it('returns invalid class message for DROID category', async () => {
      const { service } = makeService();
      // Class 31 is a DROID class, should be rejected
      const result = await service.command.handler(makeShip(), ['ship', '31'], {});
      expect(result.lines[0].text).toMatch(/invalid ship class/i);
    });
  });

  describe('new ship <N> — rejection: insufficient credits', () => {
    it('returns insufficient credits message', async () => {
      const prismaMock = {
        shipClass: {
          findMany: jest.fn().mockResolvedValue([PLAYER_CLASS_4]),
          findFirst: jest.fn().mockResolvedValue(PLAYER_CLASS_4),
        },
        ship: { create: jest.fn() },
        user: { findUnique: jest.fn().mockResolvedValue({ userid: 'u-test', cash: 100n, noships: 1, topshipno: 1 }) },
        $transaction: jest.fn(),
      };
      const service = new NewShipHandlerService(
        prismaMock as unknown as PrismaService,
        { loadShip: jest.fn() } as unknown as ShipStateService,
      );
      const result = await service.command.handler(makeShip(), ['ship', '4'], {});
      expect(result.lines[0].text).toMatch(/insufficient/i);
    });
  });

  describe('new shield <type> — live upgrade handler', () => {
    it('rejects a non-numeric shield type with an invalid-type message', async () => {
      const { service } = makeService();
      const result = await service.command.handler(makeShip(), ['shield', 'type-a'], {});
      expect(result.lines[0].text).toMatch(/invalid type/i);
    });
  });
});

/**
 * Hull names are generated per-captain (`${typeName} #${shipno}`) while
 * `Ship_shipname_lower_idx` is global, so the second captain to buy a given
 * class collided on the unique index. The uncaught P2002 surfaced as
 * "Internal error processing command." — found in a browser, when a second
 * e2e pilot tried to buy a Stealth Fighter.
 */
describe('NewShipHandlerService — name collisions between captains', () => {
  const p2002 = Object.assign(new Error('unique'), {
    code: 'P2002',
    meta: { target: ['shipname'] },
  });

  it('retries under a different name instead of failing the purchase', async () => {
    let calls = 0;
    const $transaction = jest.fn().mockImplementation(async (ops: Promise<unknown>[]) => {
      calls += 1;
      if (calls === 1) throw p2002;
      return Promise.all(ops);
    });
    const { service } = makeService({ $transaction });

    const result = await service.command.handler(makeShip(), ['ship', '4'], {});

    expect(calls).toBe(2);
    expect(result.lines[0].text).toMatch(/purchased/i);
  });

  it('gives up with a readable message rather than an internal error', async () => {
    const $transaction = jest.fn().mockRejectedValue(p2002);
    const { service } = makeService({ $transaction });

    const result = await service.command.handler(makeShip(), ['ship', '4'], {});

    const text = result.lines[0].text;
    expect(text).not.toMatch(/internal/i);
    expect(text).toMatch(/name/i);
  });

  it('lets an unrelated failure surface instead of swallowing it', async () => {
    const $transaction = jest.fn().mockRejectedValue(new Error('db is on fire'));
    const { service } = makeService({ $transaction });

    await expect(service.command.handler(makeShip(), ['ship', '4'], {})).rejects.toThrow(/on fire/);
  });

  /**
   * A hull bought at Zygor came out with topspeed 0, and `war` refuses at
   * `topspeed === 0` with "Your warp drive is offline" (WARPSPD2). Nothing
   * raises topspeed afterwards — it is only ever ratcheted DOWN by engine
   * damage — so every purchased ship was permanently stuck on impulse.
   *
   * Onboarding had always set it from the class (`topspeed = maxWarp`); this
   * second creation path simply never copied that line, and the column default
   * of 0 is indistinguishable from blown engines.
   *
   * Found in play: bought a Heavy Freighter, boarded it, and it would not warp.
   */
  it('gives a purchased hull the warp drive its class comes with', async () => {
    const { service, prismaMock } = makeService();

    await service.command.handler(makeShip(), ['ship', '4'], {});

    const created = (prismaMock.ship.create as jest.Mock).mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(created.data['topspeed']).toBe(PLAYER_CLASS_4.maxWarp);
    expect(created.data['topspeed']).not.toBe(0);
  });
});
