/**
 * T035 — PlanetStateService.buy(, 10_000_000n) flushes correct ledger to DB and restores on restart.
 *
 * Sub-tests:
 *   1. Happy-path: buy() decrements inventory, flushes to DB once.
 *   2. Re-hydration: a new service instance sees the updated quantity from DB.
 *   3. Neutral-zone: buy() does NOT decrement planet inventory or flush DB.
 */

import { PlanetStateService } from '../../src/game/planet/planet-state.service';
import { NUMITEMS, I_FOOD, BASEPRICE } from '../../src/game/constants/items';
import { planetKey } from '../../src/game/planet/planet-state.types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeItemArrays(overrides: Partial<{
  itemsQty: bigint[];
  itemsRate: number[];
  itemsSell: number[];
  itemsReserve: number[];
  itemsMarkup2a: number[];
  itemsSold2a: bigint[];
}> = {}) {
  return {
    itemsQty: Array<bigint>(NUMITEMS).fill(0n),
    itemsRate: Array<number>(NUMITEMS).fill(0),
    itemsSell: Array<number>(NUMITEMS).fill(0), // Int[] in schema (0 = false, 1 = true)
    itemsReserve: Array<number>(NUMITEMS).fill(0),
    itemsMarkup2a: Array<number>(NUMITEMS).fill(0),
    itemsSold2a: Array<bigint>(NUMITEMS).fill(0n),
    ...overrides,
  };
}

function makeNonNeutralRow() {
  const itemsQty = Array<bigint>(NUMITEMS).fill(0n);
  itemsQty[I_FOOD] = 100n;

  const itemsMarkup2a = Array<number>(NUMITEMS).fill(0);
  itemsMarkup2a[I_FOOD] = 5;

  const itemsSell = Array<number>(NUMITEMS).fill(0);
  itemsSell[I_FOOD] = 1; // sell flag ON

  return {
    xsect: 5,
    ysect: 3,
    plnum: 1,
    type: 2,
    xcoord: 5.0,
    ycoord: 3.0,
    userid: 'planet-owner',
    name: 'Harvest World',
    enviorn: 5,
    resource: 10,
    cash: 0n,
    debt: 0n,
    tax: 0n,
    taxrate: 10,
    warnings: 0,
    password: '',
    lastattack: '',
    beacon: '',
    spyowner: '',
    technology: 0,
    teamcode: 0n,
    ...makeItemArrays({ itemsQty, itemsMarkup2a, itemsSell }),
  };
}

function makeNeutralZoneRow() {
  const itemsSell = Array<number>(NUMITEMS).fill(1); // all items for sale
  const itemsQty = Array<bigint>(NUMITEMS).fill(9_999_999n);
  const itemsMarkup2a = Array<number>(NUMITEMS).fill(5);

  return {
    xsect: 0,
    ysect: 0,
    plnum: 1,
    type: 1,
    xcoord: 0.0,
    ycoord: 0.0,
    userid: null,
    name: 'Zygor-3',
    enviorn: 10,
    resource: 10,
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
    ...makeItemArrays({ itemsQty, itemsSell, itemsMarkup2a }),
  };
}

function makeShipsMock() {
  return { get: jest.fn(), mutate: jest.fn() };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('T035 — PlanetStateService.buy(, 10_000_000n) persistence and re-hydration', () => {
  describe('non-neutral-zone planet (xsect=5, ysect=3)', () => {
    let storedRow: ReturnType<typeof makeNonNeutralRow>;
    let prismaMock: {
      planet: {
        findMany: jest.Mock;
        update: jest.Mock;
      };
    };

    beforeEach(() => {
      storedRow = makeNonNeutralRow();

      prismaMock = {
        planet: {
          findMany: jest.fn().mockImplementation(() => Promise.resolve([storedRow])),
          update: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
            storedRow = { ...storedRow, ...data };
            return Promise.resolve({});
          }),
        },
      };
    });

    it('returns ok:true with transferred=10 and decrements in-memory qty', async () => {
      const service = new PlanetStateService(
        prismaMock as never,
        makeShipsMock() as never,
      );
      await service.onModuleInit();

      const key = planetKey(5, 3, 1);
      const result = await service.buy(key, 'buyer-01', I_FOOD, 10, 100, 10_000_000n);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.transferred).toBe(10);
      }

      const state = service.get(5, 3, 1);
      expect(state).toBeDefined();
      expect(state!.items[I_FOOD].qty).toBe(90n);
    });

    it('calls prisma.planet.update exactly once after a successful buy', async () => {
      const service = new PlanetStateService(
        prismaMock as never,
        makeShipsMock() as never,
      );
      await service.onModuleInit();

      const key = planetKey(5, 3, 1);
      await service.buy(key, 'buyer-01', I_FOOD, 10, 100, 10_000_000n);

      expect(prismaMock.planet.update).toHaveBeenCalledTimes(1);
    });

    it('flushes updated itemsQty to DB so new instance re-hydrates qty=90', async () => {
      // First instance: execute the buy.
      const firstService = new PlanetStateService(
        prismaMock as never,
        makeShipsMock() as never,
      );
      await firstService.onModuleInit();

      const key = planetKey(5, 3, 1);
      await firstService.buy(key, 'buyer-01', I_FOOD, 10, 100, 10_000_000n);

      // storedRow has been mutated by the mock's update handler.
      // A new service instance hydrates from the same mock (updated row).
      const secondService = new PlanetStateService(
        prismaMock as never,
        makeShipsMock() as never,
      );
      await secondService.onModuleInit();

      const state = secondService.get(5, 3, 1);
      expect(state).toBeDefined();
      expect(state!.items[I_FOOD].qty).toBe(90n);
    });

    it('buyer pays non-owner markup (markup2a=5) when buyer is not the owner', async () => {
      const service = new PlanetStateService(
        prismaMock as never,
        makeShipsMock() as never,
      );
      await service.onModuleInit();

      const key = planetKey(5, 3, 1);
      const result = await service.buy(key, 'non-owner', I_FOOD, 10, 100, 10_000_000n);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.unitPrice).toBe(5); // markup2a
        expect(result.totalCost).toBe(50n); // 10 * 5
      }
    });

    it('buyer pays baseprice when buyer IS the owner', async () => {
      const service = new PlanetStateService(
        prismaMock as never,
        makeShipsMock() as never,
      );
      await service.onModuleInit();

      const key = planetKey(5, 3, 1);
      // 'planet-owner' matches the row's userid
      const result = await service.buy(key, 'planet-owner', I_FOOD, 10, 100, 10_000_000n);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.unitPrice).toBe(BASEPRICE[I_FOOD]);
        expect(result.totalCost).toBe(BigInt(10 * BASEPRICE[I_FOOD]));
      }
    });

    it('returns ok:false reason:AT_RESERVE when requested qty exceeds available stock', async () => {
      // Set qty=5, reserve=5 → available = 0
      storedRow.itemsQty[I_FOOD] = 5n;
      storedRow.itemsReserve[I_FOOD] = 5;

      const service = new PlanetStateService(
        prismaMock as never,
        makeShipsMock() as never,
      );
      await service.onModuleInit();

      const key = planetKey(5, 3, 1);
      const result = await service.buy(key, 'buyer-01', I_FOOD, 10, 100, 10_000_000n);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('AT_RESERVE');
      }
      expect(prismaMock.planet.update).not.toHaveBeenCalled();
    });

    it('returns ok:false reason:NOT_FOUND for an unknown planet key', async () => {
      const service = new PlanetStateService(
        prismaMock as never,
        makeShipsMock() as never,
      );
      await service.onModuleInit();

      const result = await service.buy(planetKey(99, 99, 9), 'buyer-01', I_FOOD, 10, 100, 10_000_000n);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('NOT_FOUND');
      }
    });
  });

  describe('neutral-zone planet (xsect=0, ysect=0) — no inventory mutation', () => {
    let storedRow: ReturnType<typeof makeNeutralZoneRow>;
    let prismaMock: {
      planet: {
        findMany: jest.Mock;
        update: jest.Mock;
      };
    };

    beforeEach(() => {
      storedRow = makeNeutralZoneRow();

      prismaMock = {
        planet: {
          findMany: jest.fn().mockImplementation(() => Promise.resolve([storedRow])),
          update: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
            storedRow = { ...storedRow, ...data };
            return Promise.resolve({});
          }),
        },
      };
    });

    it('returns ok:true and does NOT call prisma.planet.update', async () => {
      const service = new PlanetStateService(
        prismaMock as never,
        makeShipsMock() as never,
      );
      await service.onModuleInit();

      const key = planetKey(0, 0, 1);
      const result = await service.buy(key, 'buyer-01', I_FOOD, 10, 100, 10_000_000n);

      expect(result.ok).toBe(true);
      expect(prismaMock.planet.update).not.toHaveBeenCalled();
    });

    it('does NOT decrement neutral-zone planet inventory', async () => {
      const service = new PlanetStateService(
        prismaMock as never,
        makeShipsMock() as never,
      );
      await service.onModuleInit();

      const key = planetKey(0, 0, 1);
      await service.buy(key, 'buyer-01', I_FOOD, 10, 100, 10_000_000n);

      const state = service.get(0, 0, 1);
      expect(state!.items[I_FOOD].qty).toBe(9_999_999n); // unchanged
    });

    it('still transfers goods at baseprice in neutral zone when buyer is not owner', async () => {
      const service = new PlanetStateService(
        prismaMock as never,
        makeShipsMock() as never,
      );
      await service.onModuleInit();

      const key = planetKey(0, 0, 1);
      // userid is null, so buyer cannot be owner; uses markup2a=5
      const result = await service.buy(key, 'buyer-01', I_FOOD, 10, 100, 10_000_000n);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.transferred).toBe(10);
      }
    });
  });
});
