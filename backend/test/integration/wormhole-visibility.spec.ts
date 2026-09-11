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
import { ShipClassCacheService } from '../../src/game/physics/ship-class-cache.service';
import { GalaxyService } from '../../src/game/galaxy/galaxy.service';
import { PlanetStateService } from '../../src/game/planet/planet-state.service';
import { MineRegistry } from '../../src/game/combat/mine.registry';
import { GalaxyWormholeView } from '../../src/game/galaxy/galaxy.types';
import { ShipState } from '../../src/game/ship/ship-state.types';
import { CommandResult } from '../../src/game/commands/command.types';
import { makeShip as baseMakeShip } from '../helpers/make-ship';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    shipname: 'Test',
    xcoord: 5.5,
    ycoord: 5.5,
    topspeed: 0,
    ...overrides,
  });
}

function makeService(wormholes: GalaxyWormholeView[], scanRange = 20000) {
  const shipServiceMock = {
    findAllShips: jest.fn().mockReturnValue([]),
    findByName: jest.fn().mockReturnValue(undefined),
    findByUserid: jest.fn().mockReturnValue([]),
  };
  const prismaMock = {};
  const shipClassCache = new ShipClassCacheService({} as never);
  shipClassCache.setForTest(1, { maxAcceleration: 0, maxWarp: 0, scanRange });
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
    new MineRegistry(),
    undefined,
    shipClassCache,
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
      const result = await (svc.command.handler(makeShip(), ['se'], {}) as Promise<CommandResult>);
      const wCells = result.scanRender!.cells.filter((c) => c.type === 'wormhole');
      expect(wCells).toHaveLength(0);
    });

    it('visible wormhole (visible=true) appears in sector scan grid', async () => {
      const visible: GalaxyWormholeView = {
        xcoord: 5.5, ycoord: 5.6, visible: true,
      };
      const { svc } = makeService([visible]);
      const result = await (svc.command.handler(makeShip(), ['se'], {}) as Promise<CommandResult>);
      const wCells = result.scanRender!.cells.filter((c) => c.type === 'wormhole');
      expect(wCells.length).toBeGreaterThan(0);
      expect(wCells[0].char).toBe('W');
    });
  });
});
