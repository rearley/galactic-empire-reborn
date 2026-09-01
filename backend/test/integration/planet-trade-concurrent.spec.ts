/**
 * T036 — Concurrent PlanetStateService.buy(, 10_000_000n) calls are serialized (no lost-update race).
 */

import { PlanetStateService } from '../../src/game/planet/planet-state.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { NUMITEMS, I_FOOD } from '../../src/game/constants/items';
import { planetKey } from '../../src/game/planet/planet-state.types';

function makeBaseRow(foodQty: bigint) {
  const itemsQty = Array(NUMITEMS).fill(0n) as bigint[];
  itemsQty[I_FOOD] = foodQty;

  return {
    xsect: 5,
    ysect: 3,
    plnum: 1,
    type: 2,
    xcoord: 5.5,
    ycoord: 3.5,
    userid: null,
    name: '',
    enviorn: 1,
    resource: 1,
    cash: 0n,
    debt: 0n,
    tax: 0n,
    taxrate: 0,
    warnings: 0,
    password: '',
    lastattack: '',
    beacon: '',
    spyowner: '',
    technology: 0,
    teamcode: 0n,
    itemsQty,
    itemsRate: Array(NUMITEMS).fill(10) as number[],
    itemsSell: Array(NUMITEMS).fill(1) as number[],
    itemsReserve: Array(NUMITEMS).fill(0) as number[],
    itemsMarkup2a: Array(NUMITEMS).fill(5) as number[],
    itemsSold2a: Array(NUMITEMS).fill(0n) as bigint[],
  };
}

function buildMocks(foodQty: bigint) {
  let storedRow = { ...makeBaseRow(foodQty) };

  const prismaMock = {
    planet: {
      findMany: jest.fn().mockImplementation(() => Promise.resolve([storedRow])),
      update: jest.fn().mockImplementation(({ data }: { data: Partial<typeof storedRow> }) => {
        storedRow = { ...storedRow, ...data };
        return Promise.resolve({});
      }),
    },
  } as unknown as PrismaService;

  const shipsMock = {
    get: jest.fn(),
    mutate: jest.fn(),
  } as unknown as ShipStateService;

  return { prismaMock, shipsMock, getStoredRow: () => storedRow };
}

describe('T036 — PlanetStateService concurrent buy()', () => {
  const key = planetKey(5, 3, 1);

  describe('concurrent buys serialize correctly', () => {
    /**
     * C's buy is all-or-nothing (`avail >= amt`, GECMDS.C:4331), so with 15 in
     * stock two racing orders for 10 cannot both be served — the loser is
     * refused outright rather than handed the 5 that are left.
     */
    it('one buyer gets all 10, the other is refused — no double-spend', async () => {
      const { prismaMock, shipsMock } = buildMocks(15n);
      const svc = new PlanetStateService(prismaMock, shipsMock);
      await svc.onModuleInit();

      const [r1, r2] = await Promise.all([
        svc.buy(key, 'u1', I_FOOD, 10, 100, 10_000_000n),
        svc.buy(key, 'u2', I_FOOD, 10, 100, 10_000_000n),
      ]);

      const winners = [r1, r2].filter((r) => r.ok);
      expect(winners).toHaveLength(1);
      const total = (r1.ok ? r1.transferred : 0) + (r2.ok ? r2.transferred : 0);
      expect(total).toBe(10);

      const state = svc.get(5, 3, 1);
      expect(state).toBeDefined();
      expect(state!.items[I_FOOD].qty).toBe(5n);

      expect(prismaMock.planet.update).toHaveBeenCalledTimes(1);
    });
  });

  describe('concurrent buys do not double-spend below zero', () => {
    it('total transferred never exceeds starting qty when 5 buyers race', async () => {
      const { prismaMock, shipsMock } = buildMocks(10n);
      const svc = new PlanetStateService(prismaMock, shipsMock);
      await svc.onModuleInit();

      const results = await Promise.all(
        Array.from({ length: 5 }, (_, i) => svc.buy(key, `u${i}`, I_FOOD, 10, 100, 10_000_000n)),
      );

      const totalTransferred = results.reduce((sum, r) => sum + (r.ok ? r.transferred : 0), 0);
      expect(totalTransferred).toBe(10);

      const state = svc.get(5, 3, 1);
      expect(state).toBeDefined();
      expect(state!.items[I_FOOD].qty).toBe(0n);
    });
  });
});
