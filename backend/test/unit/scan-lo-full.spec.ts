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
import { MineRegistry } from '../../src/game/combat/mine.registry';
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
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
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
    new MineRegistry(),
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

// Canon has NO not-in-flight gate: scan_lo (GECMDS.C:2640) tests `where`
// nowhere, and the only scan-side `where` test in the file is scan_hy at
// :2737 inside `#ifdef NOTHING`. Orbit is where a pilot parks to shop.
describe('T027 — sca lo: scans work in orbit and docked', () => {
  it('sca lo while docked (where=10) still renders a scan', async () => {
    const { service } = makeService([]);
    await service.onModuleInit();
    const ship = makeShip({ where: 10 });
    const result = await (service.command.handler(ship, ['lo'], {}) as Promise<CommandResult>);
    expect(result.lines).toHaveLength(1);
    expect(result.scanRender).toBeDefined();
  });

  it('sca lo while dead (where=20) still renders a scan', async () => {
    const { service } = makeService([]);
    await service.onModuleInit();
    const ship = makeShip({ where: 20 });
    const result = await (service.command.handler(ship, ['lo'], {}) as Promise<CommandResult>);
    // `sca lo full` is the one mode that produces a SCAN DATA card, and the
    // card carries the header — so it emits NO log line, or the event log
    // fills with rows duplicating the card beside them. What "still renders a
    // scan" means here is the render payload, which is what this checks.
    expect(result.lines).toHaveLength(1);
    expect(result.scanRender).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// T027b — failure-mode guards: sca lo full while not in flight
// ---------------------------------------------------------------------------

// Canon has NO not-in-flight gate: scan_lo (GECMDS.C:2640) tests `where`
// nowhere, and the only scan-side `where` test in the file is scan_hy at
// :2737 inside `#ifdef NOTHING`. Orbit is where a pilot parks to shop.
/**
 * `sca lo full` is the ONE mode that produces a SCAN DATA card, and the card
 * carries the header — so it emits no log line. Echoing it as well filled the
 * event log with rows duplicating the card beside them. "Still renders a scan"
 * therefore means the render payload, not a line of text.
 */
describe('T027 — sca lo full: scans work in orbit and docked', () => {
  it('sca lo full while docked (where=10) still renders a scan', async () => {
    const { service } = makeService([]);
    await service.onModuleInit();
    const ship = makeShip({ where: 10 });
    const result = await (service.command.handler(ship, ['lo', 'full'], {}) as Promise<CommandResult>);
    // `sca lo full` is the one mode that produces a SCAN DATA card, and the
    // card carries the header — so it emits NO log line, or the event log
    // fills with rows duplicating the card beside them. What "still renders a
    // scan" means here is the render payload, which is what this checks.
    expect(result.lines).toHaveLength(0);
    expect(result.scanRender).toBeDefined();
    expect(result.scanRender?.sidePanel).toBeDefined();
  });

  it('sca lo full while dead (where=20) still renders a scan', async () => {
    const { service } = makeService([]);
    await service.onModuleInit();
    const ship = makeShip({ where: 20 });
    const result = await (service.command.handler(ship, ['lo', 'full'], {}) as Promise<CommandResult>);
    // `sca lo full` is the one mode that produces a SCAN DATA card, and the
    // card carries the header — so it emits NO log line, or the event log
    // fills with rows duplicating the card beside them. What "still renders a
    // scan" means here is the render payload, which is what this checks.
    expect(result.lines).toHaveLength(0);
    expect(result.scanRender).toBeDefined();
    expect(result.scanRender?.sidePanel).toBeDefined();
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
    const result = await (service.command.handler(player, ['lo', 'full'], {}) as Promise<CommandResult>);
    expect(result.scanRender).toBeDefined();
    expect(result.scanRender!.kind).toBe('lo-full');
    expect(result.scanRender!.sidePanel).toBeDefined();
    expect(Array.isArray(result.scanRender!.sidePanel)).toBe(true);
  });

  /**
   * Every other field in the legend is an integer — `bearing` is rounded where
   * it is computed, and `rep nav` rounds heading for display. This one came
   * straight off the ship state, so a contact under way rendered as
   * "Hdg:69.83440234557376" and blew the column layout apart in a terminal
   * whose whole identity is fixed-width text. Seen in the browser.
   */
  it('rounds heading, like every other number in the legend', async () => {
    const player = makeShip({ userid: 'u1', shipno: 1, xcoord: 5, ycoord: 5 });
    const other = makeOther(
      { userid: 'u2', shipno: 1 },
      { xcoord: 5.1, ycoord: 5 },
      { shipname: 'Drifter', speed: 0, heading: 69.83440234557376 },
    );
    const { service } = makeService([player, other]);
    await service.onModuleInit();
    const result = await (service.command.handler(player, ['lo', 'full'], {}) as Promise<CommandResult>);
    const row = result.scanRender!.sidePanel![0];
    expect(Number.isInteger(row.heading)).toBe(true);
    // The column is NOT the other ship's compass heading. C prints
    // cbearing(him, me, HIS heading) -- where I am, seen from him
    // (GECMDS.C:2885) -- so it is signed and relative.
    expect(row.heading).toBeGreaterThanOrEqual(-180);
    expect(row.heading).toBeLessThanOrEqual(180);
  });

  it('sca lo full with no other ships produces empty sidePanel', async () => {
    const player = makeShip({ userid: 'u1', shipno: 1 });
    const { service } = makeService([player]);
    await service.onModuleInit();
    const result = await (service.command.handler(player, ['lo', 'full'], {}) as Promise<CommandResult>);
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
    const result = await (service.command.handler(player, ['lo', 'full'], {}) as Promise<CommandResult>);
    return result.scanRender!.sidePanel!;
  }

  it('fixture 1: stopped ship (speed=0) → speedDisplay "0.00" (canon showarp)', async () => {
    const player = makeShip({ userid: 'u1', shipno: 1, xcoord: 5, ycoord: 5 });
    const stopped = makeOther(
      { userid: 'u2', shipno: 1 },
      { xcoord: 5.1, ycoord: 5 },
      { speed: 0, heading: 45 },
    );
    const rows = await getRows(player, [stopped]);
    expect(rows).toHaveLength(1);
    expect(rows[0].speedDisplay).toBe('0.00');
  });

  it('fixture 2: impulse ship (speed=500) → speedDisplay "0.50" (canon showarp)', async () => {
    const player = makeShip({ userid: 'u1', shipno: 1, xcoord: 5, ycoord: 5 });
    const impulseShip = makeOther(
      { userid: 'u2', shipno: 1 },
      { xcoord: 5.1, ycoord: 5 },
      { speed: 500, heading: 90 },
    );
    const rows = await getRows(player, [impulseShip]);
    expect(rows).toHaveLength(1);
    expect(rows[0].speedDisplay).toBe('0.50');
  });

  it('fixture 3: warp ship (speed=4500) → speedDisplay "4.50" (canon showarp)', async () => {
    const player = makeShip({ userid: 'u1', shipno: 1, xcoord: 5, ycoord: 5 });
    const warpShip = makeOther(
      { userid: 'u2', shipno: 1 },
      { xcoord: 5.1, ycoord: 5 },
      { speed: 4500, heading: 180 },
    );
    const rows = await getRows(player, [warpShip]);
    expect(rows).toHaveLength(1);
    expect(rows[0].speedDisplay).toBe('4.50');
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

  it('row fields: heading is where I am from HIM, not his compass heading', async () => {
    // The two columns answer different questions (GECMDS.C:2884-2885):
    //   bearing = cbearing(me, him, my heading)  -- where is he, from me
    //   heading = cbearing(him, me, his heading) -- where am I, from him
    // The second is the threat read a pilot acts on: near 0 means his nose is
    // pointed at you and you are inside his arc. Reporting his absolute
    // heading, as the port did, leaves the pilot to do that subtraction.
    //
    // Here he sits due EAST of the player and is facing 137. From his position
    // the player lies due west (absolute 270), so relative to his own heading
    // that is 270 - 137 = 133.
    const player = makeShip({ userid: 'u1', shipno: 1, xcoord: 5, ycoord: 5 });
    const other = makeOther(
      { userid: 'u2', shipno: 1 },
      { xcoord: 5.1, ycoord: 5 },
      { heading: 137, speed: 0 },
    );
    const rows = await getRows(player, [other]);
    expect(rows[0].heading).toBe(133);
  });

  it('row fields: heading is ~0 when the other ship is pointed straight at you', async () => {
    // The case the column exists for.
    const player = makeShip({ userid: 'u1', shipno: 1, xcoord: 5, ycoord: 5 });
    const other = makeOther(
      { userid: 'u2', shipno: 1 },
      { xcoord: 5, ycoord: 4 },      // due north of the player
      { heading: 180, speed: 0 },    // facing south, i.e. at the player
    );
    const rows = await getRows(player, [other]);
    expect(Math.abs(rows[0].heading)).toBeLessThanOrEqual(1);
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
    const result = await (service.command.handler(player, ['lo', 'full'], {}) as Promise<CommandResult>);
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
    const result = await (service.command.handler(player, ['lo', 'full'], {}) as Promise<CommandResult>);
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
    const result = await (service.command.handler(player, ['lo', 'full'], {}) as Promise<CommandResult>);
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
    const result = await (service.command.handler(player, ['lo', 'full'], {}) as Promise<CommandResult>);
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
    const result = await (service.command.handler(player, ['lo', 'full'], {}) as Promise<CommandResult>);
    const rows = result.scanRender!.sidePanel!;
    expect(rows).toHaveLength(2);
    expect(rows[0].distance).toBeLessThanOrEqual(rows[1].distance);
  });
});

// ---------------------------------------------------------------------------
// T027g — warp 1.0 boundary (speed=1000) → '1.00'
// ---------------------------------------------------------------------------

/**
 * Canon's `showarp` (GEFUNCS.C:2674) returns the BARE figure — "0.00",
 * "5.20", or "Hyper" above warp 99.999 — because the caller supplies the word:
 * the side panel sits under a "Speed" column and SCAN04 reads "Speed: Warp %s".
 * Stopped/Impulse/Warp X.Y was the port's own wording and it also lost
 * precision: "Impulse" covered everything from 1 to 999.
 */
describe('T027 — showarp edge cases', () => {
  it('speed=999 (below warp threshold) → "1.00" — showarp rounds, it does not bucket', async () => {
    const player = makeShip({ userid: 'u1', shipno: 1, xcoord: 5, ycoord: 5 });
    const other = makeOther({ userid: 'u2', shipno: 1 }, { xcoord: 5.1, ycoord: 5 }, { speed: 999 });
    const { service } = makeService([player, other]);
    await service.onModuleInit();
    const result = await (service.command.handler(player, ['lo', 'full'], {}) as Promise<CommandResult>);
    expect(result.scanRender!.sidePanel![0].speedDisplay).toBe('1.00');
  });

  it('speed=1000 (exact warp threshold) → "1.00"', async () => {
    const player = makeShip({ userid: 'u1', shipno: 1, xcoord: 5, ycoord: 5 });
    const other = makeOther({ userid: 'u2', shipno: 1 }, { xcoord: 5.1, ycoord: 5 }, { speed: 1000 });
    const { service } = makeService([player, other]);
    await service.onModuleInit();
    const result = await (service.command.handler(player, ['lo', 'full'], {}) as Promise<CommandResult>);
    expect(result.scanRender!.sidePanel![0].speedDisplay).toBe('1.00');
  });
});
