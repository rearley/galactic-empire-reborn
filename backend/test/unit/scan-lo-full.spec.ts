/**
 * T027 — Unit tests for `sca lo full` side-panel formatting and `sca lo`/`sca lo full`
 * not-in-flight guards.
 *
 * Covers SC-004:
 * - Side-panel row fields: letter (A–Z), distance (integer parsecs), bearing
 *   (0..359), heading (0..359), speedDisplay string, name conditional on scanNames.
 * - Rows ordered by ascending distance.
 * - SCANNAMES on → name field present on each row.
 * - SCANNAMES off → name field absent (undefined) on each row.
 * - Three fixtures covering different speed values.
 *
 * Failure-mode assertions (CRITICAL):
 * - `sca lo` while docked/dead (where >= 10) → single command:result line with
 *   category:'system', no scan:render.
 * - `sca lo full` while docked/dead (where >= 10) → same.
 *
 * @see GECMDS.C:3019 printmapfull
 * @see GECMDS.C:2640 scan_lo
 * @see specs/015-scan-modes/plan.md §T027
 */

import { CommandResult, SidePanelRow } from '../../src/game/commands/command.types';
import { ScanHandlerService } from '../../src/game/commands/handlers/scan.handler';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { GalaxyService } from '../../src/game/galaxy/galaxy.service';
import { PlanetStateService } from '../../src/game/planet/planet-state.service';
import { ShipState } from '../../src/game/ship/ship-state.types';
import { formatMessage, MessageId } from '../../src/game/commands/messages';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'Alpha', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5, ycoord: 5, damage: 0, energy: 1000,
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
    scanNames: false, scanHome: false,
    dirty: false,
    ...overrides,
  };
}

function makeService(ships: ShipState[], scanRange = 500000) {
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

// ---------------------------------------------------------------------------
// Fixture ships for SC-004 side panel tests
// speed=0 → 'Stopped', speed=500 (impulse) → 'Impulse', speed=4500 (warp 4.5) → 'Warp 4.5'
// ---------------------------------------------------------------------------

function makeOther(
  key: { userid: string; shipno: number },
  coords: { xcoord: number; ycoord: number },
  overrides: Partial<ShipState> = {},
): ShipState {
  return makeShip({ ...key, ...coords, ...overrides });
}

// ---------------------------------------------------------------------------
// T027a — failure-mode guards: sca lo while not in flight
// ---------------------------------------------------------------------------

describe('T027 — sca lo: not-in-flight guard', () => {
  it('sca lo while docked (where=10) returns system line, no scan:render', async () => {
    const { service } = makeService([]);
    await service.onModuleInit();
    const ship = makeShip({ where: 10 });
    const result = service.command.handler(ship, ['lo'], {}) as CommandResult;
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].category).toBe('system');
    expect(result.scanRender).toBeUndefined();
  });

  it('sca lo while dead (where=20) returns system line, no scan:render', async () => {
    const { service } = makeService([]);
    await service.onModuleInit();
    const ship = makeShip({ where: 20 });
    const result = service.command.handler(ship, ['lo'], {}) as CommandResult;
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].category).toBe('system');
    expect(result.scanRender).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// T027b — failure-mode guards: sca lo full while not in flight
// ---------------------------------------------------------------------------

describe('T027 — sca lo full: not-in-flight guard', () => {
  it('sca lo full while docked (where=10) returns system line, no scan:render', async () => {
    const { service } = makeService([]);
    await service.onModuleInit();
    const ship = makeShip({ where: 10 });
    const result = service.command.handler(ship, ['lo', 'full'], {}) as CommandResult;
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].category).toBe('system');
    expect(result.scanRender).toBeUndefined();
  });

  it('sca lo full while dead (where=20) returns system line, no scan:render', async () => {
    const { service } = makeService([]);
    await service.onModuleInit();
    const ship = makeShip({ where: 20 });
    const result = service.command.handler(ship, ['lo', 'full'], {}) as CommandResult;
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].category).toBe('system');
    expect(result.scanRender).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// T027c — sca lo full produces kind:'lo-full' with sidePanel
// ---------------------------------------------------------------------------

describe('T027 — sca lo full: kind and sidePanel', () => {
  it('produces kind:lo-full with a sidePanel array', async () => {
    const player = makeShip({ userid: 'u1', shipno: 1, xcoord: 5, ycoord: 5 });
    const other = makeOther(
      { userid: 'u2', shipno: 1 },
      { xcoord: 5.1, ycoord: 5 },
      { shipname: 'Ravager', speed: 0, heading: 90 },
    );
    const { service } = makeService([player, other]);
    await service.onModuleInit();
    const result = service.command.handler(player, ['lo', 'full'], {}) as CommandResult;
    expect(result.scanRender).toBeDefined();
    expect(result.scanRender!.kind).toBe('lo-full');
    expect(result.scanRender!.sidePanel).toBeDefined();
    expect(Array.isArray(result.scanRender!.sidePanel)).toBe(true);
  });

  it('sca lo full with no other ships produces empty sidePanel', async () => {
    const player = makeShip({ userid: 'u1', shipno: 1 });
    const { service } = makeService([player]);
    await service.onModuleInit();
    const result = service.command.handler(player, ['lo', 'full'], {}) as CommandResult;
    expect(result.scanRender!.sidePanel).toBeDefined();
    expect(result.scanRender!.sidePanel!).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// T027d — side panel row field correctness (SC-004)
// Three fixtures: stopped, impulse, warp
// ---------------------------------------------------------------------------

describe('T027 — sca lo full: side-panel row field correctness', () => {
  async function getRows(
    player: ShipState,
    others: ShipState[],
  ): Promise<SidePanelRow[]> {
    const { service } = makeService([player, ...others]);
    await service.onModuleInit();
    const result = service.command.handler(player, ['lo', 'full'], {}) as CommandResult;
    return result.scanRender!.sidePanel!;
  }

  it('fixture 1: stopped ship (speed=0) → speedDisplay "Stopped"', async () => {
    const player = makeShip({ userid: 'u1', shipno: 1, xcoord: 5, ycoord: 5 });
    const stopped = makeOther(
      { userid: 'u2', shipno: 1 },
      { xcoord: 5.1, ycoord: 5 },
      { speed: 0, heading: 45 },
    );
    const rows = await getRows(player, [stopped]);
    expect(rows).toHaveLength(1);
    expect(rows[0].speedDisplay).toBe('Stopped');
  });

  it('fixture 2: impulse ship (speed=500) → speedDisplay "Impulse"', async () => {
    const player = makeShip({ userid: 'u1', shipno: 1, xcoord: 5, ycoord: 5 });
    const impulseShip = makeOther(
      { userid: 'u2', shipno: 1 },
      { xcoord: 5.1, ycoord: 5 },
      { speed: 500, heading: 90 },
    );
    const rows = await getRows(player, [impulseShip]);
    expect(rows).toHaveLength(1);
    expect(rows[0].speedDisplay).toBe('Impulse');
  });

  it('fixture 3: warp ship (speed=4500) → speedDisplay "Warp 4.5"', async () => {
    const player = makeShip({ userid: 'u1', shipno: 1, xcoord: 5, ycoord: 5 });
    const warpShip = makeOther(
      { userid: 'u2', shipno: 1 },
      { xcoord: 5.1, ycoord: 5 },
      { speed: 4500, heading: 180 },
    );
    const rows = await getRows(player, [warpShip]);
    expect(rows).toHaveLength(1);
    expect(rows[0].speedDisplay).toBe('Warp 4.5');
  });

  it('row fields: distance is a non-negative integer (parsecs)', async () => {
    const player = makeShip({ userid: 'u1', shipno: 1, xcoord: 5, ycoord: 5 });
    const other = makeOther(
      { userid: 'u2', shipno: 1 },
      { xcoord: 5.2, ycoord: 5 },
      { speed: 0, heading: 90 },
    );
    const rows = await getRows(player, [other]);
    expect(rows[0].distance).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(rows[0].distance)).toBe(true);
  });

  it('row fields: bearing is integer 0..359', async () => {
    const player = makeShip({ userid: 'u1', shipno: 1, xcoord: 5, ycoord: 5 });
    const other = makeOther(
      { userid: 'u2', shipno: 1 },
      { xcoord: 5.1, ycoord: 5 },
      { heading: 45, speed: 0 },
    );
    const rows = await getRows(player, [other]);
    expect(rows[0].bearing).toBeGreaterThanOrEqual(0);
    expect(rows[0].bearing).toBeLessThanOrEqual(359);
    expect(Number.isInteger(rows[0].bearing)).toBe(true);
  });

  it('row fields: heading matches the other ship heading', async () => {
    const player = makeShip({ userid: 'u1', shipno: 1, xcoord: 5, ycoord: 5 });
    const other = makeOther(
      { userid: 'u2', shipno: 1 },
      { xcoord: 5.1, ycoord: 5 },
      { heading: 137, speed: 0 },
    );
    const rows = await getRows(player, [other]);
    expect(rows[0].heading).toBe(137);
  });

  it('row fields: letter is a single uppercase letter A-Z', async () => {
    const player = makeShip({ userid: 'u1', shipno: 1, xcoord: 5, ycoord: 5 });
    const other = makeOther(
      { userid: 'u2', shipno: 1 },
      { xcoord: 5.1, ycoord: 5 },
      { speed: 0, heading: 0 },
    );
    const rows = await getRows(player, [other]);
    expect(rows[0].letter).toMatch(/^[A-Z]$/);
  });
});

// ---------------------------------------------------------------------------
// T027e — SCANNAMES on/off controls name field presence
// ---------------------------------------------------------------------------

describe('T027 — sca lo full: SCANNAMES flag', () => {
  it('SCANNAMES on → name field present in rows', async () => {
    const player = makeShip({
      userid: 'u1', shipno: 1, xcoord: 5, ycoord: 5, scanNames: true,
    });
    const other = makeOther(
      { userid: 'u2', shipno: 1 },
      { xcoord: 5.1, ycoord: 5 },
      { shipname: 'Ravager', speed: 0, heading: 0 },
    );
    const { service } = makeService([player, other]);
    await service.onModuleInit();
    const result = service.command.handler(player, ['lo', 'full'], {}) as CommandResult;
    const rows = result.scanRender!.sidePanel!;
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Ravager');
  });

  it('SCANNAMES off → name field absent (undefined)', async () => {
    const player = makeShip({
      userid: 'u1', shipno: 1, xcoord: 5, ycoord: 5, scanNames: false,
    });
    const other = makeOther(
      { userid: 'u2', shipno: 1 },
      { xcoord: 5.1, ycoord: 5 },
      { shipname: 'Ravager', speed: 0, heading: 0 },
    );
    const { service } = makeService([player, other]);
    await service.onModuleInit();
    const result = service.command.handler(player, ['lo', 'full'], {}) as CommandResult;
    const rows = result.scanRender!.sidePanel!;
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBeUndefined();
  });

  it('SCANNAMES on with multiple ships → all rows have name field', async () => {
    const player = makeShip({
      userid: 'u1', shipno: 1, xcoord: 5, ycoord: 5, scanNames: true,
    });
    const ship2 = makeOther({ userid: 'u2', shipno: 1 }, { xcoord: 5.1, ycoord: 5 }, { shipname: 'Fury', speed: 0 });
    const ship3 = makeOther({ userid: 'u3', shipno: 1 }, { xcoord: 5.2, ycoord: 5 }, { shipname: 'Storm', speed: 1000 });
    const { service } = makeService([player, ship2, ship3]);
    await service.onModuleInit();
    const result = service.command.handler(player, ['lo', 'full'], {}) as CommandResult;
    const rows = result.scanRender!.sidePanel!;
    expect(rows).toHaveLength(2);
    rows.forEach(r => expect(typeof r.name).toBe('string'));
  });

  it('SCANNAMES off with multiple ships → all rows have name=undefined', async () => {
    const player = makeShip({
      userid: 'u1', shipno: 1, xcoord: 5, ycoord: 5, scanNames: false,
    });
    const ship2 = makeOther({ userid: 'u2', shipno: 1 }, { xcoord: 5.1, ycoord: 5 }, { shipname: 'Fury', speed: 0 });
    const ship3 = makeOther({ userid: 'u3', shipno: 1 }, { xcoord: 5.2, ycoord: 5 }, { shipname: 'Storm', speed: 1000 });
    const { service } = makeService([player, ship2, ship3]);
    await service.onModuleInit();
    const result = service.command.handler(player, ['lo', 'full'], {}) as CommandResult;
    const rows = result.scanRender!.sidePanel!;
    expect(rows).toHaveLength(2);
    rows.forEach(r => expect(r.name).toBeUndefined());
  });
});

// ---------------------------------------------------------------------------
// T027f — side panel ordered by ascending distance
// ---------------------------------------------------------------------------

describe('T027 — sca lo full: side-panel ordering', () => {
  it('rows are sorted by ascending distance', async () => {
    const player = makeShip({ userid: 'u1', shipno: 1, xcoord: 5, ycoord: 5 });
    // near is 0.1 away, far is 0.3 away
    const near = makeOther({ userid: 'u2', shipno: 1 }, { xcoord: 5.1, ycoord: 5 }, { speed: 0 });
    const far = makeOther({ userid: 'u3', shipno: 1 }, { xcoord: 5.3, ycoord: 5 }, { speed: 0 });
    const { service } = makeService([player, far, near]); // intentionally reversed
    await service.onModuleInit();
    const result = service.command.handler(player, ['lo', 'full'], {}) as CommandResult;
    const rows = result.scanRender!.sidePanel!;
    expect(rows).toHaveLength(2);
    expect(rows[0].distance).toBeLessThanOrEqual(rows[1].distance);
  });
});

// ---------------------------------------------------------------------------
// T027g — warp 1.0 boundary (speed=1000) → 'Warp 1.0'
// ---------------------------------------------------------------------------

describe('T027 — showarpDisplay edge cases', () => {
  it('speed=999 (below warp threshold) → "Impulse"', async () => {
    const player = makeShip({ userid: 'u1', shipno: 1, xcoord: 5, ycoord: 5 });
    const other = makeOther({ userid: 'u2', shipno: 1 }, { xcoord: 5.1, ycoord: 5 }, { speed: 999 });
    const { service } = makeService([player, other]);
    await service.onModuleInit();
    const result = service.command.handler(player, ['lo', 'full'], {}) as CommandResult;
    expect(result.scanRender!.sidePanel![0].speedDisplay).toBe('Impulse');
  });

  it('speed=1000 (exact warp threshold) → "Warp 1.0"', async () => {
    const player = makeShip({ userid: 'u1', shipno: 1, xcoord: 5, ycoord: 5 });
    const other = makeOther({ userid: 'u2', shipno: 1 }, { xcoord: 5.1, ycoord: 5 }, { speed: 1000 });
    const { service } = makeService([player, other]);
    await service.onModuleInit();
    const result = service.command.handler(player, ['lo', 'full'], {}) as CommandResult;
    expect(result.scanRender!.sidePanel![0].speedDisplay).toBe('Warp 1.0');
  });
});
