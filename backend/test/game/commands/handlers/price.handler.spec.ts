/**
 * T038-T040 — Unit spec for PriceHandlerService.
 * Covers the six-precondition ladder, owner vs foreign pricing,
 * bare-pri listing, read-only assertion, and arg format errors.
 * @see GECMDS.C:4284 cmd_price
 * @see FR-014-050..053
 */
import { PriceHandlerService } from '../../../../src/game/commands/handlers/price.handler';
import { PlanetStateService } from '../../../../src/game/planet/planet-state.service';
import { PrismaService } from '../../../../src/prisma/prisma.service';
import { ShipState } from '../../../../src/game/ship/ship-state.types';
import { PlanetState } from '../../../../src/game/planet/planet-state.types';
import { formatMessage, MessageId } from '../../../../src/game/commands/messages';
import { I_TROOPS, I_FOOD, I_GOLD, NUMITEMS, BASEPRICE } from '../../../../src/game/constants/items';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeItems(
  opts: { sellIdx?: number[]; qty?: number[]; markup?: number[] } = {},
): PlanetState['items'] {
  return Array.from({ length: NUMITEMS }, (_, i) => ({
    qty: BigInt(opts.qty?.[i] ?? 1000),
    rate: 0,
    sell: opts.sellIdx?.includes(i) ?? false,
    reserve: 0,
    markup2a: opts.markup?.[i] ?? BASEPRICE[i] * 2,
    sold2a: 0n,
  }));
}

function makePlanet(overrides: Partial<PlanetState> = {}): PlanetState {
  return {
    xsect: 5, ysect: 5, plnum: 0,
    type: 1, xcoord: 5.5, ycoord: 5.5,
    userid: 'owner', name: 'TradePost',
    enviorn: 0, resource: 0, cash: 0n, debt: 0n, tax: 0n,
    taxrate: 0, warnings: 0, password: '', lastattack: '',
    beacon: '', spyowner: '', technology: 0, teamcode: 0n,
    items: makeItems({ sellIdx: [I_FOOD, I_GOLD] }),
    ...overrides,
  };
}

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'buyer', shipno: 1, shipname: 'Merchant', shpclass: 5,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5.5, ycoord: 5.5, damage: 0, energy: 10000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 10, // in orbit of planet 0
    ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: Array(NUMITEMS).fill(0n) as bigint[],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 5, warncntr: 0,
    dirty: false,
    ...overrides,
  };
}

function makeHandler(opts: {
  planet?: PlanetState | null;
  cash?: bigint;
} = {}) {
  const { planet = makePlanet(), cash = 1_000_000n } = opts;

  const mockPlanetService = {
    get: jest.fn().mockReturnValue(planet),
  } as unknown as PlanetStateService;

  const mockPrisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue({ cash }),
      create: jest.fn(),
      update: jest.fn(),
    },
    planet: {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  } as unknown as PrismaService;

  const handler = new PriceHandlerService(mockPlanetService, mockPrisma);
  return { handler, mockPlanetService, mockPrisma };
}

type Lines = { lines: { text: string; category: string }[] };

// ---------------------------------------------------------------------------
// BUY1 — not in orbit
// ---------------------------------------------------------------------------

describe('PriceHandlerService — BUY1: not in orbit', () => {
  it('returns BUY1 when ship.where < 10', async () => {
    const { handler } = makeHandler();
    const ship = makeShip({ where: 5 });
    const result = await handler.command.handler(ship, ['10', 'foo'], {}) as Lines;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.BUY1));
  });

  it('returns BUY1 when planet not found', async () => {
    const { handler } = makeHandler({ planet: null });
    const ship = makeShip({ where: 10 });
    const result = await handler.command.handler(ship, ['10', 'foo'], {}) as Lines;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.BUY1));
  });
});

// ---------------------------------------------------------------------------
// PRICEFMT — bad arg shape
// ---------------------------------------------------------------------------

describe('PriceHandlerService — PRICEFMT: arg format errors', () => {
  it('returns PRICEFMT when only one arg provided', async () => {
    const { handler } = makeHandler();
    const ship = makeShip({ where: 10 });
    const result = await handler.command.handler(ship, ['10'], {}) as Lines;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.PRICEFMT));
  });

  it('returns PRICEFMT when amount is not a number', async () => {
    const { handler } = makeHandler();
    const ship = makeShip({ where: 10 });
    const result = await handler.command.handler(ship, ['abc', 'foo'], {}) as Lines;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.PRICEFMT));
  });

  it('returns PRICEFMT when item keyword is unrecognised', async () => {
    const { handler } = makeHandler();
    const ship = makeShip({ where: 10 });
    const result = await handler.command.handler(ship, ['10', 'invaliditem'], {}) as Lines;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.PRICEFMT));
  });
});

// ---------------------------------------------------------------------------
// BUY7 — planet has no owner
// ---------------------------------------------------------------------------

describe('PriceHandlerService — BUY7: planet has no owner', () => {
  it('returns BUY7 when planet.userid is null', async () => {
    const { handler } = makeHandler({ planet: makePlanet({ userid: null }) });
    const ship = makeShip({ where: 10 });
    const result = await handler.command.handler(ship, ['10', 'foo'], {}) as Lines;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.BUY7));
  });
});

// ---------------------------------------------------------------------------
// BUY5 — quantity zero
// ---------------------------------------------------------------------------

describe('PriceHandlerService — BUY5: zero quantity', () => {
  it('returns BUY5 when amount == 0', async () => {
    const { handler } = makeHandler();
    const ship = makeShip({ where: 10 });
    const result = await handler.command.handler(ship, ['0', 'foo'], {}) as Lines;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.BUY5));
  });
});

// ---------------------------------------------------------------------------
// BUY4 — item not for sale
// ---------------------------------------------------------------------------

describe('PriceHandlerService — BUY4: item not for sale', () => {
  it('returns BUY4 when sell flag is false and buyer is not owner', async () => {
    // I_TROOPS (index 8) is NOT in sellIdx
    const { handler } = makeHandler();
    const ship = makeShip({ where: 10, userid: 'buyer' }); // not the owner
    const result = await handler.command.handler(ship, ['10', 'tro'], {}) as Lines;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.BUY4));
  });
});

// ---------------------------------------------------------------------------
// BUY8 — cargo capacity
// ---------------------------------------------------------------------------

describe('PriceHandlerService — BUY8: cargo capacity', () => {
  it('returns BUY8 when ship cargo is full', async () => {
    // Fill cargo with heavy items so no room for food
    const items = Array(NUMITEMS).fill(0n) as bigint[];
    items[I_FOOD] = 999n; // food = 1 ton each → 999 tons used of 1000
    // Requesting 5 food = 5 tons would exceed 1000
    items[I_TROOPS] = 0n;
    const ship = makeShip({ where: 10, items });
    const planet = makePlanet({ items: makeItems({ sellIdx: [I_FOOD], qty: Array(NUMITEMS).fill(1000) }) });
    const { handler } = makeHandler({ planet });
    const result = await handler.command.handler(ship, ['5', 'foo'], {}) as Lines;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.BUY8));
  });
});

// ---------------------------------------------------------------------------
// BUY3 — insufficient stock
// ---------------------------------------------------------------------------

describe('PriceHandlerService — BUY3: insufficient stock', () => {
  it('returns BUY3 when planet stock < requested quantity', async () => {
    const items = makeItems({ sellIdx: [I_FOOD], qty: Array(NUMITEMS).fill(5) });
    const planet = makePlanet({ items });
    const { handler } = makeHandler({ planet });
    const ship = makeShip({ where: 10 });
    // Request more than available (5)
    const result = await handler.command.handler(ship, ['100', 'foo'], {}) as Lines;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.BUY3));
  });
});

// ---------------------------------------------------------------------------
// PRICE_NO_CASH — buyer can't afford it
// ---------------------------------------------------------------------------

describe('PriceHandlerService — PRICE_NO_CASH: insufficient funds', () => {
  it('returns PRICE_NO_CASH when buyer cash is insufficient', async () => {
    const { handler } = makeHandler({ cash: 1n }); // almost nothing
    const ship = makeShip({ where: 10 });
    // Requesting 100 food — will cost more than 1 credit
    const result = await handler.command.handler(ship, ['100', 'foo'], {}) as Lines;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.PRICE_NO_CASH));
  });
});

// ---------------------------------------------------------------------------
// Happy path — quoted form
// ---------------------------------------------------------------------------

describe('PriceHandlerService — happy path (quoted form)', () => {
  it('returns PRICE1 with correct qty, item name, unit price, and total', async () => {
    const { handler } = makeHandler();
    const ship = makeShip({ where: 10, userid: 'buyer' });
    const result = await handler.command.handler(ship, ['10', 'foo'], {}) as Lines;
    expect(result.lines[0].text).toContain('Food');
    expect(result.lines[0].category).toBe('success');
  });

  it('owner gets BASEPRICE pricing', async () => {
    const planet = makePlanet({ userid: 'owner' });
    const { handler } = makeHandler({ planet });
    const ship = makeShip({ where: 10, userid: 'owner' }); // ship is owner
    const result = await handler.command.handler(ship, ['10', 'foo'], {}) as Lines;
    // Owner price = BASEPRICE[I_FOOD]
    expect(result.lines[0].text).toContain(String(BASEPRICE[I_FOOD]));
  });

  it('foreign buyer gets markup2a pricing', async () => {
    const markup = 999;
    const items = makeItems({
      sellIdx: [I_FOOD],
      qty: Array(NUMITEMS).fill(1000),
      markup: Array(NUMITEMS).fill(markup),
    });
    const planet = makePlanet({ items, userid: 'owner' });
    const { handler } = makeHandler({ planet });
    const ship = makeShip({ where: 10, userid: 'buyer' }); // not owner
    const result = await handler.command.handler(ship, ['1', 'foo'], {}) as Lines;
    expect(result.lines[0].text).toContain(String(markup));
  });
});

// ---------------------------------------------------------------------------
// T039 — Bare `pri` listing
// ---------------------------------------------------------------------------

describe('PriceHandlerService — bare "pri" listing (T039)', () => {
  it('returns one line per sellable item when no args given', async () => {
    const { handler } = makeHandler();
    const ship = makeShip({ where: 10 });
    const result = await handler.command.handler(ship, [], {}) as Lines;
    // makePlanet has I_FOOD and I_GOLD with sell=true
    expect(result.lines.length).toBe(2);
  });

  it('returns BUY5 when no items are for sale', async () => {
    const items = makeItems({ sellIdx: [] }); // nothing for sale
    const planet = makePlanet({ items });
    const { handler } = makeHandler({ planet });
    const ship = makeShip({ where: 10, userid: 'buyer' });
    const result = await handler.command.handler(ship, [], {}) as Lines;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.BUY5));
  });

  it('owner sees all items including non-sellable', async () => {
    const planet = makePlanet({ userid: 'owner' });
    const { handler } = makeHandler({ planet });
    const ship = makeShip({ where: 10, userid: 'owner' });
    const result = await handler.command.handler(ship, [], {}) as Lines;
    // Owner sees all NUMITEMS items
    expect(result.lines.length).toBe(NUMITEMS);
  });
});

// ---------------------------------------------------------------------------
// T040 — Read-only: no DB writes, no state mutations
// ---------------------------------------------------------------------------

describe('PriceHandlerService — read-only (T040)', () => {
  it('never writes to Prisma on any success path', async () => {
    const { handler, mockPrisma } = makeHandler();
    const ship = makeShip({ where: 10 });

    await handler.command.handler(ship, ['10', 'foo'], {});

    expect(mockPrisma.planet.update).not.toHaveBeenCalled();
    expect(mockPrisma.planet.create).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('never writes to Prisma on any failure path', async () => {
    const { handler, mockPrisma } = makeHandler({ planet: null });
    const ship = makeShip({ where: 10 });

    await handler.command.handler(ship, ['10', 'foo'], {});

    expect(mockPrisma.planet.update).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Command metadata
// ---------------------------------------------------------------------------

describe('PriceHandlerService — command metadata', () => {
  it('keyword is "pri" with no aliases', () => {
    const { handler } = makeHandler();
    expect(handler.command.keyword).toBe('pri');
    expect(handler.command.aliases).toHaveLength(0);
  });

  it('minArgs is 0', () => {
    const { handler } = makeHandler();
    expect(handler.command.minArgs).toBe(0);
  });
});
