/**
 * `tra down` must not create cargo out of nothing.
 *
 * The handler checks cargo sufficiency SYNCHRONOUSLY, awaits `depositToPlanet`,
 * and decrements the ship AFTERWARDS. `depositToPlanet` runs inside the
 * per-planet lock but adds to the planet without re-reading the source hull —
 * the exact inverse of `PlanetStateService.sell()`, which deliberately re-reads
 * and decrements the seller's cargo inside the lock and says so in its JSDoc.
 *
 * So ten `tra down 100 gold` in flight together all pass one check against one
 * snapshot: the planet gains 1,000 and the ship goes to −900. `ShipStateService`
 * clamps nothing. The debt then dies with the hull — buy a new one, or let this
 * one be destroyed — while the gold on the planet does not. `tra up` it in
 * hundred-lots and sell at Zygor.
 *
 * This is M2 from the 2026-09-09 security review.
 * @see docs/audits/2026-09-09-security-review.md M2
 */
import { prisma, truncateAll } from '../prisma-schema/helpers/prisma-test-client';
import { TransferHandlerService } from '../../src/game/commands/handlers/transfer.handler';
import { PlanetStateService } from '../../src/game/planet/planet-state.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { PlanetState, planetKey } from '../../src/game/planet/planet-state.types';
import { ShipState } from '../../src/game/ship/ship-state.types';
import { NUMITEMS, I_GOLD } from '../../src/game/constants/items';
import { CommandResult } from '../../src/game/commands/command.types';

const USERID = 'u-tra-race';
const START_GOLD = 100n;
const QTY = 100;

function makeShip(): ShipState {
  const items = Array(NUMITEMS).fill(0n) as bigint[];
  items[I_GOLD] = START_GOLD;
  return {
    userid: USERID, shipno: 1, shipname: 'Hauler', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5.5, ycoord: 3.5, damage: 0, energy: 1000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 15, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items,
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 0, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 0, warncntr: 0,
    maxTons: 1_000_000,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
  } as ShipState;
}

describe('concurrent `tra down` cannot duplicate cargo (M2)', () => {
  let handler: TransferHandlerService;
  let ship: ShipState;
  let planets: PlanetStateService;

  beforeEach(async () => {
    await truncateAll();
    await prisma.user.create({
      data: { userid: USERID, username: USERID, cash: 0n, options: [] },
    });
    await prisma.planet.create({
      data: {
        xsect: 5, ysect: 3, plnum: 5, type: 2, xcoord: 5.5, ycoord: 3.5,
        userid: USERID, name: 'Home', enviorn: 1, resource: 1,
        cash: 0n, debt: 0n, tax: 0n, taxrate: 0, warnings: 0,
        password: '', lastattack: '', beacon: '', spyowner: '',
        technology: 0, teamcode: 0n,
        itemsQty: Array(NUMITEMS).fill(0n),
        itemsRate: Array(NUMITEMS).fill(10),
        itemsSell: Array(NUMITEMS).fill(1),
        itemsReserve: Array(NUMITEMS).fill(0),
        itemsMarkup2a: Array(NUMITEMS).fill(5),
        itemsSold2a: Array(NUMITEMS).fill(0n),
      },
    });

    ship = makeShip();
    const ships = {
      get: () => ship,
      mutate: (_u: string, _n: number, fn: (s: ShipState) => void) => { fn(ship); return ship; },
      findAllShips: () => [ship],
    } as unknown as ShipStateService;

    planets = new PlanetStateService(prisma as unknown as PrismaService, ships);
    (planets as unknown as { map: Map<string, PlanetState> }).map.set(planetKey(5, 3, 5), {
      xsect: 5, ysect: 3, plnum: 5, type: 2, xcoord: 5.5, ycoord: 3.5,
      userid: USERID, name: 'Home', enviorn: 1, resource: 1,
      cash: 0n, debt: 0n, tax: 0n, taxrate: 0, warnings: 0,
      password: '', lastattack: '', beacon: '', spyowner: '', technology: 0, teamcode: 0n,
      items: Array.from({ length: NUMITEMS }, () => ({
        qty: 0n, rate: 10, sell: true, reserve: 0, markup2a: 5, sold2a: 0n,
      })),
    } as PlanetState);

    handler = new TransferHandlerService(ships, planets);
  });

  afterAll(async () => { await prisma.$disconnect(); });

  const transferDown = () =>
    handler.command.handler(ship, ['down', String(QTY), 'gold'], {}) as Promise<CommandResult>;

  const planetGold = () =>
    (planets as unknown as { map: Map<string, PlanetState> })
      .map.get(planetKey(5, 3, 5))!.items[I_GOLD].qty;

  it('never takes a hold below zero', async () => {
    await Promise.all(Array.from({ length: 10 }, () => transferDown()));

    expect(ship.items[I_GOLD]).toBeGreaterThanOrEqual(0n);
  });

  it('conserves cargo — what the planet gains, the ship loses', async () => {
    await Promise.all(Array.from({ length: 10 }, () => transferDown()));

    const shipLost = START_GOLD - ship.items[I_GOLD];
    expect(planetGold()).toBe(shipLost);
  });

  it('never puts more on the planet than the ship was carrying', async () => {
    await Promise.all(Array.from({ length: 10 }, () => transferDown()));

    expect(planetGold()).toBeLessThanOrEqual(START_GOLD);
  });

  it('a single transfer still works', async () => {
    await transferDown();

    expect(ship.items[I_GOLD]).toBe(0n);
    expect(planetGold()).toBe(START_GOLD);
  });
});
