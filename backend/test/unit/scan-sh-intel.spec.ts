/**
 * S-008 — `scan sh <name>` reveals damage/shields/kills when neither ship is at warp.
 *
 * Original `scan_sh` (GECMDS.C:2244-2256) shows the target's damage string,
 * shield state, and kill count as intel — but ONLY when neither ship has
 * `where === 1` (hyperspace/at-warp). At warp only the abbreviated
 * bearing/distance line is shown.
 *
 * @see GECMDS.C:2244-2256 scan_sh
 * @see specs/029-scan-sh-detail (or 022-fidelity-audit-v2 S-008)
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
  shipClassCache.setForTest(1, { maxAcceleration: 0, maxWarp: 0, scanRange: 100_000, typeName: 'Interceptor' });
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

describe('S-008 — scan sh intel: damage/shields/kills when neither at warp', () => {
  it('shows damage descriptor, shield state, and kills when neither ship is at warp', async () => {
    const self = makeShip({ userid: 'self', shipno: 1, xcoord: 0, ycoord: 0, where: 0 });
    const target = makeShip({
      userid: 'enemy', shipno: 2, shipname: 'EnemyShip',
      xcoord: 0.01, ycoord: 0, where: 0,
      damage: 30,      // → 'moderate'
      shieldstat: 1,   // shields up
      kills: 7,
    });
    const svc = makeService(self, target);

    const result = await svc.command.handler(self, ['sh', 'EnemyShip'], {}) as CommandResult;
    const text = result.lines.map((l) => l.text).join('\n');

    // First line: abbreviated bearing/distance still present
    expect(text).toContain('EnemyShip');
    expect(text).toContain('Interceptor');
    expect(text).toContain('Bearing:');

    // Intel lines: damage, shields, kills
    expect(text).toContain('moderate');
    expect(text).toContain('Shields: UP');
    expect(text).toContain('Kills: 7');
  });

  it('shows "Shields: DOWN" when shieldstat is 0', async () => {
    const self = makeShip({ userid: 'self', shipno: 1, xcoord: 0, ycoord: 0, where: 0 });
    const target = makeShip({
      userid: 'enemy', shipno: 2, shipname: 'DownTarget',
      xcoord: 0.01, ycoord: 0, where: 0,
      damage: 0, shieldstat: 0, kills: 0,
    });
    const svc = makeService(self, target);

    const result = await svc.command.handler(self, ['sh', 'DownTarget'], {}) as CommandResult;
    const text = result.lines.map((l) => l.text).join('\n');
    expect(text).toContain('Shields: DOWN');
  });

  it('shows "Shields: DOWN" for a DAMAGED shield — canon has only UP/DOWN here', async () => {
    const self = makeShip({ userid: 'self', shipno: 1, xcoord: 0, ycoord: 0, where: 0 });
    const target = makeShip({
      userid: 'enemy', shipno: 2, shipname: 'DamagedShields',
      xcoord: 0.01, ycoord: 0, where: 0,
      damage: 0, shieldstat: 3, kills: 2,
    });
    const svc = makeService(self, target);

    const result = await svc.command.handler(self, ['sh', 'DamagedShields'], {}) as CommandResult;
    const text = result.lines.map((l) => l.text).join('\n');
    expect(text).toContain('Shields: DOWN');
    expect(text).toContain('Kills: 2');
  });

  it('omits intel when target is at warp (where === 1) — abbreviated only', async () => {
    const self = makeShip({ userid: 'self', shipno: 1, xcoord: 0, ycoord: 0, where: 0 });
    const target = makeShip({
      userid: 'enemy', shipno: 2, shipname: 'WarpTarget',
      xcoord: 0.01, ycoord: 0, where: 1,  // at warp
      damage: 50, shieldstat: 1, kills: 9,
    });
    const svc = makeService(self, target);

    const result = await svc.command.handler(self, ['sh', 'WarpTarget'], {}) as CommandResult;
    const text = result.lines.map((l) => l.text).join('\n');

    // Abbreviated line still present
    expect(text).toContain('WarpTarget');
    expect(text).toContain('Bearing:');

    // NO intel when target at warp
    expect(text).not.toContain('moderate');
    expect(text).not.toContain('Shields:');
    expect(text).not.toContain('Kills:');
  });

  it('omits intel when scanner is at warp (where === 1) — abbreviated only', async () => {
    const self = makeShip({ userid: 'self', shipno: 1, xcoord: 0, ycoord: 0, where: 1 }); // scanner at warp
    const target = makeShip({
      userid: 'enemy', shipno: 2, shipname: 'SteadyTarget',
      xcoord: 0.01, ycoord: 0, where: 0,
      damage: 20, shieldstat: 1, kills: 3,
    });
    const svc = makeService(self, target);

    const result = await svc.command.handler(self, ['sh', 'SteadyTarget'], {}) as CommandResult;
    const text = result.lines.map((l) => l.text).join('\n');

    expect(text).toContain('SteadyTarget');
    expect(text).toContain('Bearing:');

    // NO intel when scanner at warp
    expect(text).not.toContain('light');
    expect(text).not.toContain('Shields:');
    expect(text).not.toContain('Kills:');
  });

  it('orbiting ships DO reveal intel (where >= 10 is not at-warp)', async () => {
    const self = makeShip({ userid: 'self', shipno: 1, xcoord: 0, ycoord: 0, where: 10 }); // in orbit
    const target = makeShip({
      userid: 'enemy', shipno: 2, shipname: 'OrbiterTarget',
      xcoord: 0.01, ycoord: 0, where: 10,  // also in orbit
      damage: 60, shieldstat: 0, kills: 1,
    });
    const svc = makeService(self, target);

    const result = await svc.command.handler(self, ['sh', 'OrbiterTarget'], {}) as CommandResult;
    const text = result.lines.map((l) => l.text).join('\n');

    // Intel SHOULD appear for orbiting ships
    expect(text).toContain('heavy');
    expect(text).toContain('Shields: DOWN');
    expect(text).toContain('Kills: 1');
  });
});
