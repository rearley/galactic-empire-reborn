/**
 * Unit tests for NewShipHandlerService — `new ship <N>` command.
 * Covers all paths: success, rejection conditions, list, usage, shield stub.
 * @see GECMDS.C:cmd_new
 */
import { NewShipHandlerService, quoteUpgrade } from '../../src/game/commands/handlers/new-ship.handler';
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
    // In orbit around ZYGOR. Canon's shipyard gate is
    // `neutral(&coord) && plnum == 1` (GECMDS.C:4557), and `where = 10 + plnum`
    // — so orbiting Zygor is 11. This fixture said 10, i.e. plnum 0, which is
    // not a planet at all; it passed only because the port checked "orbiting
    // anything in sector (0,0)".
    where: 11,
    ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: [0n, 0n, 0n, 0n, 3n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 10, warncntr: 0,
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
  const self: { value: unknown } = { value: undefined };
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
      })),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ userid: 'u-test', cash, noships, topshipno }),
      update: jest.fn().mockResolvedValue({ userid: 'u-test', cash: cash - 600_000n, noships: noships + 1, topshipno: topshipno + 1 }),
      // The purchase debit is conditional now: the balance and the MAXSHIPS cap
      // are re-checked in the same statement that spends and increments them,
      // and `count` is how the caller learns whether it won the race.
      // @see docs/audits/2026-09-09-security-review.md M1
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    // Interactive form: the transaction body needs to branch on that count, so
    // it is a callback rather than an array of operations. `self` is the same
    // mock, handed in as the transaction client.
    $transaction: jest.fn().mockImplementation(
      async (arg: unknown) =>
        typeof arg === 'function'
          ? (arg as (tx: unknown) => Promise<unknown>)(self.value)
          : Promise.all(arg as Promise<unknown>[]),
    ),
    ...prismaOverrides,
  };

  self.value = prismaMock;

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
      // Conditional: the balance and the fleet cap are in the WHERE clause, so
      // the check and the spend are one statement and cannot be raced.
      // @see docs/audits/2026-09-09-security-review.md M1
      expect(prismaMock.user.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userid: 'u-test',
            cash: { gte: 600_000n },
          }),
          data: expect.objectContaining({ cash: { decrement: 600_000n } }),
        }),
      );
      // Canon's NEW3 confirms the purchase; the docking hint is PORT-ORIGINAL
      // and lives on its own line beside it. @see docs/DECISIONS.md 2026-09-08
      expect(result.lines[0].text).toBe('You are now the proud owner of a Destroyer.');
      expect(result.lines[1].text).toMatch(/docked at Zygor/i);
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
      expect(result.lines[0].text).toMatch(/You already have \d+ ships, the maximum permitted!/i);
      expect(prismaMock.ship.create).not.toHaveBeenCalled();
      expect(prismaMock.user.update).not.toHaveBeenCalled();
      expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
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
      expect(prismaMock.user.updateMany).toHaveBeenCalledWith(
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
      // Canon's NEW4 names the class and does not quote the shortfall.
      expect(result.lines[0].text).toBe("Sorry Sir, we don't have enough cash for a Destroyer.");
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
    let inner: unknown;
    const $transaction = jest.fn().mockImplementation(async (arg: unknown) => {
      calls += 1;
      if (calls === 1) throw p2002;
      return typeof arg === 'function'
        ? (arg as (tx: unknown) => Promise<unknown>)(inner)
        : Promise.all(arg as Promise<unknown>[]);
    });
    const { service, prismaMock } = makeService({ $transaction });
    inner = prismaMock;

    const result = await service.command.handler(makeShip(), ['ship', '4'], {});

    expect(calls).toBe(2);
    expect(result.lines[0].text).toMatch(/proud owner/i);
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

  /**
   * A hull bought at Zygor came out with `phasrtype` and `shieldtype` 0 — no
   * phasers and no shields at all. `rep wpns` reporting "type 0" and the
   * upgrade screens pricing from 0 with no trade-in made this look like a
   * deliberate bare-hull design, but C's `new ship` path calls the same
   * `initshp` as a new pilot's first ship (GECMDS.C:4572), and initshp sets
   * `shieldtype = 1; phasrtype = 1` (GEFUNCS.C:233-234).
   *
   * Found by buying a Heavy Freighter, raising shields in a fight, and being
   * told "You have no shields installed."
   */
  it('fits the basic phasers and shields every hull leaves the yard with', async () => {
    const { service, prismaMock } = makeService();

    await service.command.handler(makeShip(), ['ship', '4'], {});

    const created = (prismaMock.ship.create as jest.Mock).mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(created.data['phasrtype']).toBe(1);
    expect(created.data['shieldtype']).toBe(1);
    // Shields fitted but DOWN, as initshp leaves them (SHIELDDN).
    expect(created.data['shield']).toBe(0);
    expect(created.data['phasr']).toBe(100);
  });

  /**
   * "New Heavy Freighter purchased and docked at Zygor" — and then the hull
   * materialised at the sector's (0,0) corner, up to 7,071 units from the
   * station the buyer was orbiting. The position was floored to the sector
   * index, throwing away the intra-sector coordinates entirely.
   *
   * That was survivable when `orb` worked from anywhere in the sector. Now
   * that orbit requires closing to within 250 units, it is a seven-minute
   * impulse crawl back to the station you were already docked at.
   */
  it('leaves the new hull where the buyer is, not at the sector corner', async () => {
    const { service, prismaMock } = makeService();
    const buyer = makeShip();
    buyer.xcoord = 0.4812;
    buyer.ycoord = 0.5533;

    await service.command.handler(buyer, ['ship', '4'], {});

    const created = (prismaMock.ship.create as jest.Mock).mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(created.data['xcoord']).toBeCloseTo(0.4812, 6);
    expect(created.data['ycoord']).toBeCloseTo(0.5533, 6);
  });
});

/**
 * `new phaser` / `new shield` narration.
 *
 * The port printed an invented stat line ("Phaser upgraded to type 3. Cost:
 * 36,666 cr. Credits: 63,334 cr.") and never mentioned the trade-in on the old
 * unit — the very thing that makes an upgrade cost 36,666 instead of the
 * 40,000 list price.
 *
 * Canon prints the trade-in quote FIRST and then the Yardmaster's fitting
 * report:
 *   GECMDS.C:4668 prfmsg(NEW29,l2as(delta));   ← phaser trade-in
 *   GECMDS.C:4701 prfmsg(NEW10,l2as(delta),type);
 *   GECMDS.C:4606 prfmsg(NEW19,l2as(delta));   ← shield trade-in
 *   GECMDS.C:4640 prfmsg(NEW7,l2as(delta),type);
 * plus the two branches the port never wired at all:
 *   GECMDS.C:4676-4686 / :4614-4624 NEW28/NEW18 downgrade refund minus a
 *     credit/50 transaction fee
 *   GECMDS.C:4688-4693 / :4626-4631 NEW17 minimum 1000 C install charge
 */
describe('NewShipHandlerService — shipyard narration for new phaser/shield', () => {
  function makeUpgradeService(cash: bigint) {
    const user = {
      findUnique: jest.fn().mockResolvedValue({ cash }),
      update: jest.fn().mockResolvedValue({}),
    };
    const prismaMock = {
      shipClass: {
        findFirst: jest.fn().mockResolvedValue({ ...PLAYER_CLASS_4, maxPhaser: 10, maxShields: 10 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      user,
      ship: { create: jest.fn() },
      $transaction: jest.fn(),
    };
    const mutate = jest.fn();
    const service = new NewShipHandlerService(
      prismaMock as unknown as PrismaService,
      { mutate, loadShip: jest.fn() } as unknown as ShipStateService,
    );
    return { service, user, mutate };
  }

  const textOf = (r: { lines: { text: string }[] }) => r.lines.map((l) => l.text).join('\n');

  it('quotes the phaser trade-in, then the Yardmaster, in canon order', async () => {
    // phaser 1 -> 3: trade-in 5000-(5000/3)=3334, cost 40000-3334=36666
    const { service, user, mutate } = makeUpgradeService(100_000n);
    const result = await service.command.handler(makeShip({ phasrtype: 1 }), ['phaser', '3'], {});

    const text = textOf(result);
    expect(text).toContain('They will credit us 3,334 for our existing used phaser, Sir!');
    expect(text).toContain('The Yardmaster Reports: For the meager sum of 36,666');
    expect(text).toContain('your ship now has a Mark-3 Phaser System.');
    // Trade-in is quoted before the fitting report, as canon prints it.
    expect(text.indexOf('credit us')).toBeLessThan(text.indexOf('Yardmaster'));
    // No port-invented stat line.
    expect(text).not.toMatch(/upgraded to type/i);

    expect(user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { cash: { decrement: 36_666n } } }),
    );
    expect(mutate).toHaveBeenCalled();
  });

  it('quotes the shield trade-in, then the Yardmaster, in canon order', async () => {
    // shield 1 -> 2: trade-in 3334, cost 10000-3334=6666
    const { service, user } = makeUpgradeService(100_000n);
    const result = await service.command.handler(makeShip({ shieldtype: 1 }), ['shield', '2'], {});

    const text = textOf(result);
    expect(text).toContain('They will credit us 3,334 for our existing used shield, Sir!');
    expect(text).toContain('The Yardmaster Reports: For the meager sum of 6,666');
    expect(text).toContain('your ship now has a Mark-2 Shield defense system.');
    expect(user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { cash: { decrement: 6_666n } } }),
    );
  });

  it('still quotes the trade-in when the captain cannot afford the fitting', async () => {
    // phaser 1 -> 5: 220000-3334 = 216666
    const { service, user, mutate } = makeUpgradeService(1_000n);
    const result = await service.command.handler(makeShip({ phasrtype: 1 }), ['phaser', '5'], {});

    const text = textOf(result);
    expect(text).toContain('They will credit us 3,334 for our existing used phaser, Sir!');
    expect(text).not.toMatch(/Yardmaster/);
    expect(user.update).not.toHaveBeenCalled();
    expect(mutate).not.toHaveBeenCalled();
  });

  it('pays back a downgrade, minus the credit/50 transaction fee (NEW28)', async () => {
    // phaser 3 -> 1: trade-in 40000-13333=26667; delta 5000-26667 = -21667
    // credit 21667, fee 21667/50 = 433, deposited 21234.
    const { service, user, mutate } = makeUpgradeService(0n);
    const result = await service.command.handler(makeShip({ phasrtype: 3 }), ['phaser', '1'], {});

    const text = textOf(result);
    expect(text).toContain('They will credit us 26,667 for our existing used phaser, Sir!');
    expect(text).toContain('There is no charge for the new phaser and after deducting a transaction');
    expect(text).toContain("fee of 433 C's 21,234 has been deposited to your account, Sir.");
    // Canon still fits the unit and reports it, at a cost of zero.
    expect(text).toContain('your ship now has a Mark-1 Phaser System.');
    expect(user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { cash: { increment: 21_234n } } }),
    );
    expect(mutate).toHaveBeenCalled();
  });

  it('pays back a shield downgrade with the shield wording (NEW18)', async () => {
    // shield 3 -> 1: trade-in 40000-13333=26667; credit 21667, fee 433, 21234
    const { service } = makeUpgradeService(0n);
    const result = await service.command.handler(makeShip({ shieldtype: 3 }), ['shield', '1'], {});

    const text = textOf(result);
    expect(text).toContain('There is no charge for the new shield and after deducting a transaction');
    expect(text).toContain("fee of 433 C's 21,234 has been deposited to your account, Sir.");
    expect(text).toContain('your ship now has a Mark-1 Shield defense system.');
  });
});

/**
 * The pure quote arithmetic, including the minimum-install branch that the
 * shipped price tables happen never to reach (no canon price sits within
 * 1..999 credits of another's 2/3 trade-in value), so it can only be exercised
 * directly. @see GECMDS.C:4688-4693
 */
describe('quoteUpgrade — GECMDS.C upgrade arithmetic', () => {
  it('charges the 1000 C minimum when the net cost is under it', () => {
    // trade-in on type 1 = 900 - 300 = 600; new type 2 costs 1000 - 600 = 400.
    const q = quoteUpgrade([900n, 1_000n], 1, 2);
    expect(q.tradeIn).toBe(600n);
    expect(q.minCharge).toBe(true);
    expect(q.cost).toBe(1_000n);
    expect(q.credit).toBe(0n);
  });

  it('does not invent a minimum charge when the trade-in covers the unit exactly', () => {
    // trade-in 600, new unit 600 → delta 0: not > 0, so no minimum applies.
    const q = quoteUpgrade([900n, 600n], 1, 2);
    expect(q.cost).toBe(0n);
    expect(q.credit).toBe(0n);
    expect(q.minCharge).toBe(false);
  });

  it('never pays out a negative refund', () => {
    const q = quoteUpgrade([100n, 1n], 1, 2);
    // trade-in 100-33=67, delta 1-67 = -66, fee 66/50 = 1, credit 65.
    expect(q.fee).toBe(1n);
    expect(q.credit).toBe(65n);
    expect(q.cost).toBe(0n);
  });
});
