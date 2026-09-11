/**
 * `scan lo` projects at `scanRange × SCAN_LO_PROJECTION_MULTIPLIER`.
 *
 * The C source hard-codes ×10 (`GECMDS.C:2668`), but that factor was
 * calibrated for sysop-configurable universes up to UNIVMAX=32767. Our
 * port hard-codes the minimum MAXX=30, MAXY=15, so the multiplier is
 * dialled down via `SCAN_LO_PROJECTION_MULTIPLIER` in constants.ts.
 *
 * The scantab gate stays at `scanRange` so cloak/range exclusion is
 * consistent across modes — only the projection widens.
 *
 * @see GECMDS.C:2668 scan_lo range = scanrange * 10.0 (C-canonical baseline)
 * @see backend/src/game/constants.ts SCAN_LO_PROJECTION_MULTIPLIER
 * @see specs/022-fidelity-audit-v2/findings.md S-001
 */

import { ScanHandlerService } from '../../src/game/commands/handlers/scan.handler';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ShipClassCacheService } from '../../src/game/physics/ship-class-cache.service';
import { GalaxyService } from '../../src/game/galaxy/galaxy.service';
import { PlanetStateService } from '../../src/game/planet/planet-state.service';
import { MineRegistry } from '../../src/game/combat/mine.registry';
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

describe('scan lo uses SCAN_LO_PROJECTION_MULTIPLIER × scanRange projection', () => {
  // For a ship with scanRange=100000 and multiplier=3 (current value):
  //   projection radius = scanRange*3 / 10000 = 30 sectors (full galaxy width)
  //   Scantab gate still 10 sectors (100000/10000) — only ships within 10 sectors
  //   are KNOWN, but planets/wormholes are projected up to the wider radius.

  it('header reports the RAW projectionRange under SCAN24', async () => {
    const self = makeShip({ userid: 'self', shipno: 1, xcoord: 5, ycoord: 5 });
    const svc = makeService([self], 100_000);

    const result = await svc.command.handler(self, ['lo'], {}) as CommandResult;
    // SCAN24 prints the RAW range: 100000 x 3 = 300000. Canon divides by
    // 10 000 only AFTER printing (GECMDS.C:2516 then :2521), and has no 'pc'.
    expect(result.scanRender!.header).toContain('Range Scan Dist:300000');
  });

  it('Interceptor sees a ship 9 sectors away in scan lo (within scantab gate, well within projection)', async () => {
    const self = makeShip({ userid: 'self', shipno: 1, xcoord: 5, ycoord: 5 });
    // 9 sectors east: still within scanRange/10000 = 10 sector scantab gate
    const distant = makeShip({ userid: 'other', shipno: 1, xcoord: 14, ycoord: 5 });
    const svc = makeService([self, distant], 100_000);

    const result = await svc.command.handler(self, ['lo'], {}) as CommandResult;
    const shipCells = result.scanRender!.cells.filter((c) => c.type === 'ship');
    expect(shipCells.length).toBe(1);
  });

  it('large scanRange projects proportionally (500_000 -> 1.5m raw at 3x)', async () => {
    const self = makeShip({ userid: 'self', shipno: 1, xcoord: 5, ycoord: 5 });
    const svc = makeService([self], 500_000);

    const result = await svc.command.handler(self, ['lo'], {}) as CommandResult;
    // 500000 x 3 = 1500000 raw.
    expect(result.scanRender!.header).toContain('Range Scan Dist:1500000');
  });

  it('self-cell at centre (15, 7)', async () => {
    const self = makeShip({ userid: 'self', shipno: 1, xcoord: 5, ycoord: 5 });
    const svc = makeService([self]);

    const result = await svc.command.handler(self, ['lo'], {}) as CommandResult;
    const selfCells = result.scanRender!.cells.filter((c) => c.type === 'self');
    expect(selfCells).toHaveLength(1);
    expect(selfCells[0].x).toBe(15);
    expect(selfCells[0].y).toBe(7);
  });

  /**
   * CORRECTION 2026-09-06. This case asserted the opposite — that a ship
   * outside the scantab gate is "not shown even on scan lo" — and it was
   * wrong, so the passing test was holding the defect in place.
   *
   * Canon's map loop tests `ingegame` and nothing else (GECMDS.C:2686-2718):
   * no cloak test, no range test. Cloak and `scanrange` gate the SCANTAB
   * (GECMDS.C:1371), which is a different table answering a different
   * question — what a contact IS, not whether it is there. Gating the map on
   * it made the outer ~90% of a LONG RANGE scan permanently blank.
   *
   * @see test/unit/scan-lo-projects-all-ships.spec.ts
   */
  it('shows a cloaked ship on the map — canon gates cloak in the scantab, not here', async () => {
    const self = makeShip({ userid: 'self', shipno: 1, xcoord: 5, ycoord: 5 });
    const cloaked = makeShip({
      userid: 'cloaked', shipno: 1, xcoord: 6, ycoord: 5, cloak: 10,
    });
    const svc = makeService([self, cloaked], 100_000);

    const result = await svc.command.handler(self, ['lo'], {}) as CommandResult;
    const shipCells = result.scanRender!.cells.filter((c) => c.type === 'ship');
    // Present, but with no scantab letter — an unidentified contact. Cloak
    // still costs the attacker their identity, range readout and lock.
    expect(shipCells).toHaveLength(1);
    expect(shipCells[0].char).toBe('=');
  });
});
