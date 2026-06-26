/**
 * Unit tests for NewShipHandlerService — `new ship <N>` command.
 * Covers all paths: success, 5 rejection conditions, list, usage, shield stub.
 * @see GECMDS.C:cmd_new
 */
import { NewShipHandlerService } from '../../src/game/commands/handlers/new-ship.handler';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { ShipState } from '../../src/game/ship/ship-state.types';

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

function makeService(prismaOverrides: Record<string, unknown> = {}, existingShipCount = 1) {
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
      count: jest.fn().mockResolvedValue(existingShipCount),
      create: jest.fn().mockImplementation(async (args: { data: Record<string, unknown> }) => ({
        userid: 'u-test',
        shipno: existingShipCount + 1,
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
        firecntl: 0, destruct: 0, status: 0, cybmine: 0,
        cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
        minesnear: 0, lock: 0, holdcourse: 0, topspeed: 0, warncntr: 0,
        navTargetX: null, navTargetY: null,
      })),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ userid: 'u-test', cash: 1_000_000n }),
      update: jest.fn().mockResolvedValue({ userid: 'u-test', cash: 400_000n }),
    },
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
    it('creates Ship row and decrements User.cash', async () => {
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
      expect(result.lines[0].text).toMatch(/boa/i);
    });

    it('auto-names ship as "<TypeName> #N"', async () => {
      const { service, prismaMock } = makeService({}, 2);
      await service.command.handler(makeShip(), ['ship', '4'], {});
      const createCall = (prismaMock.ship.create as jest.Mock).mock.calls[0][0] as { data: Record<string, unknown> };
      expect(String(createCall.data['shipname'])).toMatch(/Destroyer #3/);
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
        ship: { count: jest.fn().mockResolvedValue(1), create: jest.fn() },
        user: { findUnique: jest.fn().mockResolvedValue({ userid: 'u-test', cash: 100n }) },
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
