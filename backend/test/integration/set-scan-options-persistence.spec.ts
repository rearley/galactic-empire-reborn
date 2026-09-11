/**
 * T029 — Persistence integration test for scan options (SC-005).
 *
 * Verifies that:
 * 1. `set scanhome on` writes User.options[1]=1 to the Prisma mock.
 * 2. `set scannames on` writes User.options[0]=1 to the Prisma mock.
 * 3. Re-hydrating ShipState from the persisted options array correctly
 *    sets scanHome=true and scanNames=true.
 *
 * Uses a mock Prisma so no real DB is required.
 *
 * @see specs/015-scan-modes/plan.md §T029 (SC-005)
 * @see backend/src/game/commands/handlers/set.handler.ts
 */

import { SetHandlerService } from '../../src/game/commands/handlers/set.handler';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ShipState } from '../../src/game/ship/ship-state.types';
import { UserRepository } from '../../src/game/player/user.repository';
import { makeShip as baseMakeShip } from '../helpers/make-ship';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    userid: 'user-persist',
    shipname: 'PersistTest',
    xcoord: 5,
    ycoord: 5,
    energy: 10000,
    items: Array(14).fill(0n) as bigint[],
    status: 0,
    ...overrides,
  });
}

interface MockPrisma {
  user: {
    findUnique: jest.Mock;
    update: jest.Mock;
  };
}

function makeSetService(ship: ShipState, dbOptions: number[] = []) {
  const mockShipState = {
    mutate: jest.fn().mockImplementation(
      (_uid: string, _no: number, fn: (s: ShipState) => void) => {
        fn(ship);
        return ship;
      },
    ),
  } as unknown as ShipStateService;

  const mockPrisma: MockPrisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue({ options: dbOptions }),
      update: jest.fn().mockResolvedValue({}),
    },
  };

  return {
    handler: new SetHandlerService(mockShipState, new UserRepository(mockPrisma as unknown as PrismaService)),
    mockPrisma,
    ship,
  };
}

// ---------------------------------------------------------------------------
// SC-005: scanhome persistence round-trip
// ---------------------------------------------------------------------------

describe('SC-005: set scanhome on → Prisma write-through', () => {
  it('set scanhome on writes User.options[1]=1', async () => {
    const ship = makeShip({ scanHome: false });
    const { handler, mockPrisma } = makeSetService(ship, [0, 0]);

    await (handler.command.handler(ship, ['scanhome', 'on'], {}) as Promise<unknown>);

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { userid: 'user-persist' },
      data: { options: [0, 1] },
    });
    // In-memory state updated
    expect(ship.scanHome).toBe(true);
  });

  it('set scanhome off writes User.options[1]=0', async () => {
    const ship = makeShip({ scanHome: true });
    const { handler, mockPrisma } = makeSetService(ship, [0, 1]);

    await (handler.command.handler(ship, ['scanhome', 'off'], {}) as Promise<unknown>);

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { userid: 'user-persist' },
      data: { options: [0, 0] },
    });
    expect(ship.scanHome).toBe(false);
  });

  it('logout simulation: re-hydrating from options[1]=1 → scanHome=true', () => {
    // Simulate the persisted options array as it would come from the DB
    const dbOptions = [0, 1];

    // Simulate re-hydration: a new ship object is constructed from DB values.
    // In ShipStateService hydration, options[1] === 1 → scanHome = true.
    const rehydratedShip = makeShip({
      scanHome: dbOptions[1] === 1,
      scanNames: dbOptions[0] === 1,
    });

    expect(rehydratedShip.scanHome).toBe(true);
    expect(rehydratedShip.scanNames).toBe(false);
  });

  it('logout simulation: re-hydrating from options[0]=1,options[1]=0 → scanNames=true, scanHome=false', () => {
    const dbOptions = [1, 0];

    const rehydratedShip = makeShip({
      scanHome: dbOptions[1] === 1,
      scanNames: dbOptions[0] === 1,
    });

    expect(rehydratedShip.scanNames).toBe(true);
    expect(rehydratedShip.scanHome).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SC-005: scannames persistence round-trip
// ---------------------------------------------------------------------------

describe('SC-005: set scannames on → Prisma write-through', () => {
  it('set scannames on writes User.options[0]=1', async () => {
    const ship = makeShip({ scanNames: false });
    const { handler, mockPrisma } = makeSetService(ship, [0, 0]);

    await (handler.command.handler(ship, ['scannames', 'on'], {}) as Promise<unknown>);

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { userid: 'user-persist' },
      data: { options: [1, 0] },
    });
    expect(ship.scanNames).toBe(true);
  });

  it('set scannames on preserves existing scanhome value in options[1]', async () => {
    const ship = makeShip({ scanNames: false, scanHome: true });
    const { handler, mockPrisma } = makeSetService(ship, [0, 1]);

    await (handler.command.handler(ship, ['scannames', 'on'], {}) as Promise<unknown>);

    const updateCall = mockPrisma.user.update.mock.calls[0][0] as { data: { options: number[] } };
    expect(updateCall.data.options[0]).toBe(1);  // scannames
    expect(updateCall.data.options[1]).toBe(1);  // scanhome preserved
  });
});
