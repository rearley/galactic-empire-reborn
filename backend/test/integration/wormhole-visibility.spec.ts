/**
 * T020 — Wormhole visibility integration test.
 *
 * Verifies that:
 *  1. A wormhole with `visible=false` does NOT appear in the scan grid.
 *  2. A wormhole with `visible=true` DOES appear as a 'W' cell.
 *
 * The `getSectorWormholes` return type must expose `visible: boolean`
 * (not `number`) so callers use type-safe boolean semantics.
 *
 * @see GEMAIN.H:473 — GALWORM.visible
 * @see GEFUNCS.C — scan wormhole rendering
 */

import { ScanHandlerService } from '../../src/game/commands/handlers/scan.handler';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { GalaxyService } from '../../src/game/galaxy/galaxy.service';
import { PlanetStateService } from '../../src/game/planet/planet-state.service';
import { GalaxyWormholeView } from '../../src/game/galaxy/galaxy.types';
import { ShipState } from '../../src/game/ship/ship-state.types';
import { CommandResult } from '../../src/game/commands/command.types';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'Test', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5.5, ycoord: 5.5, damage: 0, energy: 1000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0], items: [],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 0, warncntr: 0,
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...overrides,
  };
}

function makeService(wormholes: GalaxyWormholeView[], scanRange = 20000) {
  const shipServiceMock = {
    findAllShips: jest.fn().mockReturnValue([]),
    findByName: jest.fn().mockReturnValue(undefined),
    findByUserid: jest.fn().mockReturnValue([]),
  };
  const prismaMock = {
    shipClass: {
      findMany: jest.fn().mockResolvedValue([{ classNumber: 1, scanRange }]),
    },
  };
  const galaxyMock = {
    getSectorPlanets: jest.fn().mockReturnValue([]),
    getSectorWormholes: jest.fn().mockReturnValue(wormholes),
    findPlanetByName: jest.fn().mockReturnValue(null),
    getMeta: jest.fn(),
    onModuleInit: jest.fn(),
  };
  const planetServiceMock = { get: jest.fn().mockReturnValue(undefined) };
  const svc = new ScanHandlerService(
    shipServiceMock as unknown as ShipStateService,
    prismaMock as unknown as PrismaService,
    galaxyMock as unknown as GalaxyService,
    planetServiceMock as unknown as PlanetStateService,
  );
  return { svc, galaxyMock };
}

describe('T020 — wormhole visibility gate', () => {
  describe('scan lo', () => {
    // The visibility GATE is exercised under `sca se` below, which is the mode
    // canon populates with planets and wormholes (map_planets, GECMDS.C:2634).
    // `scan_lo` projects ships only (:2686), so there is no wormhole cell there
    // to be visible or hidden. These two cases previously asserted that a
    // visible wormhole DOES appear in the long-range grid, which is the
    // behaviour that buried the whole display under planet markers.
    it('shows no wormhole cells at all, visible or hidden', async () => {
      for (const visible of [true, false]) {
        const w: GalaxyWormholeView = { xcoord: 5.5, ycoord: 5.6, visible };
        const { svc } = makeService([w]);
        await svc.onModuleInit();
        const result = await (svc.command.handler(makeShip(), ['lo'], {}) as Promise<CommandResult>);
        expect(result.scanRender!.cells.filter((c) => c.type === 'wormhole')).toHaveLength(0);
      }
    });
  });

  describe('scan se (sector scan)', () => {
    it('hidden wormhole (visible=false) does NOT appear in sector scan grid', async () => {
      const hidden: GalaxyWormholeView = {
        xcoord: 5.5, ycoord: 5.6, visible: false,
      };
      const { svc } = makeService([hidden]);
      await svc.onModuleInit();
      const result = await (svc.command.handler(makeShip(), ['se'], {}) as Promise<CommandResult>);
      const wCells = result.scanRender!.cells.filter((c) => c.type === 'wormhole');
      expect(wCells).toHaveLength(0);
    });

    it('visible wormhole (visible=true) appears in sector scan grid', async () => {
      const visible: GalaxyWormholeView = {
        xcoord: 5.5, ycoord: 5.6, visible: true,
      };
      const { svc } = makeService([visible]);
      await svc.onModuleInit();
      const result = await (svc.command.handler(makeShip(), ['se'], {}) as Promise<CommandResult>);
      const wCells = result.scanRender!.cells.filter((c) => c.type === 'wormhole');
      expect(wCells.length).toBeGreaterThan(0);
      expect(wCells[0].char).toBe('W');
    });
  });
});
