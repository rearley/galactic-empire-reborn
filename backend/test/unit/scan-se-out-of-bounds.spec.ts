/**
 * `scan se` must not throw when the ship is outside the generated sector grid.
 *
 * The galaxy covers the universe square, -UNIVMAX..+UNIVMAX on both axes, and
 * GalaxyService.getSectorPlanets/getSectorWormholes THROW outside it. A ship can
 * still be handed coordinates beyond that edge — mid-wrap, or from a stale
 * position — so the handler must guard rather than crash.
 *
 * (Before the universe was centred on the origin, the galaxy was generated only
 * for 0..MAXX-1 x 0..MAXY-1 while ships flew freely into negative sectors, which
 * is the mismatch this spec was originally written for.)
 *
 * ScanHandlerService.handleSectorScan calls both with the raw floor of the ship
 * coordinates and has no bounds guard — unlike the long-range projection path,
 * which does guard (`if (sx < 0 || sx >= 30 ...) continue`). Every existing
 * scan spec stubs GalaxyService with a mock that never throws, so the crash was
 * invisible to the suite.
 *
 * This harness reproduces the REAL guard so the regression is caught.
 *
 * @see src/game/galaxy/galaxy.service.ts getSectorPlanets bounds check
 * @see src/game/commands/handlers/scan.handler.ts handleSectorScan
 */

import { ScanHandlerService } from '../../src/game/commands/handlers/scan.handler';
import { MineRegistry } from '../../src/game/combat/mine.registry';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { GalaxyService } from '../../src/game/galaxy/galaxy.service';
import { PlanetStateService } from '../../src/game/planet/planet-state.service';
import { ShipState } from '../../src/game/ship/ship-state.types';
import { CommandResult } from '../../src/game/commands/command.types';
import { UNIVMAX } from '../../src/game/constants';
import { makeShip as baseMakeShip } from '../helpers/make-ship';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    shipname: 'Test',
    xcoord: 5.5,
    ycoord: 7.5,
    status: 0,
    topspeed: 0,
    ...overrides,
  });
}

/** Galaxy stub that enforces the SAME bounds contract as the real service. */
function makeBoundedService(ships: ShipState[]) {
  const inRange = (x: number, y: number) =>
    x >= -UNIVMAX && x <= UNIVMAX && y >= -UNIVMAX && y <= UNIVMAX;

  const galaxyMock = {
    getSectorPlanets: jest.fn((x: number, y: number) => {
      if (!inRange(x, y)) throw new Error(`getSectorPlanets: out-of-range coords (${x}, ${y})`);
      return [];
    }),
    getSectorWormholes: jest.fn((x: number, y: number) => {
      if (!inRange(x, y)) throw new Error(`getSectorWormholes: out-of-range coords (${x}, ${y})`);
      return [];
    }),
    findPlanetByName: jest.fn().mockReturnValue(null),
    getMeta: jest.fn(),
    onModuleInit: jest.fn(),
  };

  const service = new ScanHandlerService(
    { findAllShips: jest.fn().mockReturnValue(ships), findByName: jest.fn(), findByUserid: jest.fn().mockReturnValue([]) } as unknown as ShipStateService,
    { shipClass: { findMany: jest.fn().mockResolvedValue([{ classNumber: 1, scanRange: 100_000 }]) } } as unknown as PrismaService,
    galaxyMock as unknown as GalaxyService,
    { get: jest.fn().mockReturnValue(undefined) } as unknown as PlanetStateService,
    new MineRegistry(),
  );
  return { service, galaxyMock };
}

describe('scan se — ship outside the generated sector grid', () => {
  const outOfBounds: Array<[string, number, number]> = [
    ['negative x (west of the grid)', -13.5, 7.5],
    ['west of the universe', -(UNIVMAX + 1.5), 5.5],
    ['south of the universe', 5.5, -(UNIVMAX + 1.5)],
    ['both beyond the edge', -(UNIVMAX + 2.5), -(UNIVMAX + 1.5)],
    ['east of the universe', UNIVMAX + 0.5, 7.5],
    ['north of the universe', 5.5, UNIVMAX + 0.5],
  ];

  test.each(outOfBounds)('does not throw for %s', async (_label, xcoord, ycoord) => {
    const self = makeShip({ userid: 'self', shipno: 1, xcoord, ycoord });
    const { service } = makeBoundedService([self]);

    await expect(
      service.command.handler(self, ['se'], {}) as Promise<CommandResult>,
    ).resolves.toBeDefined();
  });

  test('still renders the in-sector case correctly (guard does not break the happy path)', async () => {
    const self = makeShip({ userid: 'self', shipno: 1, xcoord: 5.5, ycoord: 7.5 });
    const { service } = makeBoundedService([self]);

    const result = await (service.command.handler(self, ['se'], {}) as Promise<CommandResult>);
    expect(result.scanRender).toBeDefined();
  });
});
