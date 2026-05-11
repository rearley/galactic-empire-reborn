/**
 * S-001 — `scan lo` projects at 10× scanRange (the long-range overview).
 *
 * Per GECMDS.C:2668 `range = scanrange * 10.0` and the wiki note
 * "long range scanner is 10x this value" (player-ships.md:39), the
 * `sca lo` mode covers an area 10× wider than the ship's scanner range,
 * making it the "see most of the galaxy at low fidelity" view.
 *
 * The scantab gate stays at `scanRange` so cloak/range exclusion is
 * consistent across modes — only the projection widens.
 *
 * @see GECMDS.C:2668 scan_lo range = scanrange * 10.0
 * @see specs/022-fidelity-audit-v2/findings.md S-001
 */

import { ScanHandlerService } from '../../src/game/commands/handlers/scan.handler';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { PrismaService } from '../../src/prisma/prisma.service';
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
    navTargetX: null, navTargetY: null,
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
  const prismaMock = {
    shipClass: {
      findMany: jest.fn().mockResolvedValue([{ classNumber: 1, scanRange }]),
    },
  };
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
  );
}

describe('S-001 — scan lo uses 10× scanRange projection (long-range overview)', () => {
  // For Interceptor scanRange=100000:
  //   projection radius = scanRange*10 / 10000 = 100 sectors (whole galaxy)
  //   Scantab gate still 10 sectors (100000/10000) — only ships within 10 sectors
  //   are KNOWN, but C scan_lo iterates all ships globally. The TS implementation
  //   keeps the scantab gate to preserve cloak/range exclusion semantics.

  it('header reports 10× scanRange in parsecs', async () => {
    const self = makeShip({ userid: 'self', shipno: 1, xcoord: 5, ycoord: 5 });
    const svc = makeService([self], 100_000);
    await svc.onModuleInit();

    const result = await svc.command.handler(self, ['lo'], {}) as CommandResult;
    // 100000 * 10 / 10000 = 100 pc
    expect(result.scanRender!.header).toContain('Range: 100pc');
  });

  it('Interceptor sees a ship 9 sectors away in scan lo (within scantab gate, well within projection)', async () => {
    const self = makeShip({ userid: 'self', shipno: 1, xcoord: 5, ycoord: 5 });
    // 9 sectors east: still within scanRange/10000 = 10 sector scantab gate
    const distant = makeShip({ userid: 'other', shipno: 1, xcoord: 14, ycoord: 5 });
    const svc = makeService([self, distant], 100_000);
    await svc.onModuleInit();

    const result = await svc.command.handler(self, ['lo'], {}) as CommandResult;
    const shipCells = result.scanRender!.cells.filter((c) => c.type === 'ship');
    expect(shipCells.length).toBe(1);
  });

  it('Dreadnought scan lo projects at 500 parsecs (entire galaxy)', async () => {
    const self = makeShip({ userid: 'self', shipno: 1, xcoord: 5, ycoord: 5 });
    const svc = makeService([self], 500_000);
    await svc.onModuleInit();

    const result = await svc.command.handler(self, ['lo'], {}) as CommandResult;
    expect(result.scanRender!.header).toContain('Range: 500pc');
  });

  it('self-cell at centre (15, 7)', async () => {
    const self = makeShip({ userid: 'self', shipno: 1, xcoord: 5, ycoord: 5 });
    const svc = makeService([self]);
    await svc.onModuleInit();

    const result = await svc.command.handler(self, ['lo'], {}) as CommandResult;
    const selfCells = result.scanRender!.cells.filter((c) => c.type === 'self');
    expect(selfCells).toHaveLength(1);
    expect(selfCells[0].x).toBe(15);
    expect(selfCells[0].y).toBe(7);
  });

  it('ship outside scantab gate (cloaked or out of scanRange) is not shown even on scan lo', async () => {
    const self = makeShip({ userid: 'self', shipno: 1, xcoord: 5, ycoord: 5 });
    const cloaked = makeShip({
      userid: 'cloaked', shipno: 1, xcoord: 6, ycoord: 5, cloak: 10,
    });
    const svc = makeService([self, cloaked], 100_000);
    await svc.onModuleInit();

    const result = await svc.command.handler(self, ['lo'], {}) as CommandResult;
    const shipCells = result.scanRender!.cells.filter((c) => c.type === 'ship');
    expect(shipCells).toHaveLength(0);
  });
});
