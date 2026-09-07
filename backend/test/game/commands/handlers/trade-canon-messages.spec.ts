/**
 * The buy/price/sell message family, byte-checked against canon.
 *
 * ORBIT1 and the shield lines in the same session are byte-exact; this family
 * was paraphrased. Canon:
 *
 *   BUY3  {They only have %s %s available for sale, Sir!          MBMGEMSG.MSG:3289
 *   BUY8  {Sorry Sir! That would put us overweight.               MBMGEMSG.MSG:3305
 *   BUY9  {%s %s purchased at the price of %u each for a total of %s, Sir.
 *                                                                 MBMGEMSG.MSG:3309
 *   SELL2 {After the Transfer Tax of %s we have netted %s C's for our %s %s, Sir!
 *                                                                 MBMGEMSG.MSG:4008
 *
 * BUY9 is the purchase confirmation `buy` prints (GECMDS.C:4353-4361); PRICE1
 * is the identical quote `pri` prints instead (GECMDS.C:4368). BUY3 carries
 * `avail` — the number actually for sale (GECMDS.C:4380-4381) — which the port
 * dropped in favour of blaming the planet's "reserve", a field that is zero on
 * every neutral-zone planet and unreadable from inside the game.
 *
 * Every chkweight failure is BUY8 in C (GECMDS.C:4328); the port answered a
 * completely full hold with BUY4, which canon reserves for "They are not
 * selling their %s, Sir!".
 */
import { BuyHandlerService } from '../../../../src/game/commands/handlers/buy.handler';
import { SellHandlerService } from '../../../../src/game/commands/handlers/sell.handler';
import { PriceHandlerService } from '../../../../src/game/commands/handlers/price.handler';
import { PlanetStateService } from '../../../../src/game/planet/planet-state.service';
import { ShipStateService } from '../../../../src/game/ship/ship-state.service';
import { PrismaService } from '../../../../src/prisma/prisma.service';
import { PlanetState } from '../../../../src/game/planet/planet-state.types';
import { ShipState } from '../../../../src/game/ship/ship-state.types';
import { formatMessage, MessageId } from '../../../../src/game/commands/messages';
import { computeBuyOutcome } from '../../../../src/game/planet/planet-trade';
import { BASEPRICE, ITEM_NAMES, I_FOOD, I_SPY, NUMITEMS } from '../../../../src/game/constants/items';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'Ship1', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 0.5, ycoord: 0.5, damage: 0, energy: 1000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 11,
    ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: Array(NUMITEMS).fill(0n) as bigint[],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 0, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 0, warncntr: 0,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...overrides,
  };
}

function makePlanet(overrides: Partial<PlanetState> = {}): PlanetState {
  return {
    xsect: 0, ysect: 0, plnum: 1,
    type: 2, xcoord: 0.5, ycoord: 0.5,
    userid: '**Neutral**', name: 'Zygor-3',
    enviorn: 1, resource: 1,
    cash: 0n, debt: 0n, tax: 0n, taxrate: 0,
    warnings: 0, password: '', lastattack: '',
    beacon: '', spyowner: '', technology: 0, teamcode: 0n,
    items: Array.from({ length: NUMITEMS }, (_, i) => ({
      qty: 1000n, rate: 0, sell: true, reserve: 0, markup2a: BASEPRICE[i] * 2, sold2a: 0n,
    })),
    ...overrides,
  };
}

function makeBuy(buyResult: Awaited<ReturnType<PlanetStateService['buy']>>) {
  const planetMock = { get: jest.fn().mockReturnValue(makePlanet()), buy: jest.fn().mockResolvedValue(buyResult) };
  const shipMock = { mutate: jest.fn() };
  const prismaMock = {
    user: { update: jest.fn().mockResolvedValue({}), findUnique: jest.fn().mockResolvedValue({ cash: 1_000_000n }) },
  };
  return new BuyHandlerService(
    planetMock as unknown as PlanetStateService,
    shipMock as unknown as ShipStateService,
    prismaMock as unknown as PrismaService,
  );
}

describe('buy — canon messages', () => {
  it('confirms a purchase with BUY9, not a paraphrase', async () => {
    const svc = makeBuy({ ok: true, transferred: 100, unitPrice: 4, totalCost: 400n });
    const text = (await svc.command.handler(makeShip(), ['100', 'men'], {})).lines[0].text;
    // BUY9 interpolates item_name[] mid-sentence, and canon's table is lower
    // case (GECMDS.C:95). Only the two COLUMN listings uppercase the first
    // letter, at the call site (GECMDS.C:2065, :2372).
    expect(text).toBe('100 men purchased at the price of 4 each for a total of 400, Sir.');
    expect(text).toBe(formatMessage(MessageId.BUY9, 100, 'men', 4, 400));
  });

  it('names the number for sale in BUY3 instead of blaming a reserve', async () => {
    const svc = makeBuy({ ok: false, reason: 'AT_RESERVE', available: 5 });
    const text = (await svc.command.handler(makeShip(), ['100', 'spy'], {})).lines[0].text;
    expect(text).toBe(`They only have 5 ${ITEM_NAMES[I_SPY]} available for sale, Sir!`);
    expect(text).not.toMatch(/reserve/i);
  });

  it('answers a full hold with BUY8 — every chkweight failure is BUY8 in C', async () => {
    const svc = makeBuy({ ok: false, reason: 'CAPACITY_FULL' });
    const text = (await svc.command.handler(makeShip(), ['100', 'food'], {})).lines[0].text;
    expect(text).toBe('Sorry Sir! That would put us overweight.');
  });
});

describe('pri — canon messages', () => {
  function makePrice(planet: PlanetState) {
    const planetMock = { get: jest.fn().mockReturnValue(planet) } as unknown as PlanetStateService;
    const prismaMock = {
      user: { findUnique: jest.fn().mockResolvedValue({ cash: 1_000_000n }) },
    } as unknown as PrismaService;
    return new PriceHandlerService(planetMock, prismaMock);
  }

  it('quotes BUY3 with the available count', async () => {
    const planet = makePlanet({ userid: 'someone_else' });
    planet.items[I_SPY] = { ...planet.items[I_SPY], qty: 5n };
    const handler = makePrice(planet);
    const result = await handler.command.handler(makeShip({ where: 11 }), ['100', 'spy'], {});
    expect(result.lines[0].text).toBe(`They only have 5 ${ITEM_NAMES[I_SPY]} available for sale, Sir!`);
  });

  it('quotes PRICE1 in canon wording', async () => {
    const planet = makePlanet({ userid: 'someone_else' });
    const handler = makePrice(planet);
    const result = await handler.command.handler(makeShip({ where: 11 }), ['10', 'foo'], {});
    const unit = BASEPRICE[I_FOOD] * 2;
    expect(result.lines[0].text).toBe(
      `10 ${ITEM_NAMES[I_FOOD]} are going to cost ${unit} each for a total of ${unit * 10}, Sir.`,
    );
  });
});

describe('sell — canon messages', () => {
  it('leads SELL2 with the transfer tax, as canon does', async () => {
    const planetMock = {
      sell: jest.fn().mockResolvedValue({ ok: true, transferred: 10, proceeds: 19n, fee: 1n }),
    } as unknown as PlanetStateService;
    const prismaMock = { user: { update: jest.fn().mockResolvedValue({}) } } as unknown as PrismaService;
    const svc = new SellHandlerService(planetMock, prismaMock);

    const text = (await svc.command.handler(makeShip(), ['10', 'food'], {})).lines[0].text;
    expect(text).toBe(`After the Transfer Tax of 1 we have netted 19 C's for our 10 ${ITEM_NAMES[I_FOOD]}, Sir!`);
  });
});

describe('computeBuyOutcome reports what IS for sale', () => {
  it('carries `available` on the AT_RESERVE refusal so BUY3 can name it', () => {
    const planet = makePlanet({ userid: 'someone_else' });
    planet.items[I_SPY] = { ...planet.items[I_SPY], qty: 5n };
    const outcome = computeBuyOutcome({
      planet,
      buyerIsOwner: false,
      itemIndex: I_SPY,
      requestedQty: 100,
      buyerCargoCapacityRemaining: 100_000,
      isNeutralZone: true,
      buyerCash: 1_000_000n,
    });
    expect(outcome).toEqual({ ok: false, reason: 'AT_RESERVE', available: 5 });
  });
});
