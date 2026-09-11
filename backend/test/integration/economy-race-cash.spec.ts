/**
 * Concurrent purchases must not spend money the pilot does not have.
 *
 * `buy` reads cash with a bare `findUnique`, awaits the planet transaction, then
 * applies an UNCONDITIONAL `decrement`. Nothing serializes commands from one
 * socket — `game.gateway.ts:940` fires `dispatch` and only `.then()`s it — so
 * twenty `buy` packets all reach the first await before any resolves, all read
 * the same balance, all pass the affordability gate, and all commit. The
 * balance goes deeply negative; `buy.handler.ts:93-98` then clamps it back to
 * zero on the NEXT purchase, cancelling the debt. Sell the goods back and
 * repeat: unbounded credit creation.
 *
 * The clamp itself is canon (GECMDS.C:4205-4207) and stays. Canon was safe
 * because MajorBBS ran one command per user at a time; the defect is ours.
 *
 * This is M1 from the 2026-09-09 security review. It runs against a REAL
 * Postgres, because the race lives in the gap between a read and a write that
 * a mocked client does not have. `planet-trade-concurrent.spec.ts` looks like
 * this test and is not: its Prisma is an in-memory object, so it exercises the
 * planet lock's logic and nothing about database concurrency.
 *
 * @see docs/audits/2026-09-09-security-review.md M1
 */
import { prisma, truncateAll } from '../prisma-schema/helpers/prisma-test-client';
import { BuyHandlerService } from '../../src/game/commands/handlers/buy.handler';
import { PlanetStateService } from '../../src/game/planet/planet-state.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { PlanetState, planetKey } from '../../src/game/planet/planet-state.types';
import { ShipState } from '../../src/game/ship/ship-state.types';
import { NUMITEMS, I_FOOD } from '../../src/game/constants/items';
import { CommandResult } from '../../src/game/commands/command.types';
import { formatMessage, MessageId } from '../../src/game/commands/messages';
import { UserRepository } from '../../src/game/player/user.repository';

const USERID = 'u-econ-race';
const START_CASH = 1_000n;
/**
 * A non-owner pays `item.markup2a` per unit (planet-trade.ts:131), so the
 * price is exactly this and one `buy 100 food` costs the whole balance.
 */
const UNIT_PRICE = 10n;
const QTY = 100;

function makeShip(): ShipState {
  return {
    userid: USERID, shipno: 1, shipname: 'Racer', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5.5, ycoord: 3.5, damage: 0, energy: 1000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 15, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: Array(NUMITEMS).fill(0n),
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 0, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 0, warncntr: 0,
    maxTons: 1_000_000,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
  } as ShipState;
}

function makePlanet(): PlanetState {
  return {
    xsect: 5, ysect: 3, plnum: 5,
    type: 2, xcoord: 5.5, ycoord: 3.5,
    userid: 'someone-else', name: 'Market',
    enviorn: 1, resource: 1,
    cash: 0n, debt: 0n, tax: 0n, taxrate: 0,
    warnings: 0, password: '', lastattack: '',
    beacon: '', spyowner: '', technology: 0, teamcode: 0n,
    items: Array.from({ length: NUMITEMS }, () => ({
      qty: 10_000_000n, rate: 10, sell: true, reserve: 0, markup2a: Number(UNIT_PRICE), sold2a: 0n,
    })),
  } as PlanetState;
}

describe('concurrent `buy` cannot overdraw a balance (M1)', () => {
  let handler: BuyHandlerService;
  let ship: ShipState;

  beforeEach(async () => {
    await truncateAll();
    await prisma.user.create({
      data: { userid: USERID, username: USERID, cash: START_CASH, options: [] },
    });
    await prisma.user.create({
      data: { userid: 'someone-else', username: 'someone-else', cash: 0n, options: [] },
    });
    // The planet must exist in Postgres too: the buy path write-throughs.
    await prisma.planet.create({
      data: {
        xsect: 5, ysect: 3, plnum: 5, type: 2, xcoord: 5.5, ycoord: 3.5,
        userid: 'someone-else', name: 'Market', enviorn: 1, resource: 1,
        cash: 0n, debt: 0n, tax: 0n, taxrate: 0, warnings: 0,
        password: '', lastattack: '', beacon: '', spyowner: '',
        technology: 0, teamcode: 0n,
        itemsQty: Array(NUMITEMS).fill(10_000_000n),
        itemsRate: Array(NUMITEMS).fill(10),
        itemsSell: Array(NUMITEMS).fill(1),
        itemsReserve: Array(NUMITEMS).fill(0),
        itemsMarkup2a: Array(NUMITEMS).fill(Number(UNIT_PRICE)),
        itemsSold2a: Array(NUMITEMS).fill(0n),
      },
    });

    ship = makeShip();
    const ships = {
      get: () => ship,
      mutate: (_u: string, _n: number, fn: (s: ShipState) => void) => { fn(ship); return ship; },
      findAllShips: () => [ship],
    } as unknown as ShipStateService;

    const planets = new PlanetStateService(prisma as unknown as PrismaService, ships);
    (planets as unknown as { map: Map<string, PlanetState> })
      .map.set(planetKey(5, 3, 5), makePlanet());

    handler = new BuyHandlerService(
      planets,
      ships,
      new UserRepository(prisma as unknown as PrismaService),
    );
  });

  afterAll(async () => { await prisma.$disconnect(); });

  const buyOnce = () =>
    handler.command.handler(ship, [String(QTY), 'food'], {}) as Promise<CommandResult>;

  it('twenty simultaneous purchases never drive the balance negative', async () => {
    // All twenty reach the `findUnique` before any of them writes.
    await Promise.all(Array.from({ length: 20 }, () => buyOnce()));

    const { cash } = await prisma.user.findUniqueOrThrow({
      where: { userid: USERID }, select: { cash: true },
    });
    expect(cash).toBeGreaterThanOrEqual(0n);
  });

  it('never delivers more goods than the balance could afford', async () => {
    // The money and the goods stay CONSISTENT even during the race — twenty
    // buys take 20,000 credits and deliver 2,000 food. What breaks is that the
    // 20,000 was never there. So the invariant to assert is the ceiling, not
    // the ratio.
    await Promise.all(Array.from({ length: 20 }, () => buyOnce()));

    const maxAffordable = START_CASH / UNIT_PRICE;
    expect(ship.items[I_FOOD]).toBeLessThanOrEqual(maxAffordable);
  });

  it('refuses the losers rather than silently handing them the goods', async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => buyOnce()));
    const text = results.map((r) => r.lines.map((l) => l.text).join(' ')).join('\n');

    // One purchase spends the lot; the other nineteen must be told no.
    expect(text).toContain(formatMessage(MessageId.PRICE_NO_CASH));
  });

  it('a single purchase still works', async () => {
    const result = await buyOnce();
    const { cash } = await prisma.user.findUniqueOrThrow({
      where: { userid: USERID }, select: { cash: true },
    });

    expect(ship.items[I_FOOD]).toBeGreaterThan(0n);
    expect(cash).toBeGreaterThanOrEqual(0n);
    expect(result.lines.length).toBeGreaterThan(0);
  });
});
