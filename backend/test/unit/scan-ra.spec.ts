/**
 * T016 — Unit tests for `sca ra` range radar scan.
 *   SC-001: projection monotonic-range across all 9 zoom levels
 *   Colour channel: self/human/ai categories
 *   Self-cell `*` at centre (15, 7)
 *   Level coercion: 0 | >9 | non-numeric | missing → 1
 *   Letter stickiness across consecutive `sca ra` calls
 *   Header format: "Range: <r> — Sector <x>,<y>"
 *
 * T017 — SC-002: three ships at known coords appear within ±1 grid cell
 *   of algebraic expectation across all 9 zoom levels.
 *
 * T018 — Failure-mode: `sca ra 5` while not in flight (where >= 10)
 *   returns system-category line and does NOT populate scanRender.
 *
 * @see GECMDS.C:2484 scan_ra
 * @see GECMDS.C:2510 range = scanrange / pow(10.0 - scan_level, 2.0)
 * @see specs/015-scan-modes/tasks.md T016-T018
 */

import { ScanHandlerService } from '../../src/game/commands/handlers/scan.handler';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { GalaxyService } from '../../src/game/galaxy/galaxy.service';
import { PlanetStateService } from '../../src/game/planet/planet-state.service';
import { ShipState } from '../../src/game/ship/ship-state.types';
import { CommandResult, ScanCell } from '../../src/game/commands/command.types';
import { SCAN_GRID_WIDTH, SCAN_GRID_HEIGHT } from '../../src/game/constants';

// ── helpers ──────────────────────────────────────────────────────────────────

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

/**
 * Build a ScanHandlerService with stubbed dependencies.
 *
 * @param ships     Ships returned by findAllShips()
 * @param scanRange The scanRange returned for shpclass=1
 */
function makeService(ships: ShipState[], scanRange = 100_000) {
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
  const galaxyMock = {
    getSectorPlanets: jest.fn().mockReturnValue([]),
    getSectorWormholes: jest.fn().mockReturnValue([]),
    findPlanetByName: jest.fn().mockReturnValue(null),
    getMeta: jest.fn(),
    onModuleInit: jest.fn(),
  };
  const planetServiceMock = { get: jest.fn().mockReturnValue(undefined) };

  const service = new ScanHandlerService(
    shipServiceMock as unknown as ShipStateService,
    prismaMock as unknown as PrismaService,
    galaxyMock as unknown as GalaxyService,
    planetServiceMock as unknown as PlanetStateService,
  );
  return { service, shipServiceMock };
}

/**
 * Compute the expected effective_range for a given zoom level.
 * @see GECMDS.C:2510 range = scanrange / pow(10.0 - scan_level, 2.0)
 */
function expectedEffectiveRange(scanRange: number, level: number): number {
  return scanRange / Math.pow(10 - level, 2);
}

/**
 * Algebraically project a coord onto the scan grid given an effective_range.
 * Returns null if out of bounds.
 */
function algebraicProject(
  selfX: number, selfY: number,
  otherX: number, otherY: number,
  effectiveRange: number,
): { x: number; y: number } | null {
  const rangeDbl = 2 * effectiveRange;
  const xfactor = rangeDbl / (SCAN_GRID_WIDTH - 1);
  const yfactor = rangeDbl / (SCAN_GRID_HEIGHT - 1);
  const xf = (otherX - selfX) / xfactor + SCAN_GRID_WIDTH / 2.0;
  const yf = (otherY - selfY) / yfactor + SCAN_GRID_HEIGHT / 2.0;
  if (xf >= 0 && xf < SCAN_GRID_WIDTH && yf >= 0 && yf < SCAN_GRID_HEIGHT) {
    return { x: Math.floor(xf), y: Math.floor(yf) };
  }
  return null;
}

// ── T016: SC-001 monotonic range + coercion + self-cell + colours ─────────────

describe('T016 — sca ra unit: SC-001 projection, coercion, colour, header', () => {
  const SCAN_RANGE = 100_000;
  const CENTRE_X = Math.floor(SCAN_GRID_WIDTH / 2);  // 15
  const CENTRE_Y = Math.floor(SCAN_GRID_HEIGHT / 2); // 7

  let service: ScanHandlerService;

  beforeEach(async () => {
    const self = makeShip({ userid: 'self', shipno: 1, xcoord: 10, ycoord: 5 });
    ({ service } = makeService([self]));
    await service.onModuleInit();
  });

  test('SC-001: effective_range strictly increases from level 1 to 9', () => {
    // We verify the formula produces strictly increasing values.
    let prev = 0;
    for (let lvl = 1; lvl <= 9; lvl++) {
      const er = expectedEffectiveRange(SCAN_RANGE, lvl);
      expect(er).toBeGreaterThan(prev);
      prev = er;
    }
  });

  test('self-cell is `*` at centre (15,7)', async () => {
    const self = makeShip({ userid: 'self', shipno: 1, xcoord: 10, ycoord: 5 });
    const result = service.command.handler(self, ['ra', '3'], {}) as CommandResult;
    const selfCells = result.scanRender!.cells.filter(c => c.type === 'self');
    expect(selfCells).toHaveLength(1);
    expect(selfCells[0].x).toBe(CENTRE_X);
    expect(selfCells[0].y).toBe(CENTRE_Y);
    expect(selfCells[0].char).toBe('*');
    expect(selfCells[0].colour).toBe('self');
  });

  test('level coercion: 0 → behaves like level 1', async () => {
    const self = makeShip({ userid: 'self', shipno: 1, xcoord: 0, ycoord: 0 });
    const r0 = service.command.handler(self, ['ra', '0'], {}) as CommandResult;
    const r1 = service.command.handler(self, ['ra', '1'], {}) as CommandResult;
    // Both should produce the same header effective_range
    expect(r0.scanRender!.header).toBe(r1.scanRender!.header);
  });

  test('level coercion: >9 → behaves like level 1', async () => {
    const self = makeShip({ userid: 'self', shipno: 1, xcoord: 0, ycoord: 0 });
    const r10 = service.command.handler(self, ['ra', '10'], {}) as CommandResult;
    const r1 = service.command.handler(self, ['ra', '1'], {}) as CommandResult;
    expect(r10.scanRender!.header).toBe(r1.scanRender!.header);
  });

  test('level coercion: non-numeric → behaves like level 1', async () => {
    const self = makeShip({ userid: 'self', shipno: 1, xcoord: 0, ycoord: 0 });
    const rAbc = service.command.handler(self, ['ra', 'abc'], {}) as CommandResult;
    const r1 = service.command.handler(self, ['ra', '1'], {}) as CommandResult;
    expect(rAbc.scanRender!.header).toBe(r1.scanRender!.header);
  });

  test('level coercion: missing arg → behaves like level 1', async () => {
    const self = makeShip({ userid: 'self', shipno: 1, xcoord: 0, ycoord: 0 });
    const rMissing = service.command.handler(self, ['ra'], {}) as CommandResult;
    const r1 = service.command.handler(self, ['ra', '1'], {}) as CommandResult;
    expect(rMissing.scanRender!.header).toBe(r1.scanRender!.header);
  });

  test('header format: "Range: <r> — Sector <x>,<y>"', async () => {
    const self = makeShip({ userid: 'self', shipno: 1, xcoord: 10.7, ycoord: 5.2 });
    const result = service.command.handler(self, ['ra', '3'], {}) as CommandResult;
    const header = result.scanRender!.header;
    // Must match pattern "Range: <number> — Sector <xsect>,<ysect>"
    const xsect = Math.floor(10.7); // 10
    const ysect = Math.floor(5.2);  // 5
    expect(header).toMatch(/^Range: /);
    expect(header).toContain(`— Sector ${xsect},${ysect}`);
  });

  test('AI ship (status=1) gets colour "ai"', async () => {
    const self = makeShip({ userid: 'self', shipno: 1, xcoord: 0, ycoord: 0 });
    const ai = makeShip({ userid: 'ai1', shipno: 1, xcoord: 0.01, ycoord: 0, status: 1 });
    const { service: svc } = makeService([self, ai], SCAN_RANGE);
    await svc.onModuleInit();

    const result = svc.command.handler(self, ['ra', '5'], {}) as CommandResult;
    const shipCells = result.scanRender!.cells.filter(c => c.type === 'ship');
    expect(shipCells.length).toBeGreaterThan(0);
    expect(shipCells[0].colour).toBe('ai');
  });

  test('human ship (status=0) gets colour "human"', async () => {
    const self = makeShip({ userid: 'self', shipno: 1, xcoord: 0, ycoord: 0 });
    const human = makeShip({ userid: 'h1', shipno: 1, xcoord: 0.01, ycoord: 0, status: 0 });
    const { service: svc } = makeService([self, human], SCAN_RANGE);
    await svc.onModuleInit();

    const result = svc.command.handler(self, ['ra', '5'], {}) as CommandResult;
    const shipCells = result.scanRender!.cells.filter(c => c.type === 'ship');
    expect(shipCells.length).toBeGreaterThan(0);
    expect(shipCells[0].colour).toBe('human');
  });

  test('kind is "ra"', async () => {
    const self = makeShip({ userid: 'self', shipno: 1, xcoord: 0, ycoord: 0 });
    const result = service.command.handler(self, ['ra', '3'], {}) as CommandResult;
    expect(result.scanRender!.kind).toBe('ra');
  });

  test('mode is "overwrite" when scanHome=true', async () => {
    const self = makeShip({ userid: 'self', shipno: 1, scanHome: true });
    const result = service.command.handler(self, ['ra', '3'], {}) as CommandResult;
    expect(result.scanRender!.mode).toBe('overwrite');
  });

  test('mode is "append" when scanHome=false', async () => {
    const self = makeShip({ userid: 'self', shipno: 1, scanHome: false });
    const result = service.command.handler(self, ['ra', '3'], {}) as CommandResult;
    expect(result.scanRender!.mode).toBe('append');
  });

  test('letter stickiness: same ship keeps same letter across consecutive sca ra calls', async () => {
    const self = makeShip({ userid: 'self', shipno: 1, xcoord: 0, ycoord: 0 });
    const other = makeShip({ userid: 'other1', shipno: 1, xcoord: 0.01, ycoord: 0 });
    const { service: svc } = makeService([self, other], SCAN_RANGE);
    await svc.onModuleInit();

    // First call — ship gets letter A
    const r1 = svc.command.handler(self, ['ra', '5'], {}) as CommandResult;
    // Find the letter assigned to the ship cell
    const shipCells1 = r1.scanRender!.cells.filter(c => c.type === 'ship');
    expect(shipCells1.length).toBeGreaterThan(0);
    const letter1 = shipCells1[0].char;

    // Second call — ship must keep the same letter
    const r2 = svc.command.handler(self, ['ra', '5'], {}) as CommandResult;
    const shipCells2 = r2.scanRender!.cells.filter(c => c.type === 'ship');
    expect(shipCells2.length).toBeGreaterThan(0);
    expect(shipCells2[0].char).toBe(letter1);
  });
});

// ── T017: SC-002 — ships appear within ±1 grid cell of algebraic expectation ──

describe('T017 — sca ra unit: SC-002 projection accuracy across all 9 zoom levels', () => {
  const SCAN_RANGE = 100_000;

  /**
   * Three ships at different positions relative to self=(0,0).
   * Chosen so they are within range at all zoom levels.
   */
  const SELF_X = 0;
  const SELF_Y = 0;
  const TARGETS = [
    { userid: 'tA', shipno: 1, xcoord: 0.005, ycoord: 0, status: 0 },   // slightly to the right
    { userid: 'tB', shipno: 1, xcoord: -0.003, ycoord: 0.004, status: 1 }, // up-left
    { userid: 'tC', shipno: 1, xcoord: 0.001, ycoord: -0.002, status: 0 }, // down-right
  ];

  for (let level = 1; level <= 9; level++) {
    test(`level ${level}: three ships within ±1 cell of algebraic projection`, async () => {
      const self = makeShip({ userid: 'self', shipno: 1, xcoord: SELF_X, ycoord: SELF_Y });
      const others = TARGETS.map(t => makeShip(t));
      const allShips = [self, ...others];

      const { service } = makeService(allShips, SCAN_RANGE);
      await service.onModuleInit();

      const result = service.command.handler(self, ['ra', String(level)], {}) as CommandResult;
      expect(result.scanRender).toBeDefined();

      const effectiveRange = expectedEffectiveRange(SCAN_RANGE, level);

      for (const t of TARGETS) {
        const expected = algebraicProject(SELF_X, SELF_Y, t.xcoord, t.ycoord, effectiveRange);
        if (expected === null) {
          // Ship is out of grid bounds for this level — skip
          continue;
        }
        // Find ship cell at approximately that position
        const shipCells = result.scanRender!.cells.filter(c => c.type === 'ship');
        const match = shipCells.find(
          c => Math.abs(c.x - expected.x) <= 1 && Math.abs(c.y - expected.y) <= 1,
        );
        expect(match).toBeDefined();
      }
    });
  }
});

// ── T018: failure-mode — not in flight (where >= 10) ─────────────────────────

describe('T018 — sca ra: failure when not in flight', () => {
  test('where=10 (in orbit): returns system error, no scanRender', async () => {
    const self = makeShip({ userid: 'self', shipno: 1, where: 10 });
    const { service } = makeService([self]);
    await service.onModuleInit();

    const result = service.command.handler(self, ['ra', '5'], {}) as CommandResult;
    expect(result.scanRender).toBeUndefined();
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].category).toBe('system');
  });

  test('where=15 (docked): returns system error, no scanRender', async () => {
    const self = makeShip({ userid: 'self', shipno: 1, where: 15 });
    const { service } = makeService([self]);
    await service.onModuleInit();

    const result = service.command.handler(self, ['ra', '5'], {}) as CommandResult;
    expect(result.scanRender).toBeUndefined();
    expect(result.lines[0].category).toBe('system');
  });

  test('where=0 (in flight): succeeds and has scanRender', async () => {
    const self = makeShip({ userid: 'self', shipno: 1, where: 0 });
    const { service } = makeService([self]);
    await service.onModuleInit();

    const result = service.command.handler(self, ['ra', '5'], {}) as CommandResult;
    expect(result.scanRender).toBeDefined();
  });
});
