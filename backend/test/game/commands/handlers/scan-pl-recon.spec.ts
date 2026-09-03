/**
 * `sca pl <n>` — the two blocks that were never ported.
 *
 * 1. The NOT-OWNER reconnaissance block (GECMDS.C:2377-2448, SCAN28..SCAN34).
 *    Scouting a planet you do not own is supposed to tell you how heavily it is
 *    populated and roughly how deep its missile / torpedo / fluxpod / food
 *    stockpiles run, plus whether fighters are present at all. Without it there
 *    is no way to tell a defended colony from an empty rock, which removes the
 *    reason to scout before attacking.
 *
 * 2. The WORMHOLE branch (GECMDS.C:2455-2468, SCANWRM / SCANWRM1 / SCAN10).
 *    A wormhole occupies a planet slot in the sector, so `sca pl <n>` can name
 *    one; the port answered "no such planet".
 */
import { ScanHandlerService } from '../../../../src/game/commands/handlers/scan.handler';
import { ShipStateService } from '../../../../src/game/ship/ship-state.service';
import { GalaxyService } from '../../../../src/game/galaxy/galaxy.service';
import { PlanetStateService } from '../../../../src/game/planet/planet-state.service';
import { PrismaService } from '../../../../src/prisma/prisma.service';
import { ShipState } from '../../../../src/game/ship/ship-state.types';
import { PlanetState } from '../../../../src/game/planet/planet-state.types';
import { CommandContext } from '../../../../src/game/commands/command.types';
import {
  NUMITEMS, I_MEN, I_TROOPS, I_MISSL, I_TORP, I_FLUX, I_FOOD, I_FIGHTER,
} from '../../../../src/game/constants/items';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'alice', shipno: 1, shipname: 'Scout', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 10.5, ycoord: 7.5, damage: 0, energy: 50000,
    phasr: 0, phasrtype: 0, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0,
    ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: Array(NUMITEMS).fill(0n) as bigint[],
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 0, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 5, warncntr: 0,
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...overrides,
  } as ShipState;
}

function makePlanetState(qty: Partial<Record<number, bigint>> = {}, overrides: Partial<PlanetState> = {}): PlanetState {
  return {
    xsect: 10, ysect: 7, plnum: 1,
    type: 1, xcoord: 10.5, ycoord: 7.5,
    userid: 'bob', name: 'Fort Bob',
    enviorn: 3, resource: 2, cash: 0n, debt: 0n, tax: 0n,
    taxrate: 0, warnings: 0, password: '', lastattack: '',
    beacon: '', spyowner: '', technology: 0, teamcode: 0n,
    items: Array.from({ length: NUMITEMS }, (_, i) => ({
      qty: qty[i] ?? 0n,
      rate: 0, sell: false, reserve: 0, markup2a: 10, sold2a: 0n,
    })),
    ...overrides,
  };
}

function makeService(planet: PlanetState, wormholes: unknown[] = []) {
  const mockShipService = {
    findAllShips: jest.fn().mockReturnValue([]),
    findByName: jest.fn().mockReturnValue(undefined),
  } as unknown as ShipStateService;

  const mockGalaxyService = {
    findPlanetByName: jest.fn().mockReturnValue(null),
    getSectorPlanets: jest.fn().mockReturnValue([]),
    getSectorWormholes: jest.fn().mockReturnValue([]),
  } as unknown as GalaxyService;

  const mockPlanetService = {
    get: jest.fn().mockReturnValue(planet),
    bySector: jest.fn().mockReturnValue([planet]),
    byName: jest.fn().mockReturnValue(undefined),
  } as unknown as PlanetStateService;

  const mockPrisma = {
    shipClass: { findMany: jest.fn().mockResolvedValue([]) },
    user: { findUnique: jest.fn().mockResolvedValue(null) },
    wormhole: {
      findMany: jest.fn().mockImplementation(() => Promise.resolve(wormholes)),
      findFirst: jest.fn().mockImplementation((q: { where: { plnum: number } }) => Promise.resolve((wormholes as { plnum: number }[]).find((w) => w.plnum === q.where.plnum) ?? null)),
    },
  } as unknown as PrismaService;

  return new ScanHandlerService(mockShipService, mockPrisma, mockGalaxyService, mockPlanetService);
}

async function scan(service: ScanHandlerService, ship: ShipState, args: string[]): Promise<string> {
  const ctx: CommandContext = {};
  const r = await (service.command.handler(ship, args, ctx) as Promise<{ lines: { text: string }[] }>);
  return r.lines.map((l) => l.text).join('\n');
}

describe('sca pl — non-owner reconnaissance block (GECMDS.C:2377-2448)', () => {
  const scout = makeShip({ userid: 'alice' });

  it('reports population band, stockpiles and fighter presence', async () => {
    // men+troops = 3000 → "Lightly" (>=2500, <10000) — GECMDS.C:2383-2386
    // missiles 30 → Moderate; torps 0 → No; flux 200 → Large; food 10 → Small
    const planet = makePlanetState({
      [I_MEN]: 2000n, [I_TROOPS]: 1000n,
      [I_MISSL]: 30n, [I_TORP]: 0n, [I_FLUX]: 200n, [I_FOOD]: 10n,
      [I_FIGHTER]: 5n,
    });
    const text = await scan(makeService(planet), scout, ['pl', '1']);

    expect(text).toContain('Lightly Populated');
    expect(text).toContain('Moderate stockpile of missiles');
    expect(text).toContain('No stockpile of torpedoes.');
    expect(text).toContain('Large stockpile of fluxpods.');
    expect(text).toContain('Small stockpile of food.');
    expect(text).toContain('There are indications of fighters.');
  });

  it('says fighters are absent when there are none', async () => {
    const planet = makePlanetState({ [I_MEN]: 0n, [I_TROOPS]: 0n, [I_FIGHTER]: 0n });
    const text = await scan(makeService(planet), scout, ['pl', '1']);
    expect(text).toContain('Not Populated');
    expect(text).toContain('No sign of fighters anywhere.');
  });

  it('walks every population band', async () => {
    const bands: [bigint, string][] = [
      [0n, 'Not'],
      [2499n, 'Sparsly'],
      [2500n, 'Lightly'],
      [9999n, 'Lightly'],
      [10000n, 'Moderatly'],
      [99999n, 'Moderatly'],
      [100000n, 'Widely'],
      [999999n, 'Widely'],
      [1000000n, 'Heavily'],
    ];
    for (const [men, word] of bands) {
      const text = await scan(makeService(makePlanetState({ [I_MEN]: men })), scout, ['pl', '1']);
      expect(text).toContain(`${word} Populated`);
    }
  });

  it('walks every stockpile band', async () => {
    const bands: [bigint, string][] = [[0n, 'No'], [24n, 'Small'], [25n, 'Moderate'], [99n, 'Moderate'], [100n, 'Large']];
    for (const [qty, word] of bands) {
      const text = await scan(makeService(makePlanetState({ [I_MISSL]: qty })), scout, ['pl', '1']);
      expect(text).toContain(`${word} stockpile of missiles`);
    }
  });

  it('does not show the recon block to the planet owner — the owner sees the item list', async () => {
    const planet = makePlanetState({ [I_MEN]: 5000n, [I_MISSL]: 40n });
    const text = await scan(makeService(planet), makeShip({ userid: 'bob' }), ['pl', '1']);
    expect(text).not.toContain('Populated');
    expect(text).toContain('Men');
  });
});

describe('sca pl <n> — wormhole branch (GECMDS.C:2455-2468)', () => {
  const worm = {
    xsect: 10, ysect: 7, plnum: 2, type: 2,
    xcoord: 10.6, ycoord: 7.6, visible: 1,
    destXcoord: 3.5, destYcoord: 4.5, name: 'Sagan Rift',
  };

  it('scans a wormhole slot, naming it and giving bearing and distance', async () => {
    const service = makeService(makePlanetState(), [worm]);
    const text = await scan(service, makeShip({ userid: 'alice' }), ['pl', '2']);
    expect(text).toContain('Object Class: Wormhole');
    expect(text).toContain('Named: Sagan Rift');
    expect(text).toMatch(/Bearing:\s*-?\d+/);
    expect(text).toMatch(/Distance:\s*\d+/);
  });

  it('omits the name line for an unnamed wormhole', async () => {
    const service = makeService(makePlanetState(), [{ ...worm, name: '' }]);
    const text = await scan(service, makeShip({ userid: 'alice' }), ['pl', '2']);
    expect(text).toContain('Object Class: Wormhole');
    expect(text).not.toContain('Named:');
  });
});

describe('sca pl (no argument) — the sector listing', () => {
  it('lists visible wormholes alongside planets so their slot number is usable', async () => {
    const service = makeService(makePlanetState(), [
      { xsect: 10, ysect: 7, plnum: 2, name: 'Sagan Rift', visible: 1 },
    ]);
    const text = await scan(service, makeShip({ userid: 'alice' }), ['pl']);
    expect(text).toContain('Fort Bob');
    expect(text).toContain('2. Sagan Rift — wormhole');
  });
});
