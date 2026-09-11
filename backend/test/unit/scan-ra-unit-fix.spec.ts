/**
 * S-003 — `scan ra` projection must use sector-units (effectiveRange/10000),
 * not raw-units. Without this divide, every target collapses onto the centre
 * cell because xfactor is in raw-units-per-cell while target coords are in
 * sector-units (~10000× smaller).
 *
 * Tests use realistic sector-distance targets (multi-sector away) and verify
 * the resulting cell is NOT the centre cell (15, 7).
 *
 * @see GECMDS.C:2517 range = range/10000 (raw→sector conversion before projection)
 * @see specs/022-fidelity-audit-v2/findings.md S-003
 */

import { ScanHandlerService } from '../../src/game/commands/handlers/scan.handler';
import { MineRegistry } from '../../src/game/combat/mine.registry';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ShipClassCacheService } from '../../src/game/physics/ship-class-cache.service';
import { GalaxyService } from '../../src/game/galaxy/galaxy.service';
import { PlanetStateService } from '../../src/game/planet/planet-state.service';
import { ShipState } from '../../src/game/ship/ship-state.types';
import { CommandResult } from '../../src/game/commands/command.types';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u', shipno: 1, shipname: 'Test', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 0, ycoord: 0, damage: 0, energy: 1000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0], items: [],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 0, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 0, warncntr: 0,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...overrides,
  };
}

function makeService(ships: ShipState[], scanRange = 100_000) {
  const shipServiceMock = {
    findAllShips: jest.fn().mockReturnValue(ships),
    findByName: jest.fn().mockReturnValue(undefined),
    get: jest.fn(),
  };
  const prismaMock = {};
  const shipClassCache = new ShipClassCacheService({} as never);
  shipClassCache.setForTest(1, { maxAcceleration: 0, maxWarp: 0, scanRange });
  const galaxyMock = {
    getSectorPlanets: jest.fn().mockReturnValue([]),
    getSectorWormholes: jest.fn().mockReturnValue([]),
    findPlanetByName: jest.fn().mockReturnValue(null),
  };
  const planetServiceMock = { get: jest.fn().mockReturnValue(undefined) };

  return new ScanHandlerService(
    shipServiceMock as unknown as ShipStateService,
    prismaMock as unknown as PrismaService,
    galaxyMock as unknown as GalaxyService,
    planetServiceMock as unknown as PlanetStateService,
    new MineRegistry(),
    undefined,
    shipClassCache,
  );
}

const CENTRE_X = 15;
const CENTRE_Y = 7;

describe('S-003 — scan ra projection uses sector units, not raw units', () => {
  it('level 9: target 5 sectors east of self projects to a cell well right of centre', async () => {
    // For Interceptor (scanRange=100000) at level 9:
    //   effectiveRangeRaw = 100000/1 = 100000
    //   effectiveRangeSectors = 100000/10000 = 10 sectors
    //   rangeDbl = 20 sectors, xfactor = 20/29 ≈ 0.69 sectors/cell
    //   target 5 sectors east: xf = 5/0.69 + 15 ≈ 22.25 → cell 22
    const self = makeShip({ userid: 'self', shipno: 1, xcoord: 0, ycoord: 0 });
    const east = makeShip({ userid: 'east', shipno: 1, xcoord: 5, ycoord: 0 });
    const svc = makeService([self, east], 100_000);

    const result = await svc.command.handler(self, ['ra', '9'], {}) as CommandResult;
    const shipCells = result.scanRender!.cells.filter((c) => c.type === 'ship');
    expect(shipCells.length).toBe(1);
    const cell = shipCells[0];
    // Must be well to the right of centre — not stuck at 15
    expect(cell.x).toBeGreaterThan(CENTRE_X + 3);
    expect(cell.x).toBeLessThanOrEqual(29);
    expect(cell.y).toBeCloseTo(CENTRE_Y, 0);
  });

  it('level 9: target 5 sectors west projects to a cell well left of centre', async () => {
    const self = makeShip({ userid: 'self', shipno: 1, xcoord: 10, ycoord: 5 });
    const west = makeShip({ userid: 'west', shipno: 1, xcoord: 5, ycoord: 5 });
    const svc = makeService([self, west], 100_000);

    const result = await svc.command.handler(self, ['ra', '9'], {}) as CommandResult;
    const shipCells = result.scanRender!.cells.filter((c) => c.type === 'ship');
    expect(shipCells.length).toBe(1);
    expect(shipCells[0].x).toBeLessThan(CENTRE_X - 3);
    expect(shipCells[0].x).toBeGreaterThanOrEqual(0);
  });

  it('level 1: target 0.05 sectors east — visible (high zoom)', async () => {
    // At level 1: effectiveRangeRaw=100000/81≈1235, effectiveRangeSectors=0.1235
    //   rangeDbl=0.247, xfactor=0.247/29≈0.0085 sectors/cell
    //   target 0.05 sectors east: xf=0.05/0.0085+15≈20.9 → cell 20
    const self = makeShip({ userid: 'self', shipno: 1, xcoord: 5, ycoord: 5 });
    const close = makeShip({ userid: 'close', shipno: 1, xcoord: 5.05, ycoord: 5 });
    const svc = makeService([self, close], 100_000);

    const result = await svc.command.handler(self, ['ra', '1'], {}) as CommandResult;
    const shipCells = result.scanRender!.cells.filter((c) => c.type === 'ship');
    expect(shipCells.length).toBe(1);
    expect(shipCells[0].x).toBeGreaterThan(CENTRE_X);
  });

  it('level 1: target 5 sectors away — OFF GRID (out of zoom window)', async () => {
    // At level 1 the effective range is 0.12 sectors — anything beyond that
    // is off the projected grid even though it's within scantab range.
    const self = makeShip({ userid: 'self', shipno: 1, xcoord: 5, ycoord: 5 });
    const far = makeShip({ userid: 'far', shipno: 1, xcoord: 10, ycoord: 5 });
    const svc = makeService([self, far], 100_000);

    const result = await svc.command.handler(self, ['ra', '1'], {}) as CommandResult;
    const shipCells = result.scanRender!.cells.filter((c) => c.type === 'ship');
    expect(shipCells).toHaveLength(0);
  });

  it('zoom monotonicity: target visible at level 9 may be off-grid at level 1', async () => {
    // A target 3 sectors east — visible at level 9 (10-sector window) but
    // off-grid at level 1 (0.12-sector window).
    const self = makeShip({ userid: 'self', shipno: 1, xcoord: 5, ycoord: 5 });
    const target = makeShip({ userid: 't', shipno: 1, xcoord: 8, ycoord: 5 });
    const svc = makeService([self, target], 100_000);

    const r9 = await svc.command.handler(self, ['ra', '9'], {}) as CommandResult;
    const r1 = await svc.command.handler(self, ['ra', '1'], {}) as CommandResult;

    const cells9 = r9.scanRender!.cells.filter((c) => c.type === 'ship');
    const cells1 = r1.scanRender!.cells.filter((c) => c.type === 'ship');
    expect(cells9.length).toBe(1);
    expect(cells1.length).toBe(0);
  });
});
