import { CommandResult } from '../../../src/game/commands/command.types';
import { MineRegistry } from '../../../src/game/combat/mine.registry';
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
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
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
  // scanPl reads the LIVE planet state now, not GalaxyService's boot-time
  // read-model, so mirror whatever this galaxy mock is serving.
  const planetServiceMock = { get: jest.fn().mockReturnValue(undefined),
    bySector: jest.fn((x: number, y: number) => galaxyMock.getSectorPlanets(x, y)),
    byName: jest.fn((n: string) => galaxyMock.findPlanetByName(n) ?? undefined) };
  const service = new ScanHandlerService(
    shipServiceMock as unknown as ShipStateService,
    prismaMock as unknown as PrismaService,
    galaxyMock as unknown as GalaxyService,
    planetServiceMock as unknown as PlanetStateService,
    new MineRegistry(),
  );
  return { service, shipServiceMock, prismaMock, galaxyMock };
}

describe('ScanHandlerService', () => {
  describe('scan lo — scanHome mode', () => {
    it('scanLo returns mode overwrite when scanHome=true', async () => {
      const { service } = makeService([]);
      await service.onModuleInit();
      const ship = makeShip({ scanHome: true });
      const result = await (service.command.handler(ship, ['lo'], {}) as Promise<CommandResult>);
      expect(result.scanRender!.mode).toBe('overwrite');
    });

    it('scanLo returns mode append when scanHome=false', async () => {
      const { service } = makeService([]);
      await service.onModuleInit();
      const ship = makeShip({ scanHome: false });
      const result = await (service.command.handler(ship, ['lo'], {}) as Promise<CommandResult>);
      expect(result.scanRender!.mode).toBe('append');
    });
  });

  describe('scan lo — empty range', () => {
    it('returns scanRender with only the self-cell when no ships in range', async () => {
      const { service } = makeService([]);
      await service.onModuleInit();
      const ship = makeShip();
      const result = await (service.command.handler(ship, ['lo'], {}) as Promise<CommandResult>);
      expect(result.scanRender).toBeDefined();
      expect(result.scanRender!.cells.length).toBe(1);
      const selfCell = result.scanRender!.cells[0];
      expect(selfCell.x).toBe(Math.floor(SCAN_GRID_WIDTH / 2));
      expect(selfCell.y).toBe(Math.floor(SCAN_GRID_HEIGHT / 2));
      expect(selfCell.type).toBe('self');
      expect(selfCell.char).toBe('*');
    });
  });

  describe('scan lo — ship in range', () => {
    /**
     * T028 — Deliberate deviation D1: `sca lo` now uses scantab letters (A..Z)
     * instead of the original '+' (AI, status=1) and '=' (manual, status=0) glyphs.
     * Tests updated to assert capital-letter chars rather than '+' / '='.
     * @see specs/015-scan-modes/plan.md §D1
     */
    it('AI ship (status=1) at projected cell appears with a scantab letter (A-Z)', async () => {
      const playerShip = makeShip({ userid: 'u1', shipno: 1, xcoord: 0, ycoord: 0 });
      const aiShip = makeShip({ userid: 'u2', shipno: 1, xcoord: 0.1, ycoord: 0, status: 1 });
      const { service } = makeService([playerShip, aiShip]);
      await service.onModuleInit();
      const result = await (service.command.handler(playerShip, ['lo'], {}) as Promise<CommandResult>);
      const aiCell = result.scanRender!.cells.find(c => c.type === 'ship');
      expect(aiCell).toBeDefined();
      expect(aiCell!.char).toMatch(/^[A-Z]$/);
    });

    it('manual ship (status=0) appears with a scantab letter (A-Z)', async () => {
      const playerShip = makeShip({ userid: 'u1', shipno: 1, xcoord: 0, ycoord: 0 });
      const manualShip = makeShip({ userid: 'u2', shipno: 1, xcoord: 0.1, ycoord: 0, status: 0 });
      const { service } = makeService([playerShip, manualShip]);
      await service.onModuleInit();
      const result = await (service.command.handler(playerShip, ['lo'], {}) as Promise<CommandResult>);
      const shipCell = result.scanRender!.cells.find(c => c.type === 'ship');
      expect(shipCell!.char).toMatch(/^[A-Z]$/);
    });

    it('self ship is excluded from ship cells', async () => {
      const ship = makeShip({ userid: 'u1', shipno: 1 });
      const { service } = makeService([ship]);
      await service.onModuleInit();
      const result = await (service.command.handler(ship, ['lo'], {}) as Promise<CommandResult>);
      const selfCells = result.scanRender!.cells.filter(c => c.type === 'self');
      expect(selfCells).toHaveLength(1);
      const shipCells = result.scanRender!.cells.filter(c => c.type === 'ship');
      expect(shipCells).toHaveLength(0);
    });

    it('out-of-range ship is dropped from scanGrid', async () => {
      const playerShip = makeShip({ userid: 'u1', shipno: 1, xcoord: 0, ycoord: 0 });
      // Very far away — will be off-grid
      const farShip = makeShip({ userid: 'u2', shipno: 1, xcoord: 9999, ycoord: 9999, status: 0 });
      const { service } = makeService([playerShip, farShip], 100); // tiny scan range
      await service.onModuleInit();
      const result = await (service.command.handler(playerShip, ['lo'], {}) as Promise<CommandResult>);
      expect(result.scanRender!.cells.filter(c => c.type === 'ship')).toHaveLength(0);
    });
  });

  describe('bare scan asks for the format (GECMDS.C:2154)', () => {
    it('does not silently run a full local scan', async () => {
      const { service } = makeService([]);
      await service.onModuleInit();
      const resultBare = await (service.command.handler(makeShip(), [], {}) as Promise<CommandResult>);
      // C prints SCANFMT; it does not pick a mode for you.
      expect(resultBare.scanRender).toBeUndefined();
      expect(resultBare.lines.length).toBeGreaterThan(0);
    });

    it('accepts the spelled-out sub-command', async () => {
      const { service } = makeService([]);
      await service.onModuleInit();
      const ship = makeShip();
      const short = await (service.command.handler(ship, ['lo'], {}) as Promise<CommandResult>);
      const long = await (service.command.handler(ship, ['local'], {}) as Promise<CommandResult>);
      expect(long.scanRender!.cells.length).toBe(short.scanRender!.cells.length);
    });
  });

  describe('scan sh', () => {
    it('returns text-only result (no scanGrid field)', async () => {
      const { service, shipServiceMock } = makeService([]);
      await service.onModuleInit();
      const ship = makeShip();
      shipServiceMock.findByName.mockReturnValue(makeShip({ shipname: 'USS Target' }));
      const result = await (service.command.handler(ship, ['sh', 'USS', 'Target'], {}) as Promise<CommandResult>);
      expect(result.scanRender).toBeUndefined();
      expect(result.lines.length).toBeGreaterThan(0);
    });

    it('missing name arg returns scan usage text', async () => {
      const { service } = makeService([]);
      await service.onModuleInit();
      const result = await (service.command.handler(makeShip(), ['sh'], {}) as Promise<CommandResult>);
      // Handler returns a short hardcoded usage string rather than the canonical
      // SCANFMT message (intentional — see scan.handler.ts:~101). If you re-route
      // to formatMessage(MessageId.SCANFMT) update this assertion to match.
      expect(result.lines[0].text).toBe('Usage: scan <mode>');
      expect(result.scanRender).toBeUndefined();
    });
  });

  describe('scan pl', () => {
    it('returns text-only result (no scanGrid field)', async () => {
      const { service } = makeService([]);
      await service.onModuleInit();
      const result = await (service.command.handler(makeShip(), ['pl', 'Earth'], {}) as Promise<CommandResult>);
      expect(result.scanRender).toBeUndefined();
    });
  });

  describe('unknown sub-keyword', () => {
    it('returns scan usage text', async () => {
      const { service } = makeService([]);
      await service.onModuleInit();
      const result = await (service.command.handler(makeShip(), ['xyz'], {}) as Promise<CommandResult>);
      expect(result.lines[0].text).toBe('Usage: scan <mode>');
    });
  });

  describe('keyword and alias', () => {
    it('keyword is "scan", alias includes the canonical "sca" but not "sc"', async () => {
      const { service } = makeService([]);
      await service.onModuleInit();
      expect(service.command.keyword).toBe('scan');
      // GECMDS.C:158 registers {"sca", cmd_scan} and gesearch matches on the
      // first 3 characters, so 'sca' and 'scan' both resolve while the 2-char
      // 'sc' does not — strncmp("sc","sca",3) compares '\0' against 'a'.
      expect(service.command.aliases).toContain('sca');
      expect(service.command.aliases).not.toContain('sc');
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
  const planetServiceMock = { get: jest.fn().mockReturnValue(undefined),
    bySector: jest.fn((x: number, y: number) => fullGalaxyMock.getSectorPlanets(x, y)),
    byName: jest.fn((n: string) => fullGalaxyMock.findPlanetByName(n) ?? undefined) };
  const service = new ScanHandlerService(
    shipServiceMock as unknown as ShipStateService,
    prismaMock as unknown as PrismaService,
    fullGalaxyMock as unknown as GalaxyService,
    planetServiceMock as unknown as PlanetStateService,
    new MineRegistry(),
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

// T022 — `sca lo` projects SHIPS ONLY
describe('T022 — sca lo projects ships only, never planets', () => {
  // `scan_lo`'s only projection loop is over ships (GECMDS.C:2686), and
  // `map_planets()` is called exactly once in the entire source — at
  // GECMDS.C:2634, inside `scan_se`, four lines before scan_lo begins.
  //
  // These cases previously asserted the opposite. In our galaxy that put
  // roughly two thousand planet cells onto a 450-cell grid: a solid wall with
  // the ship markers and the '*' self-cell buried inside it. `sca lo` is the
  // first thing the welcome text tells a new player to type.

  it('omits planets entirely', async () => {
    const planet = makePlanet({ xcoord: 0.1, ycoord: 0.1 });
    const { service } = makeServiceWithGalaxy(
      [],
      { getSectorPlanets: jest.fn().mockReturnValue([planet]), getSectorWormholes: jest.fn().mockReturnValue([]) },
    );
    await service.onModuleInit();
    const ship = makeShip({ xcoord: 0, ycoord: 0 });
    const result = await (service.command.handler(ship, ['lo'], {}) as Promise<CommandResult>);
    expect(result.scanRender!.cells.some(c => c.type === 'planet')).toBe(false);
  });

  it('omits wormholes entirely, visible or not', async () => {
    const wormhole = makeWormhole({ xcoord: 0.2, ycoord: 0.2, visible: 1 });
    const { service } = makeServiceWithGalaxy(
      [],
      { getSectorPlanets: jest.fn().mockReturnValue([]), getSectorWormholes: jest.fn().mockReturnValue([wormhole]) },
    );
    await service.onModuleInit();
    const ship = makeShip({ xcoord: 0, ycoord: 0 });
    const result = await (service.command.handler(ship, ['lo'], {}) as Promise<CommandResult>);
    expect(result.scanRender!.cells.some(c => c.type === 'wormhole')).toBe(false);
  });

  it('still shows ships and the self-cell', async () => {
    // The grid is not empty — it carries exactly what canon puts there.
    const planet = makePlanet({ xcoord: 0.1, ycoord: 0.1 });
    const { service } = makeServiceWithGalaxy(
      [],
      { getSectorPlanets: jest.fn().mockReturnValue([planet]), getSectorWormholes: jest.fn().mockReturnValue([]) },
    );
    await service.onModuleInit();
    const ship = makeShip({ xcoord: 0, ycoord: 0 });
    const result = await (service.command.handler(ship, ['lo'], {}) as Promise<CommandResult>);
    expect(result.scanRender!.cells.some(c => c.type === 'self')).toBe(true);
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
    // The live-state stub needs the fields scanPl actually reads now: the
    // non-owner reconnaissance block (GECMDS.C:2377-2448) reads `items`, so a
    // bare `{ beacon }` object is no longer a valid PlanetState stand-in.
    const liveState = beaconState === null ? null : {
      ...planet,
      ...beaconState,
      items: Array.from({ length: 14 }, () => ({
        qty: 0n, rate: 0, sell: false, reserve: 0, markup2a: 0, sold2a: 0n,
      })),
    };
    const planetServiceMock = { get: jest.fn().mockReturnValue(liveState),
      bySector: jest.fn((x: number, y: number) => galaxyMock.getSectorPlanets(x, y)),
      byName: jest.fn((n: string) => galaxyMock.findPlanetByName(n) ?? undefined) };
    const service = new ScanHandlerService(
      shipServiceMock as unknown as ShipStateService,
      prismaMock as unknown as PrismaService,
      galaxyMock as unknown as GalaxyService,
      planetServiceMock as unknown as PlanetStateService,
    new MineRegistry(),
  );
    return { service };
  }

  it('shows SCAN_BEACON line when beacon is non-empty', async () => {
    const { service } = makeServiceWithBeacon({ beacon: 'Welcome traders!' });
    await service.onModuleInit();
    const result = await (service.command.handler(makeShip(), ['pl', 'BeaconWorld'], {}) as Promise<CommandResult>);
    expect(result.lines.some(l => l.text.includes('Welcome traders!'))).toBe(true);
  });

  it('omits SCAN_BEACON line when beacon is empty string', async () => {
    const { service } = makeServiceWithBeacon({ beacon: '' });
    await service.onModuleInit();
    const result = await (service.command.handler(makeShip(), ['pl', 'BeaconWorld'], {}) as Promise<CommandResult>);
    expect(result.lines.some(l => l.text.includes('broadcasts'))).toBe(false);
  });

  it('omits SCAN_BEACON line when planet has no in-memory state', async () => {
    const { service } = makeServiceWithBeacon(null);
    await service.onModuleInit();
    const result = await (service.command.handler(makeShip(), ['pl', 'BeaconWorld'], {}) as Promise<CommandResult>);
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
    const result = await (service.command.handler(makeShip(), ['pl', 'Zygor-3'], {}) as Promise<CommandResult>);
    const texts = result.lines.map(l => l.text);
    // SCAN08: "Planet #1: Zygor-3"
    expect(texts.some(t => t.includes('Zygor-3'))).toBe(true);
    // SCAN_DASHES separator
    expect(texts.some(t => t.startsWith('-'))).toBe(true);
    // SCAN_LOCATED_IN: "Located in sector (5,3)."
    expect(texts.some(t => t.includes('(5') && t.includes('3)'))).toBe(true);
    // No scanRender — scan pl is text-only
    expect(result.scanRender).toBeUndefined();
  });

  it('scan pl NOTAPLANET returns NO_SUCH_PLANET message', async () => {
    const { service } = makeServiceWithGalaxy(
      [],
      { findPlanetByName: jest.fn().mockReturnValue(null) },
    );
    await service.onModuleInit();
    const result = await (service.command.handler(makeShip(), ['pl', 'NOTAPLANET'], {}) as Promise<CommandResult>);
    expect(result.lines[0].text).toBe('No planet by that name.');
  });

  it('scan pl (no args) returns "No planets in this sector." fallback', async () => {
    // With no planet name supplied, scan pl falls back to the current-sector
    // listing (which is empty here). Earlier behavior returned SCANFMT — now
    // the handler degrades gracefully into the no-planets branch.
    const { service } = makeServiceWithGalaxy([], {});
    await service.onModuleInit();
    const result = await (service.command.handler(makeShip(), ['pl'], {}) as Promise<CommandResult>);
    expect(result.lines[0].text).toBe('No planets in this sector.');
  });
});

// ─── S-007: Subsystem gate tests ──────────────────────────────────────────────

describe('S-007 — scan: tactical-computer gate (TABROKE)', () => {
  it('tactical !== 0 → returns TABROKE, no scanRender', async () => {
    const { service } = makeService([]);
    await service.onModuleInit();
    const ship = makeShip({ tactical: -5 });
    const result = await (service.command.handler(ship, ['lo'], {}) as Promise<CommandResult>);
    expect(result.lines[0].text).toBe(formatMessage(MessageId.TABROKE));
    expect(result.scanRender).toBeUndefined();
  });

  it('tactical = 0 → scan proceeds normally', async () => {
    const { service } = makeService([]);
    await service.onModuleInit();
    const ship = makeShip({ tactical: 0 });
    const result = await (service.command.handler(ship, ['lo'], {}) as Promise<CommandResult>);
    expect(result.scanRender).toBeDefined();
  });
});

describe('S-007 — scan: jammer gate (JAMMER4)', () => {
  it('jammer > 0 → returns JAMMER4, no scanRender', async () => {
    const { service } = makeService([]);
    await service.onModuleInit();
    const ship = makeShip({ jammer: 5 });
    const result = await (service.command.handler(ship, ['lo'], {}) as Promise<CommandResult>);
    expect(result.lines[0].text).toBe(formatMessage(MessageId.JAMMER4));
    expect(result.scanRender).toBeUndefined();
  });

  it('jammer = 0 → scan proceeds normally', async () => {
    const { service } = makeService([]);
    await service.onModuleInit();
    const ship = makeShip({ jammer: 0 });
    const result = await (service.command.handler(ship, ['lo'], {}) as Promise<CommandResult>);
    expect(result.scanRender).toBeDefined();
  });

  it('tactical gate fires before jammer gate', async () => {
    const { service } = makeService([]);
    await service.onModuleInit();
    const ship = makeShip({ tactical: -1, jammer: 5 });
    const result = await (service.command.handler(ship, ['lo'], {}) as Promise<CommandResult>);
    expect(result.lines[0].text).toBe(formatMessage(MessageId.TABROKE));
  });
});
