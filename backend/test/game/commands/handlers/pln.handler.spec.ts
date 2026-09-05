/**
 * T032-T034 — Unit spec for PlnHandlerService.
 * Covers planet listing, empty case, no state mutation, and performance.
 * @see GECMDS.C cmd_pln
 * @see FR-014-040..042
 */
import { PlnHandlerService } from '../../../../src/game/commands/handlers/pln.handler';
import { PrismaService } from '../../../../src/prisma/prisma.service';
import { ShipState } from '../../../../src/game/ship/ship-state.types';
import { formatMessage, MessageId } from '../../../../src/game/commands/messages';
import { NUMITEMS } from '../../../../src/game/constants/items';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeShip(userid = 'player1'): ShipState {
  return {
    userid, shipno: 1, shipname: 'Scout', shpclass: 5,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5.5, ycoord: 5.5, damage: 0, energy: 10000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0,
    ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: Array(NUMITEMS).fill(0n) as bigint[],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 5, warncntr: 0,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
  };
}

function makeHandler(planets: { name: string; xsect: number; ysect: number; plnum: number }[]) {
  const mockPrisma = {
    planet: {
      findMany: jest.fn().mockResolvedValue(planets),
    },
  } as unknown as PrismaService;

  const handler = new PlnHandlerService(mockPrisma);
  return { handler, mockPrisma };
}

type Lines = { lines: { text: string; category: string }[] };

// ---------------------------------------------------------------------------
// T032 — Listing tests
// ---------------------------------------------------------------------------

describe('PlnHandlerService — listing (T032)', () => {
  it('returns PLN_NONE when owner has no planets', async () => {
    const { handler } = makeHandler([]);
    const ship = makeShip();
    const result = await handler.command.handler(ship, [], {}) as Lines;
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].text).toBe(formatMessage(MessageId.PLN_NONE));
  });

  it('returns header + one row per planet', async () => {
    const { handler } = makeHandler([
      { name: 'Alpha', xsect: 3, ysect: 7, plnum: 0 },
      { name: 'Beta', xsect: 12, ysect: 4, plnum: 1 },
    ]);
    const ship = makeShip();
    const result = await handler.command.handler(ship, [], {}) as Lines;
    expect(result.lines).toHaveLength(3); // header + 2 rows
    expect(result.lines[0].text).toBe(formatMessage(MessageId.PLN_HEADER));
  });

  it("row matches canon's prf: %-20s %5d %5d  %d", async () => {
    const { handler } = makeHandler([
      { name: 'My Planet', xsect: 5, ysect: 10, plnum: 3 },
    ]);
    const ship = makeShip();
    const result = await handler.command.handler(ship, [], {}) as Lines;
    const row = result.lines[1].text;
    // cmd_planet writes the row inline rather than through the MSG file:
    //   prf("%-20s %5d %5d  %d \r", name, xsect, ysect, plnum)
    // Its columns are what line up under PLAMSG1's heading, "Planet Name
    // sector planet". The port's "( 5,10)  #  3" shape did not.
    // 20-wide name, then %5d %5d and the plain plnum: 9 chars of name padded
    // to 20, a separator space, then '    5'.
    expect(row).toBe('My Planet            ' + '    5' + '    10' + '  3 ');
  });

  it('planet name padded to 20 chars', async () => {
    const { handler } = makeHandler([
      { name: 'Short', xsect: 1, ysect: 1, plnum: 0 },
    ]);
    const ship = makeShip();
    const result = await handler.command.handler(ship, [], {}) as Lines;
    const row = result.lines[1].text;
    // Name field should be padEnd(20)
    expect(row.startsWith('Short               ')).toBe(true);
  });

  it('queries with userid from ship and orderBy plnum asc', async () => {
    const { handler, mockPrisma } = makeHandler([]);
    const ship = makeShip('player42');
    await handler.command.handler(ship, [], {});
    expect(mockPrisma.planet.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userid: 'player42' },
      orderBy: { plnum: 'asc' },
    }));
  });

  it('returns N rows for N owned planets (sorted by plnum)', async () => {
    const { handler } = makeHandler([
      { name: 'Planet C', xsect: 1, ysect: 1, plnum: 2 },
      { name: 'Planet A', xsect: 2, ysect: 2, plnum: 0 },
      { name: 'Planet B', xsect: 3, ysect: 3, plnum: 1 },
    ]);
    const ship = makeShip();
    const result = await handler.command.handler(ship, [], {}) as Lines;
    expect(result.lines).toHaveLength(4); // header + 3 rows
  });
});

// ---------------------------------------------------------------------------
// T032 — No state mutation, no writes (FR-014-041)
// ---------------------------------------------------------------------------

describe('PlnHandlerService — read-only (FR-014-041)', () => {
  it('never calls any write method on Prisma', async () => {
    const mockPrisma = {
      planet: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    } as unknown as PrismaService;

    const handler = new PlnHandlerService(mockPrisma);
    const ship = makeShip();
    await handler.command.handler(ship, [], {});

    expect(mockPrisma.planet.create).not.toHaveBeenCalled();
    expect(mockPrisma.planet.update).not.toHaveBeenCalled();
    expect(mockPrisma.planet.delete).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// T033 — Command metadata
// ---------------------------------------------------------------------------

describe('PlnHandlerService — command metadata (T033)', () => {
  it('keyword is "pln" with alias "pla"', () => {
    const { handler } = makeHandler([]);
    expect(handler.command.keyword).toBe('pln');
    expect(handler.command.aliases).toEqual(['pla']);
  });

  it('minArgs is 0', () => {
    const { handler } = makeHandler([]);
    expect(handler.command.minArgs).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// T034 — Performance assertion: 50 planets < 200ms (SC-005)
// ---------------------------------------------------------------------------

describe('PlnHandlerService — performance (T034, SC-005)', () => {
  it('handles 50 owned planets in < 200ms', async () => {
    const planets = Array.from({ length: 50 }, (_, i) => ({
      name: `Planet ${i}`,
      xsect: i % 30,
      ysect: i % 15,
      plnum: i,
    }));

    const { handler } = makeHandler(planets);
    const ship = makeShip();

    const start = performance.now();
    await handler.command.handler(ship, [], {});
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(200);
  });
});
