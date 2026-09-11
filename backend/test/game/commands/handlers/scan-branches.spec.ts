/**
 * `sca` — the decisions that decide WHO you are looking at, WHETHER you are
 * allowed to see them, and WHAT the other pilot is told about it.
 *
 * Round-four branch coverage for `scan.handler.ts`. Every case here goes
 * through `service.command.handler`, not through a helper, because two of this
 * port's shipped scan defects lived in the CALLER: one printed the account key
 * instead of the pilot handle, and one reported a ship's position with no range
 * gate at all. Both helpers were fine.
 *
 * @see GECMDS.C:2190 scan_sh   — letter targeting, the range gate, SCAN01..SCAN07A
 * @see GECMDS.C:2261-2280      — the SCAN1/SCAN2/SCAN3 announcement to the scanned ship
 * @see GECMDS.C:2295 scan_pl   — ownership line
 * @see GECMDS.C:2529-2545      — the scan_ra mine loop and its `channel != 255` gate
 */

import { ScanHandlerService } from '../../../../src/game/commands/handlers/scan.handler';
import { ShipStateService } from '../../../../src/game/ship/ship-state.service';
import { GalaxyService } from '../../../../src/game/galaxy/galaxy.service';
import { PlanetStateService } from '../../../../src/game/planet/planet-state.service';
import { MineRegistry } from '../../../../src/game/combat/mine.registry';
import { PrismaService } from '../../../../src/prisma/prisma.service';
import { ShipClassCacheService } from '../../../../src/game/physics/ship-class-cache.service';
import { ShipState } from '../../../../src/game/ship/ship-state.types';
import { PlanetState } from '../../../../src/game/planet/planet-state.types';
import { CommandContext, CommandResult } from '../../../../src/game/commands/command.types';
import { NUMITEMS } from '../../../../src/game/constants/items';
import { NEUTRAL_ZONE_OWNER, NEUTRAL_ZONE_OWNER_DISPLAY } from '../../../../src/game/combat/neutral-zone';
import { makeShip as buildShip } from '../../../helpers/make-ship';

const ctx: CommandContext = {};

// Local defaults layered on the shared factory: this suite's ships are named
// 'Test', not yet boarded (status 0), stationary (topspeed 0).
function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return buildShip({
    shipname: 'Test',
    status: 0,
    topspeed: 0,
    ...overrides,
  });
}

function makePlanet(overrides: Partial<PlanetState> = {}): PlanetState {
  return {
    xsect: 0, ysect: 0, plnum: 1,
    type: 1, xcoord: 0.5, ycoord: 0.5,
    userid: null, name: 'Zygor',
    enviorn: 3, resource: 2,
    cash: 0n, debt: 0n, tax: 0n, taxrate: 0, warnings: 0,
    password: '', lastattack: '', beacon: '', spyowner: '',
    technology: 0, teamcode: 0n,
    items: Array.from({ length: NUMITEMS }, () => ({
      qty: 0n, rate: 0, sell: false, reserve: 0, markup2a: 0, sold2a: 0n,
    })),
    ...overrides,
  };
}

/** Class 1 = the scanning ship (10 sectors of range). Class 2 = a near-blind hull. */
const SHIP_CLASSES = [
  { classNumber: 1, scanRange: 100_000, typeName: 'Interceptor', maxTons: 1_000 },
  { classNumber: 2, scanRange: 20_000, typeName: 'Freighter', maxTons: 30_000 },
];

interface Harness {
  service: ScanHandlerService;
  shipService: {
    findAllShips: jest.Mock;
    findByName: jest.Mock;
    get: jest.Mock;
  };
  prisma: {
    user: { findUnique: jest.Mock };
    wormhole: { findMany: jest.Mock; findFirst: jest.Mock };
  };
  planetService: { get: jest.Mock; bySector: jest.Mock; byName: jest.Mock };
  mines: MineRegistry;
}

function build(ships: ShipState[] = [], planets: PlanetState[] = []): Harness {
  const shipService = {
    findAllShips: jest.fn().mockReturnValue(ships),
    findByName: jest.fn().mockReturnValue(undefined),
    get: jest.fn().mockReturnValue(undefined),
  };
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(null) },
    wormhole: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };
  const shipClassCache = new ShipClassCacheService({} as never);
  for (const c of SHIP_CLASSES) {
    shipClassCache.setForTest(c.classNumber, { maxAcceleration: 0, maxWarp: 0, ...c });
  }
  const galaxy = {
    getSectorPlanets: jest.fn().mockReturnValue([]),
    getSectorWormholes: jest.fn().mockReturnValue([]),
    findPlanetByName: jest.fn().mockReturnValue(null),
  };
  const planetService = {
    get: jest.fn((x: number, y: number, n: number) =>
      planets.find((p) => p.xsect === x && p.ysect === y && p.plnum === n)),
    bySector: jest.fn((x: number, y: number) =>
      planets.filter((p) => p.xsect === x && p.ysect === y)),
    byName: jest.fn().mockReturnValue(undefined),
  };
  const mines = new MineRegistry();

  const service = new ScanHandlerService(
    shipService as unknown as ShipStateService,
    prisma as unknown as PrismaService,
    galaxy as unknown as GalaxyService,
    planetService as unknown as PlanetStateService,
    mines,
    undefined,
    shipClassCache,
  );
  return { service, shipService, prisma, planetService, mines };
}

const run = (s: ScanHandlerService, ship: ShipState, args: string[]): Promise<CommandResult> =>
  s.command.handler(ship, args, ctx) as Promise<CommandResult>;

const textOf = (r: CommandResult): string => r.lines.map((l) => l.text).join('\n');

// ─────────────────────────────────────────────────────────────────────────────
// 1. `sca sh <letter>` — the scan letter table decides which hull you inspect
// ─────────────────────────────────────────────────────────────────────────────

describe('sca sh <letter> — resolving a contact through the scan letter table', () => {
  /** Scanner and one contact one sector off the bow, well inside 10 sectors. */
  function twoShips() {
    const me = makeShip({ userid: 'u1', shipno: 1, shipname: 'Blackbird', xcoord: 0, ycoord: 0 });
    const them = makeShip({
      userid: 'u2', shipno: 4, shipname: 'Marauder', shpclass: 1,
      xcoord: 1, ycoord: 0, username: 'bob',
    });
    return { me, them };
  }

  it('refuses a letter when no scan has been run — there is no table to read', async () => {
    const { me, them } = twoShips();
    const { service } = build([me, them]);

    // No `sca lo` first, so the scantab slot for this pilot is empty.
    const res = await run(service, me, ['sh', 'a']);

    expect(textOf(res)).toContain('No scan data');
    expect(res.broadcasts).toBeUndefined();
  });

  it('refuses a letter that the current table does not assign', async () => {
    const { me, them } = twoShips();
    const { service } = build([me, them]);
    await run(service, me, ['lo']);   // assigns 'A' to Marauder, nothing else

    const res = await run(service, me, ['sh', 'q']);

    expect(textOf(res)).toContain('No ship assigned letter Q');
    expect(res.broadcasts).toBeUndefined();
  });

  it('reports a letter whose ship has left the game rather than scanning nothing', async () => {
    const { me, them } = twoShips();
    const { service, shipService } = build([me, them]);
    await run(service, me, ['lo']);
    // The table still holds 'A', but the ship behind it is gone from state.
    shipService.get.mockReturnValue(undefined);

    const res = await run(service, me, ['sh', 'A']);

    expect(textOf(res)).toContain('Ship A is no longer active.');
    expect(res.broadcasts).toBeUndefined();
  });

  it('scans the ship the letter names, not a name-substring match', async () => {
    const { me, them } = twoShips();
    const { service, shipService } = build([me, them]);
    await run(service, me, ['lo']);
    shipService.get.mockImplementation((userid: string, shipno: number) =>
      userid === 'u2' && shipno === 4 ? them : undefined);
    // A decoy that a name search would find for the single character 'a'.
    shipService.findByName.mockReturnValue(
      makeShip({ userid: 'u3', shipno: 1, shipname: 'Anvil', xcoord: 2, ycoord: 0 }),
    );

    const res = await run(service, me, ['sh', 'a']);

    expect(textOf(res)).toContain('Marauder');
    expect(textOf(res)).not.toContain('Anvil');
    // The letter branch must not fall through to the name search at all.
    expect(shipService.findByName).not.toHaveBeenCalled();
    // Lower case in, canon's upper-case slot out — `shipService.get` was asked
    // for the identity behind 'A'.
    expect(shipService.get).toHaveBeenCalledWith('u2', 4);
  });

  it('names the pilot by handle, never by the account key (GECMDS.C:2229 username)', async () => {
    const { me, them } = twoShips();
    them.username = 'Redbeard';
    them.userid = 'acct-9f2c';
    them.status = 0;
    const { service, shipService } = build([me, them]);
    await run(service, me, ['lo']);
    shipService.get.mockReturnValue(them);

    const res = await run(service, me, ['sh', 'A']);

    expect(textOf(res)).toContain('Redbeard');
    expect(textOf(res)).not.toContain('acct-9f2c');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. The range gate — what a viewer is allowed to learn about another ship
// ─────────────────────────────────────────────────────────────────────────────

describe('sca sh — the scanner range gate (GECMDS.C:2220)', () => {
  it('withholds position, heading and damage from a target beyond scanner range', async () => {
    const me = makeShip({ userid: 'u1', shipno: 1, xcoord: 0, ycoord: 0 });
    // 12 sectors out; class-1 scan range is 100_000 raw units = 10 sectors.
    const far = makeShip({
      userid: 'u2', shipno: 1, shipname: 'Ghost', shpclass: 1,
      xcoord: 12, ycoord: 0, damage: 40, kills: 7, username: 'eve',
    });
    const { service, shipService } = build([me, far]);
    shipService.findByName.mockReturnValue(far);

    const res = await run(service, me, ['sh', 'Ghost']);

    expect(textOf(res)).toContain('out of scanner range');
    // Nothing else leaks: no sector, no heading, no damage, no kill count.
    expect(res.lines).toHaveLength(1);
    // And the target is not told they were scanned — canon returns before the
    // SCAN1/2/3 send at :2261.
    expect(res.broadcasts).toBeUndefined();
  });

  it('gives the full readout for a target inside scanner range', async () => {
    const me = makeShip({ userid: 'u1', shipno: 1, xcoord: 0, ycoord: 0 });
    const near = makeShip({
      userid: 'u2', shipno: 1, shipname: 'Ghost', shpclass: 1,
      xcoord: 3, ycoord: 0, username: 'eve',
    });
    const { service, shipService } = build([me, near]);
    shipService.findByName.mockReturnValue(near);

    const res = await run(service, me, ['sh', 'Ghost']);

    expect(textOf(res)).not.toContain('out of scanner range');
    expect(res.lines.length).toBeGreaterThan(5);
    expect(res.broadcasts).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. The announcement — reconnaissance is never silent (GECMDS.C:2261-2280)
// ─────────────────────────────────────────────────────────────────────────────

describe('sca sh — what the scanned ship is told', () => {
  const me = () => makeShip({ userid: 'u1', shipno: 1, shipname: 'Blackbird', xcoord: 0, ycoord: 0 });

  it('addresses the notice to the scanned pilot alone', async () => {
    const scanner = me();
    const target = makeShip({ userid: 'u2', shipno: 3, shipname: 'Ghost', shpclass: 1, xcoord: 3, ycoord: 0 });
    const { service, shipService } = build([scanner, target]);
    shipService.findByName.mockReturnValue(target);

    const res = await run(service, scanner, ['sh', 'Ghost']);

    expect(res.broadcasts).toHaveLength(1);
    expect(res.broadcasts![0].room).toBe('ship:u2:3');
  });

  it('SCAN2 — an unknown source BEYOND the target\'s own range', async () => {
    const scanner = me();
    // Class 2 sees 2 sectors; the scanner is 3 sectors away, so to this pilot
    // the contact is outside their own envelope.
    const target = makeShip({ userid: 'u2', shipno: 3, shipname: 'Ghost', shpclass: 2, xcoord: 3, ycoord: 0 });
    const { service, shipService } = build([scanner, target]);
    shipService.findByName.mockReturnValue(target);

    const res = await run(service, scanner, ['sh', 'Ghost']);
    const text = (res.broadcasts![0].payload as { lines: { text: string }[] }).lines[0].text;

    expect(text).toContain('beyond our range');
    expect(text).not.toContain('being scanned by Ship');
  });

  it('SCAN3 — in range, but the target has never scanned back, so no name', async () => {
    const scanner = me();
    const target = makeShip({ userid: 'u2', shipno: 3, shipname: 'Ghost', shpclass: 1, xcoord: 3, ycoord: 0 });
    const { service, shipService } = build([scanner, target]);
    shipService.findByName.mockReturnValue(target);

    const res = await run(service, scanner, ['sh', 'Ghost']);
    const text = (res.broadcasts![0].payload as { lines: { text: string }[] }).lines[0].text;

    expect(text).toContain('unknown source bearing');
    expect(text).not.toContain('beyond our range');
    expect(text).not.toContain('being scanned by Ship');
  });

  it('SCAN1 — the target has a letter for the scanner, so the scanner is named', async () => {
    const scanner = me();
    const target = makeShip({ userid: 'u2', shipno: 3, shipname: 'Ghost', shpclass: 1, xcoord: 3, ycoord: 0 });
    const { service, shipService } = build([scanner, target]);
    // The target runs its own local scan first: that is what puts a real letter
    // (not '?') against the scanner in the target's scantab.
    await run(service, target, ['lo']);
    shipService.findByName.mockReturnValue(target);

    const res = await run(service, scanner, ['sh', 'Ghost']);
    const text = (res.broadcasts![0].payload as { lines: { text: string }[] }).lines[0].text;

    expect(text).toContain('being scanned by Ship');
    expect(text).not.toContain('unknown source');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. `sca pl <n>` — who owns it (GECMDS.C:2330)
// ─────────────────────────────────────────────────────────────────────────────

describe('sca pl <n> — the ownership line', () => {
  const pilot = () => makeShip({ userid: 'u1', shipno: 1, xcoord: 0.5, ycoord: 0.5 });

  it('names the Neutral Zone Authority without a user lookup for the sentinel owner', async () => {
    const planet = makePlanet({ userid: NEUTRAL_ZONE_OWNER, name: 'Haven' });
    const { service, prisma } = build([], [planet]);

    const res = await run(service, pilot(), ['pl', '1']);

    expect(textOf(res)).toContain(NEUTRAL_ZONE_OWNER_DISPLAY);
    // The sentinel has no User row: resolving it is both a wasted query and how
    // the raw `**neutral**` string reached a player's screen.
    expect(textOf(res)).not.toContain(NEUTRAL_ZONE_OWNER);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('names a real owner by their handle, resolved from the User row', async () => {
    const planet = makePlanet({ userid: 'acct-77', name: 'Haven' });
    const { service, prisma } = build([], [planet]);
    prisma.user.findUnique.mockResolvedValue({ username: 'Bob The Bold' });

    const res = await run(service, pilot(), ['pl', '1']);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { userid: 'acct-77' },
      select: { username: true },
    });
    expect(textOf(res)).toContain('Bob The Bold');
    expect(textOf(res)).not.toContain('acct-77');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. `sca ra` — a spent mine slot is not a mine (GECMDS.C:2530)
// ─────────────────────────────────────────────────────────────────────────────

describe('sca ra — the mine table gate', () => {
  it('plots the live mine and not the freed slot beside it', async () => {
    const me = makeShip({ userid: 'u1', shipno: 1, xcoord: 0, ycoord: 0 });
    const { service, mines } = build([me]);
    mines.hydrate([
      { id: 1, channel: 3, timer: 10, xcoord: 0.001, ycoord: 0.001, deployedBy: 'u2' },
      // channel 255 — the slot canon skips everywhere it walks the table.
      { id: 2, channel: 255, timer: 0, xcoord: 0.001, ycoord: 0.001, deployedBy: 'u2' },
    ]);

    const res = await run(service, me, ['ra', '1']);
    const mineCells = res.scanRender!.cells.filter((c) => c.type === 'mine');

    expect(mineCells).toHaveLength(1);
    expect(mineCells[0].char).toBe('.');
  });
});
