/**
 * `sca lo` draws EVERY ship in the game, not just the ones the scanner has
 * identified.
 *
 * Canon's map loop has no gate at all:
 *
 *   for (othusn=0 ; othusn < nships ; othusn++)
 *     if (ingegame(othusn))
 *       { ...project...
 *         if (in grid) map[y][x] = (status == GESTAT_AUTO) ? '+' : '='; }
 *
 * @see GECMDS.C:2686-2718 scan_lo
 *
 * The port iterated the SCANTAB instead. The scantab is canon's *identification*
 * table and is gated on cloak and on `scanrange` (GECMDS.C:1371) — a tenth of
 * the radius `scan_lo` projects, since the projection is `scanrange * 10`
 * (`* 3` here, coupled to UNIVMAX; see SCAN_LO_PROJECTION_MULTIPLIER). So
 * everything between the detection radius and the edge of the map — the outer
 * ~90% of the grid, which is the entire point of a LONG RANGE scan — could
 * never draw anything.
 *
 * Found in play: a pilot parked at the hub ran `sca lo full` on an empty map
 * with three Cybertrons 17.8, 21.6 and 21.7 sectors out, all of them well
 * inside the projection and all of them invisible.
 *
 * The two tables stay separate, exactly as canon has them:
 *   - the MAP answers "is anything out there" — ungated;
 *   - the SCANTAB answers "what is it, how far, what bearing" — gated on
 *     cloak and scanrange, and it alone feeds the side panel and `loc`.
 * Cloak therefore still works where canon makes it work: a cloaked ship is a
 * contact you cannot identify, range, or lock.
 */

import { ScanHandlerService } from '../../src/game/commands/handlers/scan.handler';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ShipClassCacheService } from '../../src/game/physics/ship-class-cache.service';
import { GalaxyService } from '../../src/game/galaxy/galaxy.service';
import { PlanetStateService } from '../../src/game/planet/planet-state.service';
import { MineRegistry } from '../../src/game/combat/mine.registry';
import { ShipState } from '../../src/game/ship/ship-state.types';
import { ScanCell } from '../../src/game/commands/command.types';
import { GESTAT_AUTO, GESTAT_USER } from '../../src/game/constants';
import { makeShip as baseMakeShip } from '../helpers/make-ship';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    xcoord: 0.5,
    ycoord: 0.5,
    status: GESTAT_USER,
    topspeed: 0,
    ...overrides,
  });
}

/** Class 1 Interceptor, canon `S01SRNG {Scan Range: 100000}` — 10 sectors. */
const INTERCEPTOR_SCAN_RANGE = 100_000;

function makeService(ships: ShipState[], scanRange = INTERCEPTOR_SCAN_RANGE) {
  const shipClassCache = new ShipClassCacheService({} as never);
  shipClassCache.setForTest(1, { maxAcceleration: 0, maxWarp: 0, scanRange });
  const service = new ScanHandlerService(
    {
      findAllShips: vi.fn().mockReturnValue(ships),
      findByName: vi.fn().mockReturnValue(undefined),
      findByUserid: vi.fn().mockReturnValue([]),
    } as unknown as ShipStateService,
    {} as unknown as PrismaService,
    {
      getSectorPlanets: vi.fn().mockReturnValue([]),
      getSectorWormholes: vi.fn().mockReturnValue([]),
      findPlanetByName: vi.fn().mockReturnValue(null),
      getMeta: vi.fn(),
    } as unknown as GalaxyService,
    { get: vi.fn().mockReturnValue(undefined) } as unknown as PlanetStateService,
    new MineRegistry(),
    undefined,
    shipClassCache,
  );
  return service;
}

const shipCells = (cells: ScanCell[]): ScanCell[] => cells.filter((c) => c.type === 'ship');

/**
 * 17.5 sectors up-range from the hub: far outside the Interceptor's 10-sector
 * scantab, comfortably inside the ~31-sector projection. These are the exact
 * coordinates of Cybrg-205 relative to the ship that found this in play.
 */
const FAR_CONTACT = { xcoord: 3.75, ycoord: 18.0 };

describe('sca lo — canon projects every ship, gated by nothing', () => {
  it('draws an AI ship beyond scanner range as canon\'s "+"', async () => {
    const self = makeShip();
    const cybertron = makeShip({
      userid: 'Cybrg-205', shipno: 205, shipname: 'Cybertron 42111',
      status: GESTAT_AUTO, ...FAR_CONTACT,
    });
    const service = makeService([self, cybertron]);

    const res = await service.command.handler(self, ['lo'], {} as never);

    expect(shipCells(res.scanRender!.cells)).toEqual([
      { x: 16, y: 11, type: 'ship', char: '+' },
    ]);
  });

  it('draws a distant PLAYER ship as canon\'s "="', async () => {
    const self = makeShip();
    const rival = makeShip({
      userid: 'u2', shipno: 1, shipname: 'Bravo',
      status: GESTAT_USER, ...FAR_CONTACT,
    });
    const service = makeService([self, rival]);

    const res = await service.command.handler(self, ['lo'], {} as never);

    expect(shipCells(res.scanRender!.cells)).toEqual([
      { x: 16, y: 11, type: 'ship', char: '=' },
    ]);
  });

  it('keeps the scantab letter for a ship close enough to identify (D1)', async () => {
    // 2 sectors out — inside the 10-sector scantab, so it has a letter and the
    // side panel can range it. The letter must win over the raw glyph.
    const self = makeShip();
    const near = makeShip({
      userid: 'Cybrg-205', shipno: 205, status: GESTAT_AUTO,
      xcoord: 2.5, ycoord: 0.5,
    });
    const service = makeService([self, near]);

    const res = await service.command.handler(self, ['lo'], {} as never);

    expect(shipCells(res.scanRender!.cells)).toEqual([
      { x: 15, y: 7, type: 'ship', char: 'A' },
    ]);
  });

  it('shows a cloaked ship as an unidentified contact — canon has no cloak test here', async () => {
    // GECMDS.C:2686-2718 tests only `ingegame`. Cloak is gated in the SCANTAB
    // (GECMDS.C:1371), so cloak costs the attacker their identity and range
    // readout, not their presence on the overview.
    const self = makeShip();
    const ghost = makeShip({
      userid: 'u2', shipno: 1, status: GESTAT_USER, cloak: 10, ...FAR_CONTACT,
    });
    const service = makeService([self, ghost]);

    const res = await service.command.handler(self, ['lo'], {} as never);

    expect(shipCells(res.scanRender!.cells)).toHaveLength(1);
  });

  it('never draws the scanning ship as a contact', async () => {
    const self = makeShip();
    const service = makeService([self]);

    const res = await service.command.handler(self, ['lo'], {} as never);

    expect(shipCells(res.scanRender!.cells)).toEqual([]);
    expect(res.scanRender!.cells.filter((c) => c.type === 'self')).toHaveLength(1);
  });

  it('leaves a ship outside the projection off the grid entirely', async () => {
    const self = makeShip();
    const tooFar = makeShip({
      userid: 'u2', shipno: 1, status: GESTAT_AUTO, xcoord: 80, ycoord: 80,
    });
    const service = makeService([self, tooFar]);

    const res = await service.command.handler(self, ['lo'], {} as never);

    expect(shipCells(res.scanRender!.cells)).toEqual([]);
  });
});

describe('sca lo full — same map, and the side panel stays scantab-only', () => {
  it('draws the distant contact but does not list what it cannot identify', async () => {
    const self = makeShip();
    const cybertron = makeShip({
      userid: 'Cybrg-205', shipno: 205, shipname: 'Cybertron 42111',
      status: GESTAT_AUTO, ...FAR_CONTACT,
    });
    const service = makeService([self, cybertron]);

    const res = await service.command.handler(self, ['lo', 'full'], {} as never);

    // On the map...
    expect(shipCells(res.scanRender!.cells)).toEqual([
      { x: 16, y: 11, type: 'ship', char: '+' },
    ]);
    // ...but not in the legend: the scantab never saw it, so there is no
    // letter, distance or bearing to print. This is the screen the pilot
    // actually had — a contact on the map, an empty SCAN DATA card.
    expect(res.scanRender!.sidePanel ?? []).toEqual([]);
  });
});
