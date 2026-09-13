/**
 * T023 — PlanetStateService.claim() persists ownership to DB and survives restart.
 *
 * Pattern: stateful mock Prisma (no full AppModule). The mock captures
 * planet.update calls and replays them on the next findMany, simulating a
 * service restart from durable Postgres state.
 */

import { PlanetStateService } from '../../src/game/planet/planet-state.service';
import { NUMITEMS } from '../../src/game/constants/items';
import { planetKey } from '../../src/game/planet/planet-state.types';
import type { Mock } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBaseRow(overrides: Record<string, unknown> = {}) {
  return {
    xsect: 3,
    ysect: 7,
    plnum: 1,
    type: 2,
    xcoord: 3.0,
    ycoord: 7.0,
    userid: null,
    name: 'Unnamed',
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
    itemsQty: Array<bigint>(NUMITEMS).fill(0n),
    itemsRate: Array<number>(NUMITEMS).fill(0),
    itemsSell: Array<number>(NUMITEMS).fill(0), // Int[] in schema
    itemsReserve: Array<number>(NUMITEMS).fill(0),
    itemsMarkup2a: Array<number>(NUMITEMS).fill(0),
    itemsSold2a: Array<bigint>(NUMITEMS).fill(0n),
    ...overrides,
  };
}

function makeShipsMock() {
  return { get: vi.fn(), mutate: vi.fn() };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('T023 — PlanetStateService.claim()', () => {
  const XSECT = 3;
  const YSECT = 7;
  const PLNUM = 1;

  let storedRow: ReturnType<typeof makeBaseRow>;
  let prismaMock: {
    planet: {
      findMany: Mock;
      update: Mock;
    };
    // `update` for winning a world (a missing row is an error), `updateMany`
    // for the floored decrement's predicate. @see issue #15
    user: { updateMany: Mock; update: Mock };
  };

  beforeEach(() => {
    storedRow = makeBaseRow();

    prismaMock = {
      planet: {
        findMany: vi.fn().mockImplementation(() => Promise.resolve([storedRow])),
        update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
          storedRow = { ...storedRow, ...data };
          return Promise.resolve({});
        }),
      },
      // claim/abandon keep the owner's planet counter in step (C: wonplnt()).
      user: { updateMany: vi.fn().mockResolvedValue({ count: 1 }), update: vi.fn().mockResolvedValue({}) },
    };
  });

  it('returns ok:true and calls prisma.planet.update with correct ownership fields', async () => {
    const service = new PlanetStateService(
      prismaMock as never,
      makeShipsMock() as never,
    );
    await service.onModuleInit();

    const result = await service.claim(XSECT, YSECT, PLNUM, 'claimer-01', 'Aurora');

    expect(result.ok).toBe(true);
    expect(prismaMock.planet.update).toHaveBeenCalledTimes(1);

    const callArgs = prismaMock.planet.update.mock.calls[0][0] as {
      where: { xsect_ysect_plnum: { xsect: number; ysect: number; plnum: number } };
      data: Record<string, unknown>;
    };
    expect(callArgs.where.xsect_ysect_plnum).toEqual({ xsect: XSECT, ysect: YSECT, plnum: PLNUM });
    expect(callArgs.data).toMatchObject({ userid: 'claimer-01', name: 'Aurora' });
  });

  it('reflects ownership in in-memory state immediately after claim', async () => {
    const service = new PlanetStateService(
      prismaMock as never,
      makeShipsMock() as never,
    );
    await service.onModuleInit();

    await service.claim(XSECT, YSECT, PLNUM, 'claimer-01', 'Aurora');

    const state = service.get(XSECT, YSECT, PLNUM);
    expect(state).toBeDefined();
    expect(state!.userid).toBe('claimer-01');
    expect(state!.name).toBe('Aurora');
  });

  it('re-hydrates ownership on service restart (simulates process restart from DB)', async () => {
    // First instance: claim the planet.
    const firstService = new PlanetStateService(
      prismaMock as never,
      makeShipsMock() as never,
    );
    await firstService.onModuleInit();
    await firstService.claim(XSECT, YSECT, PLNUM, 'claimer-01', 'Aurora');

    // storedRow has been mutated by the mock's update handler.
    // A new service instance hydrates from the same mock (which now returns the updated row).
    const secondService = new PlanetStateService(
      prismaMock as never,
      makeShipsMock() as never,
    );
    await secondService.onModuleInit();

    const state = secondService.get(XSECT, YSECT, PLNUM);
    expect(state).toBeDefined();
    expect(state!.userid).toBe('claimer-01');
    expect(state!.name).toBe('Aurora');
  });

  it('returns ok:false reason:OWNED when planet is already owned', async () => {
    storedRow = makeBaseRow({ userid: 'existing-owner' });

    const service = new PlanetStateService(
      prismaMock as never,
      makeShipsMock() as never,
    );
    await service.onModuleInit();

    const result = await service.claim(XSECT, YSECT, PLNUM, 'claimer-01', 'Aurora');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('OWNED');
    }
    expect(prismaMock.planet.update).not.toHaveBeenCalled();
  });

  it('returns ok:false reason:NOT_FOUND for an unknown key', async () => {
    const service = new PlanetStateService(
      prismaMock as never,
      makeShipsMock() as never,
    );
    await service.onModuleInit();

    const result = await service.claim(99, 99, 9, 'claimer-01', 'Aurora');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('NOT_FOUND');
    }
  });

  it('returns ok:false reason:INVALID_NAME for a name that is too long', async () => {
    const service = new PlanetStateService(
      prismaMock as never,
      makeShipsMock() as never,
    );
    await service.onModuleInit();

    const longName = 'A'.repeat(20); // 20 chars > 19 char max
    const result = await service.claim(XSECT, YSECT, PLNUM, 'claimer-01', longName);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('INVALID_NAME');
    }
  });

  it('is addressable by planetKey after claim', async () => {
    const service = new PlanetStateService(
      prismaMock as never,
      makeShipsMock() as never,
    );
    await service.onModuleInit();

    await service.claim(XSECT, YSECT, PLNUM, 'claimer-01', 'Aurora');

    const key = planetKey(XSECT, YSECT, PLNUM);
    const state = service.get(XSECT, YSECT, PLNUM);
    expect(key).toBe(`${XSECT}:${YSECT}:${PLNUM}`);
    expect(state?.userid).toBe('claimer-01');
  });
});
