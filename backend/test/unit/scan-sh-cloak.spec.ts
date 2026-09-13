/**
 * S-004 — `scan sh <name>` must refuse fully-cloaked targets.
 *
 * The single-letter branch is already safe (it goes through the scantab which
 * excludes cloak ≥ 10). The multi-char branch hit `findByName` directly with
 * no cloak check, allowing a player to scan and reveal full ship details on
 * a target that should be invisible.
 *
 * @see GECMDS.C:1511 `findshp` — returns -1 if `wptr->cloak >= 10`
 * @see specs/022-fidelity-audit-v2/findings.md S-004
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
import { makeShip as baseMakeShip } from '../helpers/make-ship';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    userid: 'u',
    shipname: 'Test',
    status: 0,
    topspeed: 0,
    ...overrides,
  });
}

function makeService(self: ShipState, target: ShipState | null) {
  const ships = target ? [self, target] : [self];
  const shipServiceMock = {
    findAllShips: vi.fn().mockReturnValue(ships),
    findByName: vi.fn((name: string) => {
      const lower = name.toLowerCase();
      return ships.find((s) => s.shipname.toLowerCase() === lower);
    }),
    get: vi.fn(),
  };
  const prismaMock = {};
  const shipClassCache = new ShipClassCacheService({} as never);
  shipClassCache.setForTest(1, { maxAcceleration: 0, maxWarp: 0, scanRange: 100_000 });
  const galaxyMock = {
    getSectorPlanets: vi.fn().mockReturnValue([]),
    getSectorWormholes: vi.fn().mockReturnValue([]),
    findPlanetByName: vi.fn().mockReturnValue(null),
  };
  const planetServiceMock = { get: vi.fn().mockReturnValue(undefined) };

  const service = new ScanHandlerService(
    shipServiceMock as unknown as ShipStateService,
    prismaMock as unknown as PrismaService,
    galaxyMock as unknown as GalaxyService,
    planetServiceMock as unknown as PlanetStateService,
    new MineRegistry(),
    undefined,
    shipClassCache,
  );
  return service;
}

describe('S-004 — scan sh <name> refuses fully-cloaked targets', () => {
  it('refuses target with cloak >= 10 by name (multi-char branch)', async () => {
    const self = makeShip({ userid: 'self', shipno: 1, xcoord: 0, ycoord: 0 });
    const cloaked = makeShip({
      userid: 't', shipno: 1, shipname: 'CloakedTarget',
      xcoord: 0.01, ycoord: 0, cloak: 10,
    });
    const svc = makeService(self, cloaked);

    const result = await svc.command.handler(self, ['sh', 'CloakedTarget'], {}) as CommandResult;
    // Must not reveal ship details — should be "No ship named …" or out-of-range
    const text = result.lines.map((l) => l.text).join(' ');
    expect(text).toContain('No ship named');
    expect(text).not.toContain('class');
    expect(text).not.toContain('bearing');
  });

  it('reveals non-cloaked target by name', async () => {
    const self = makeShip({ userid: 'self', shipno: 1, xcoord: 0, ycoord: 0 });
    const visible = makeShip({
      userid: 't', shipno: 1, shipname: 'VisibleTarget',
      xcoord: 0.01, ycoord: 0, cloak: 0,
    });
    const svc = makeService(self, visible);

    const result = await svc.command.handler(self, ['sh', 'VisibleTarget'], {}) as CommandResult;
    const text = result.lines.map((l) => l.text).join(' ');
    expect(text).toContain('VisibleTarget');
  });

  it('refuses partially-cloaked target only when cloak >= 10', async () => {
    const self = makeShip({ userid: 'self', shipno: 1, xcoord: 0, ycoord: 0 });
    const partial = makeShip({
      userid: 't', shipno: 1, shipname: 'PartialCloak',
      xcoord: 0.01, ycoord: 0, cloak: 9,  // 9 < 10 → still scannable
    });
    const svc = makeService(self, partial);

    const result = await svc.command.handler(self, ['sh', 'PartialCloak'], {}) as CommandResult;
    const text = result.lines.map((l) => l.text).join(' ');
    expect(text).toContain('PartialCloak');
  });
});
