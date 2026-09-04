/**
 * Mines appear on the scan, as '.'.
 *
 * Canon plots them in TWO modes, before anything else is drawn:
 *
 *   scan_se — same sector only, GECMDS.C:2598-2609
 *     if (mptr->channel != 255 && (x==xsect && y==ysect))  map[y][x] = '.';
 *   scan_lo — anything that projects into the grid, GECMDS.C:2529-2545
 *     if (mptr->channel != 255)                            map[y][x] = '.';
 *
 * The port drew none of them. `type: 'mine'` did not appear anywhere in the
 * backend, while scan.handler.ts carried two comments describing a mine layer
 * and its precedence ("mine -> planet -> ship -> self", "wormholes first,
 * mines, then planets, ships, self") — documented, ordered, and never
 * implemented. That is the same shape as the missile shake and the CLOK3 ion
 * trail: prose with no code behind it.
 *
 * It also explains an invention we had already flagged. The port added a
 * "Mine detected — bearing ..." line where canon has MINE6, because the map
 * physically could not show one.
 *
 * There is no ownership or detection gate in canon: a live mine is drawn for
 * everyone who scans, including the ship that laid it.
 */
import { ScanHandlerService } from '../../src/game/commands/handlers/scan.handler';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { GalaxyService } from '../../src/game/galaxy/galaxy.service';
import { PlanetStateService } from '../../src/game/planet/planet-state.service';
import { MineRegistry, MineState } from '../../src/game/combat/mine.registry';
import { ShipState } from '../../src/game/ship/ship-state.types';
import { NUMITEMS } from '../../src/game/constants';

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'Probe', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 5.5, ycoord: 5.5, damage: 0, energy: 1000,
    phasr: 0, phasrtype: 1, kills: 0, lastfired: 0,
    shieldtype: 1, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: new Array(NUMITEMS).fill(0n),
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 8, warncntr: 0,
    navTargetX: null, navTargetY: null,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false,
    ...over,
    channel: over.channel ?? over.shipno ?? 1,
  } as ShipState;
}

function makeMine(over: Partial<MineState> = {}): MineState {
  return {
    id: 1, channel: 7, timer: 30,
    xcoord: 5.2, ycoord: 5.2, deployedBy: 'someone',
    ...over,
  };
}

async function makeService(ships: ShipState[], mines: MineState[], scanRange = 100_000) {
  const shipServiceMock = {
    findAllShips: jest.fn().mockReturnValue(ships),
    findByName: jest.fn().mockReturnValue(undefined),
    findByUserid: jest.fn().mockReturnValue([]),
  };
  const prismaMock = {
    shipClass: { findMany: jest.fn().mockResolvedValue([{ classNumber: 1, scanRange }]) },
  };
  const galaxyMock = {
    getSectorPlanets: jest.fn().mockReturnValue([]),
    getSectorWormholes: jest.fn().mockReturnValue([]),
    findPlanetByName: jest.fn().mockReturnValue(null),
    getMeta: jest.fn(),
    onModuleInit: jest.fn(),
  };
  const planetServiceMock = { get: jest.fn().mockReturnValue(undefined) };
  const registry = new MineRegistry();
  registry.hydrate(mines);

  const service = new ScanHandlerService(
    shipServiceMock as unknown as ShipStateService,
    prismaMock as unknown as PrismaService,
    galaxyMock as unknown as GalaxyService,
    planetServiceMock as unknown as PlanetStateService,
    registry,
  );
  await service.onModuleInit();
  return service;
}

type ScanCells = Array<{ x: number; y: number; type: string; char: string }>;

const run = async (service: ScanHandlerService, ship: ShipState, args: string[]): Promise<ScanCells> => {
  const result = await (service.command.handler(ship, args, {} as never) as Promise<{
    scanRender?: { cells: ScanCells };
  }>);
  return result.scanRender!.cells;
};

describe('mines on the scan', () => {
  it('draws a live mine in this sector as "." on `sca se`', async () => {
    const ship = makeShip();
    const service = await makeService([ship], [makeMine({ xcoord: 5.2, ycoord: 5.2 })]);

    const cells = await run(service, ship, ['se']);
    const mine = cells.find((c) => c.type === 'mine');

    expect(mine).toBeDefined();
    expect(mine!.char).toBe('.');
  });

  it('ignores a mine in another sector — scan_se filters on the sector', async () => {
    const ship = makeShip();
    const service = await makeService([ship], [makeMine({ xcoord: 9.2, ycoord: 9.2 })]);

    const cells = await run(service, ship, ['se']);
    expect(cells.find((c) => c.type === 'mine')).toBeUndefined();
  });

  it('ignores a spent slot — channel 255 is not a live mine', async () => {
    const ship = makeShip();
    const service = await makeService([ship], [makeMine({ channel: 255 })]);

    const cells = await run(service, ship, ['se']);
    expect(cells.find((c) => c.type === 'mine')).toBeUndefined();
  });

  it('shows the layer their own mine, since canon has no ownership gate', async () => {
    const ship = makeShip();
    const service = await makeService([ship], [makeMine({ deployedBy: 'u1:1' })]);

    const cells = await run(service, ship, ['se']);
    expect(cells.find((c) => c.type === 'mine')).toBeDefined();
  });

  it('lets a ship on the same cell win — mines are drawn first', async () => {
    // Both at the same sector-relative position, so they project to one cell.
    const ship = makeShip();
    const other = makeShip({ userid: 'u2', shipno: 2, shipname: 'Other', xcoord: 5.2, ycoord: 5.2 });
    const service = await makeService([ship, other], [makeMine({ xcoord: 5.2, ycoord: 5.2 })]);

    const cells = await run(service, ship, ['se']);
    const atCell = cells.filter((c) => c.x === cells.find((k) => k.type === 'ship')?.x);
    expect(atCell.some((c) => c.type === 'mine')).toBe(false);
  });

  it('draws mines on `sca lo` too — GECMDS.C:2529', async () => {
    const ship = makeShip();
    const service = await makeService([ship], [makeMine({ xcoord: 5.6, ycoord: 5.6 })]);

    const cells = await run(service, ship, ['lo']);
    expect(cells.find((c) => c.type === 'mine')?.char).toBe('.');
  });
});
