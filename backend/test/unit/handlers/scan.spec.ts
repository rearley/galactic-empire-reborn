import { CommandResult } from '../../../src/game/commands/command.types';
import { ScanHandlerService } from '../../../src/game/commands/handlers/scan.handler';
import { ShipStateService } from '../../../src/game/ship/ship-state.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { GalaxyService } from '../../../src/game/galaxy/galaxy.service';
import { PlanetStateService } from '../../../src/game/planet/planet-state.service';
import { SCAN_GRID_WIDTH, SCAN_GRID_HEIGHT } from '../../../src/game/constants';
import { ShipState } from '../../../src/game/ship/ship-state.types';
import { formatMessage, MessageId } from '../../../src/game/commands/messages';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'Test', shpclass: 1,
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
    dirty: false,
    ...overrides,
  };
}

const defaultGalaxyMock = {
  getSectorPlanets: jest.fn().mockReturnValue([]),
  getSectorWormholes: jest.fn().mockReturnValue([]),
  findPlanetByName: jest.fn().mockReturnValue(null),
  getMeta: jest.fn(),
  onModuleInit: jest.fn(),
};

function makeService(ships: ShipState[], scanRange = 5000, galaxyMock = defaultGalaxyMock) {
  const shipServiceMock = {
    findAllShips: jest.fn().mockReturnValue(ships),
    findByName: jest.fn().mockReturnValue(undefined),
    findByUserid: jest.fn().mockReturnValue([]),
  };
  const prismaMock = {
    shipClass: {
      findMany: jest.fn().mockResolvedValue([{ classNumber: 1, scanRange }]),
    },
  };
  const planetServiceMock = { get: jest.fn().mockReturnValue(undefined) };
  const service = new ScanHandlerService(
    shipServiceMock as unknown as ShipStateService,
    prismaMock as unknown as PrismaService,
    galaxyMock as unknown as GalaxyService,
    planetServiceMock as unknown as PlanetStateService,
  );
  return { service, shipServiceMock, prismaMock, galaxyMock };
}

describe('ScanHandlerService', () => {
  describe('scan lo — empty range', () => {
    it('returns scanGrid with only the self-cell when no ships in range', async () => {
      const { service } = makeService([]);
      await service.onModuleInit();
      const ship = makeShip();
      const result = service.command.handler(ship, ['lo'], {}) as CommandResult;
      expect(result.scanGrid).toBeDefined();
      expect(result.scanGrid!.length).toBe(1);
      const selfCell = result.scanGrid![0];
      expect(selfCell.x).toBe(Math.floor(SCAN_GRID_WIDTH / 2));
      expect(selfCell.y).toBe(Math.floor(SCAN_GRID_HEIGHT / 2));
      expect(selfCell.type).toBe('self');
      expect(selfCell.char).toBe('*');
    });
  });

  describe('scan lo — ship in range', () => {
    it('AI ship (status=1) at projected cell appears with char "+"', async () => {
      const playerShip = makeShip({ userid: 'u1', shipno: 1, xcoord: 0, ycoord: 0 });
      const aiShip = makeShip({ userid: 'u2', shipno: 1, xcoord: 0.1, ycoord: 0, status: 1 });
      const { service } = makeService([playerShip, aiShip]);
      await service.onModuleInit();
      const result = service.command.handler(playerShip, ['lo'], {}) as CommandResult;
      const aiCell = result.scanGrid!.find(c => c.type === 'ship');
      expect(aiCell).toBeDefined();
      expect(aiCell!.char).toBe('+');
    });

    it('manual ship (status=0) appears with char "="', async () => {
      const playerShip = makeShip({ userid: 'u1', shipno: 1, xcoord: 0, ycoord: 0 });
      const manualShip = makeShip({ userid: 'u2', shipno: 1, xcoord: 0.1, ycoord: 0, status: 0 });
      const { service } = makeService([playerShip, manualShip]);
      await service.onModuleInit();
      const result = service.command.handler(playerShip, ['lo'], {}) as CommandResult;
      const shipCell = result.scanGrid!.find(c => c.type === 'ship');
      expect(shipCell!.char).toBe('=');
    });

    it('self ship is excluded from ship cells', async () => {
      const ship = makeShip({ userid: 'u1', shipno: 1 });
      const { service } = makeService([ship]);
      await service.onModuleInit();
      const result = service.command.handler(ship, ['lo'], {}) as CommandResult;
      const selfCells = result.scanGrid!.filter(c => c.type === 'self');
      expect(selfCells).toHaveLength(1);
      const shipCells = result.scanGrid!.filter(c => c.type === 'ship');
      expect(shipCells).toHaveLength(0);
    });

    it('out-of-range ship is dropped from scanGrid', async () => {
      const playerShip = makeShip({ userid: 'u1', shipno: 1, xcoord: 0, ycoord: 0 });
      // Very far away — will be off-grid
      const farShip = makeShip({ userid: 'u2', shipno: 1, xcoord: 9999, ycoord: 9999, status: 0 });
      const { service } = makeService([playerShip, farShip], 100); // tiny scan range
      await service.onModuleInit();
      const result = service.command.handler(playerShip, ['lo'], {}) as CommandResult;
      expect(result.scanGrid!.filter(c => c.type === 'ship')).toHaveLength(0);
    });
  });

  describe('bare scan (no sub-keyword) dispatches as scan lo', () => {
    it('bare scan returns scanGrid', async () => {
      const { service } = makeService([]);
      await service.onModuleInit();
      const ship = makeShip();
      const resultLo = service.command.handler(ship, ['lo'], {}) as CommandResult;
      const resultBare = service.command.handler(ship, [], {}) as CommandResult;
      // Both should return a scanGrid with just the self-cell
      expect(resultBare.scanGrid).toBeDefined();
      expect(resultBare.scanGrid!.length).toBe(resultLo.scanGrid!.length);
    });
  });

  describe('scan sh', () => {
    it('returns text-only result (no scanGrid field)', async () => {
      const { service, shipServiceMock } = makeService([]);
      await service.onModuleInit();
      const ship = makeShip();
      shipServiceMock.findByName.mockReturnValue(makeShip({ shipname: 'USS Target' }));
      const result = service.command.handler(ship, ['sh', 'USS', 'Target'], {}) as CommandResult;
      expect(result.scanGrid).toBeUndefined();
      expect(result.lines.length).toBeGreaterThan(0);
    });

    it('missing name arg returns SCANFMT', async () => {
      const { service } = makeService([]);
      await service.onModuleInit();
      const result = service.command.handler(makeShip(), ['sh'], {}) as CommandResult;
      expect(result.lines[0].text).toBe(formatMessage(MessageId.SCANFMT));
      expect(result.scanGrid).toBeUndefined();
    });
  });

  describe('scan pl', () => {
    it('returns text-only result (no scanGrid field)', async () => {
      const { service } = makeService([]);
      await service.onModuleInit();
      const result = service.command.handler(makeShip(), ['pl', 'Earth'], {}) as CommandResult;
      expect(result.scanGrid).toBeUndefined();
    });
  });

  describe('unknown sub-keyword', () => {
    it('returns SCANFMT', async () => {
      const { service } = makeService([]);
      await service.onModuleInit();
      const result = service.command.handler(makeShip(), ['xyz'], {}) as CommandResult;
      expect(result.lines[0].text).toBe(formatMessage(MessageId.SCANFMT));
    });
  });

  describe('keyword and alias', () => {
    it('keyword is "scan", alias includes "sc"', async () => {
      const { service } = makeService([]);
      await service.onModuleInit();
      expect(service.command.keyword).toBe('scan');
      expect(service.command.aliases).toContain('sc');
    });
  });
});

// ─── T022 / T023: GalaxyService wire-up tests (RED until T027+T029) ──────────

/**
 * Factory variant that passes a GalaxyService mock as the 3rd constructor arg.
 * The `as unknown` casts keep TypeScript happy before the constructor signature
 * is updated in T027.  Jest/ts-jest transpiles without strict arity checks so
 * the tests compile and run; they are RED because ScanHandlerService does not
 * yet use the 3rd arg.
 */
function makeServiceWithGalaxy(
  ships: ShipState[],
  galaxyMock: Partial<{
    getSectorPlanets: jest.Mock;
    getSectorWormholes: jest.Mock;
    findPlanetByName: jest.Mock;
  }>,
  scanRange = 5000,
) {
  const shipServiceMock = {
    findAllShips: jest.fn().mockReturnValue(ships),
    findByName: jest.fn().mockReturnValue(undefined),
    findByUserid: jest.fn().mockReturnValue([]),
  };
  const prismaMock = {
    shipClass: {
      findMany: jest.fn().mockResolvedValue([{ classNumber: 1, scanRange }]),
    },
  };
  const fullGalaxyMock = {
    getSectorPlanets: jest.fn().mockReturnValue([]),
    getSectorWormholes: jest.fn().mockReturnValue([]),
    findPlanetByName: jest.fn().mockReturnValue(null),
    ...galaxyMock,
  };
  const planetServiceMock = { get: jest.fn().mockReturnValue(undefined) };
  const service = new ScanHandlerService(
    shipServiceMock as unknown as ShipStateService,
    prismaMock as unknown as PrismaService,
    fullGalaxyMock as unknown as GalaxyService,
    planetServiceMock as unknown as PlanetStateService,
  );
  return { service, shipServiceMock, prismaMock, galaxyMock: fullGalaxyMock };
}

/** Minimal Planet stub — only the fields that projectRangeCell and scanPl need. */
function makePlanet(overrides: Partial<{
  xsect: number; ysect: number; plnum: number; type: number;
  xcoord: number; ycoord: number; name: string;
  userid: string | null; enviorn: number; resource: number;
}> = {}): any {
  return {
    xsect: 0, ysect: 0, plnum: 1, type: 2,
    xcoord: 0.1, ycoord: 0.1, name: 'Zygor-3',
    userid: null, enviorn: 0, resource: 2,
    cash: BigInt(0), debt: BigInt(0), tax: BigInt(0),
    taxrate: 0, warnings: 0, password: 'none',
    lastattack: '', beacon: '', spyowner: '',
    technology: 0, teamcode: BigInt(0),
    itemsQty: [], itemsRate: [], itemsSell: [],
    itemsReserve: [], itemsMarkup2a: [], itemsSold2a: [],
    ...overrides,
  };
}

/** Minimal Wormhole stub. */
function makeWormhole(overrides: Partial<{
  xsect: number; ysect: number; plnum: number; type: number;
  xcoord: number; ycoord: number; visible: number;
  destXcoord: number; destYcoord: number; name: string;
}> = {}): any {
  return {
    xsect: 0, ysect: 0, plnum: 1, type: 3,
    xcoord: 0.2, ycoord: 0.2, visible: 1,
    destXcoord: 5.5, destYcoord: 3.5, name: '',
    ...overrides,
  };
}

// T022 — planet/wormhole projection in scan lo
describe('T022 — scan lo: planet/wormhole projection (RED until T027+T029)', () => {
  describe('planet-only sector', () => {
    it('planet in range appears in scanGrid with type "planet" and char "O"', async () => {
      const planet = makePlanet({ xcoord: 0.1, ycoord: 0.1 });
      const { service } = makeServiceWithGalaxy(
        [],
        { getSectorPlanets: jest.fn().mockReturnValue([planet]), getSectorWormholes: jest.fn().mockReturnValue([]) },
      );
      await service.onModuleInit();
      const ship = makeShip({ xcoord: 0, ycoord: 0 });
      const result = service.command.handler(ship, ['lo'], {}) as CommandResult;
      const planetCell = result.scanGrid!.find(c => c.type === 'planet');
      expect(planetCell).toBeDefined();
      expect(planetCell!.char).toBe('O');
    });
  });

  describe('wormhole-only sector', () => {
    it('visible wormhole (visible=1) in range appears with type "wormhole" and char "W"', async () => {
      const wormhole = makeWormhole({ xcoord: 0.2, ycoord: 0.2, visible: 1 });
      const { service } = makeServiceWithGalaxy(
        [],
        { getSectorPlanets: jest.fn().mockReturnValue([]), getSectorWormholes: jest.fn().mockReturnValue([wormhole]) },
      );
      await service.onModuleInit();
      const ship = makeShip({ xcoord: 0, ycoord: 0 });
      const result = service.command.handler(ship, ['lo'], {}) as CommandResult;
      const wormholeCell = result.scanGrid!.find(c => c.type === 'wormhole');
      expect(wormholeCell).toBeDefined();
      expect(wormholeCell!.char).toBe('W');
    });
  });

  describe('planet + ship + self', () => {
    it('scanGrid contains planet, ship, and self cells simultaneously', async () => {
      const planet = makePlanet({ xcoord: 0.1, ycoord: 0.1 });
      const playerShip = makeShip({ userid: 'u1', shipno: 1, xcoord: 0, ycoord: 0 });
      const otherShip = makeShip({ userid: 'u2', shipno: 2, xcoord: 0.1, ycoord: 0, status: 0 });
      const { service } = makeServiceWithGalaxy(
        [playerShip, otherShip],
        { getSectorPlanets: jest.fn().mockReturnValue([planet]), getSectorWormholes: jest.fn().mockReturnValue([]) },
      );
      await service.onModuleInit();
      const result = service.command.handler(playerShip, ['lo'], {}) as CommandResult;
      expect(result.scanGrid!.some(c => c.type === 'planet')).toBe(true);
      expect(result.scanGrid!.some(c => c.type === 'ship')).toBe(true);
      expect(result.scanGrid!.some(c => c.type === 'self')).toBe(true);
    });
  });

  describe('hidden wormhole (visible=0)', () => {
    it('wormhole with visible=0 is omitted from scanGrid', async () => {
      const wormhole = makeWormhole({ xcoord: 0.2, ycoord: 0.2, visible: 0 });
      const { service } = makeServiceWithGalaxy(
        [],
        { getSectorPlanets: jest.fn().mockReturnValue([]), getSectorWormholes: jest.fn().mockReturnValue([wormhole]) },
      );
      await service.onModuleInit();
      const ship = makeShip({ xcoord: 0, ycoord: 0 });
      const result = service.command.handler(ship, ['lo'], {}) as CommandResult;
      expect(result.scanGrid!.some(c => c.type === 'wormhole')).toBe(false);
    });
  });
});

// T049 — scan pl: beacon line visibility
describe('T049 — scan pl: beacon line', () => {
  function makeServiceWithBeacon(beaconState: { beacon: string } | null) {
    const planet = makePlanet({ xsect: 0, ysect: 0, plnum: 1, name: 'BeaconWorld' });
    const shipServiceMock = {
      findAllShips: jest.fn().mockReturnValue([]),
      findByName: jest.fn().mockReturnValue(undefined),
      findByUserid: jest.fn().mockReturnValue([]),
    };
    const prismaMock = {
      shipClass: {
        findMany: jest.fn().mockResolvedValue([{ classNumber: 1, scanRange: 5000 }]),
      },
    };
    const galaxyMock = {
      getSectorPlanets: jest.fn().mockReturnValue([]),
      getSectorWormholes: jest.fn().mockReturnValue([]),
      findPlanetByName: jest.fn().mockReturnValue(planet),
    };
    const planetServiceMock = { get: jest.fn().mockReturnValue(beaconState) };
    const service = new ScanHandlerService(
      shipServiceMock as unknown as ShipStateService,
      prismaMock as unknown as PrismaService,
      galaxyMock as unknown as GalaxyService,
      planetServiceMock as unknown as PlanetStateService,
    );
    return { service };
  }

  it('shows SCAN_BEACON line when beacon is non-empty', async () => {
    const { service } = makeServiceWithBeacon({ beacon: 'Welcome traders!' });
    await service.onModuleInit();
    const result = service.command.handler(makeShip(), ['pl', 'BeaconWorld'], {}) as CommandResult;
    expect(result.lines.some(l => l.text.includes('Welcome traders!'))).toBe(true);
  });

  it('omits SCAN_BEACON line when beacon is empty string', async () => {
    const { service } = makeServiceWithBeacon({ beacon: '' });
    await service.onModuleInit();
    const result = service.command.handler(makeShip(), ['pl', 'BeaconWorld'], {}) as CommandResult;
    expect(result.lines.some(l => l.text.includes('broadcasts'))).toBe(false);
  });

  it('omits SCAN_BEACON line when planet has no in-memory state', async () => {
    const { service } = makeServiceWithBeacon(null);
    await service.onModuleInit();
    const result = service.command.handler(makeShip(), ['pl', 'BeaconWorld'], {}) as CommandResult;
    expect(result.lines.some(l => l.text.includes('broadcasts'))).toBe(false);
  });
});

// T023 — scan pl <name> with GalaxyService lookup
describe('T023 — scan pl: planet name lookup (RED until T027+T029)', () => {
  it('scan pl <name> for an existing planet in a different sector returns status block with sector location', async () => {
    // Planet is in sector (5, 3) — different from ship at sector (0,0) → location line emitted
    const planet = makePlanet({ xsect: 5, ysect: 3, plnum: 1, name: 'Zygor-3', xcoord: 5.1, ycoord: 3.1 });
    const { service } = makeServiceWithGalaxy(
      [],
      { findPlanetByName: jest.fn().mockReturnValue(planet) },
    );
    await service.onModuleInit();
    const result = service.command.handler(makeShip(), ['pl', 'Zygor-3'], {}) as CommandResult;
    const texts = result.lines.map(l => l.text);
    // SCAN08: "Planet #1: Zygor-3"
    expect(texts.some(t => t.includes('Zygor-3'))).toBe(true);
    // SCAN_DASHES separator
    expect(texts.some(t => t.startsWith('-'))).toBe(true);
    // SCAN_LOCATED_IN: "Located in sector (5,3)."
    expect(texts.some(t => t.includes('(5') && t.includes('3)'))).toBe(true);
    // No scanGrid — scan pl is text-only
    expect(result.scanGrid).toBeUndefined();
  });

  it('scan pl NOTAPLANET returns NO_SUCH_PLANET message', async () => {
    const { service } = makeServiceWithGalaxy(
      [],
      { findPlanetByName: jest.fn().mockReturnValue(null) },
    );
    await service.onModuleInit();
    const result = service.command.handler(makeShip(), ['pl', 'NOTAPLANET'], {}) as CommandResult;
    expect(result.lines[0].text).toBe('No planet by that name.');
  });

  it('scan pl (no args) returns SCANFMT', async () => {
    const { service } = makeServiceWithGalaxy([], {});
    await service.onModuleInit();
    const result = service.command.handler(makeShip(), ['pl'], {}) as CommandResult;
    expect(result.lines[0].text).toBe(formatMessage(MessageId.SCANFMT));
  });
});
