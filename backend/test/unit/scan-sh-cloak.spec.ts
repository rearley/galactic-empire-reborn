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

describe('S-004 — scan sh <name> refuses fully-cloaked targets', () => {
  it('refuses target with cloak >= 10 by name (multi-char branch)', async () => {
    const self = makeShip({ userid: 'self', shipno: 1, xcoord: 0, ycoord: 0 });
    const cloaked = makeShip({
      userid: 't', shipno: 1, shipname: 'CloakedTarget',
      xcoord: 0.01, ycoord: 0, cloak: 10,
    });
    const svc = makeService(self, cloaked);
    await svc.onModuleInit();

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
    await svc.onModuleInit();

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
    await svc.onModuleInit();

    const result = await svc.command.handler(self, ['sh', 'PartialCloak'], {}) as CommandResult;
    const text = result.lines.map((l) => l.text).join(' ');
    expect(text).toContain('PartialCloak');
  });
});
