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

function makeService(self: ShipState, target: ShipState | null) {
  const ships = target ? [self, target] : [self];
  const shipServiceMock = {
    findAllShips: jest.fn().mockReturnValue(ships),
    findByName: jest.fn((name: string) => {
      const lower = name.toLowerCase();
      return ships.find((s) => s.shipname.toLowerCase() === lower);
    }),
    get: jest.fn(),
  };
  const prismaMock = {
    shipClass: {
      findMany: jest.fn().mockResolvedValue([{ classNumber: 1, scanRange: 100_000 }]),
    },
  };
  const galaxyMock = {
    getSectorPlanets: jest.fn().mockReturnValue([]),
    getSectorWormholes: jest.fn().mockReturnValue([]),
    findPlanetByName: jest.fn().mockReturnValue(null),
  };
  const planetServiceMock = { get: jest.fn().mockReturnValue(undefined) };

  const service = new ScanHandlerService(
    shipServiceMock as unknown as ShipStateService,
    prismaMock as unknown as PrismaService,
    galaxyMock as unknown as GalaxyService,
    planetServiceMock as unknown as PlanetStateService,
    new MineRegistry(),
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
    await svc.onModuleInit();

    const result = await svc.command.handler(self, ['sh', 'EnemyShip'], {}) as CommandResult;
    const text = result.lines.map((l) => l.text).join('\n');

    // First line: abbreviated bearing/distance still present
    expect(text).toContain('EnemyShip');
    expect(text).toContain('class');
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
    await svc.onModuleInit();

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
    await svc.onModuleInit();

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
    await svc.onModuleInit();

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
    await svc.onModuleInit();

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
    await svc.onModuleInit();

    const result = await svc.command.handler(self, ['sh', 'OrbiterTarget'], {}) as CommandResult;
    const text = result.lines.map((l) => l.text).join('\n');

    // Intel SHOULD appear for orbiting ships
    expect(text).toContain('heavy');
    expect(text).toContain('Shields: DOWN');
    expect(text).toContain('Kills: 1');
  });
});
