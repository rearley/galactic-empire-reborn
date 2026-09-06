/**
 * Mines are plotted on `sca ra`, not on `sca lo`.
 *
 * Canon's mine loop lives in scan_ra:
 *
 *   for (i=0,mptr = mines; i<nummines;++mptr,++i)
 *       if (mptr->channel != 255) {
 *           xf = (MAXX/2.0)+((mptr->coord.xcoord - x1)/xfactor);
 *           yf = (MAXY/2.0)+((mptr->coord.ycoord - y1)/yfactor);
 *           ...
 *
 * @see GECMDS.C:2529-2545 (scan_ra) — and scan_lo, GECMDS.C:2640 onward,
 *      contains no `mptr` iteration at all before printmap().
 *
 * The port had this exactly backwards: the loop sat in `sca lo` while citing
 * scan_ra's line numbers. `sca ra` is the ZOOMABLE tactical scan — the only
 * mode with an adjustable range, and therefore the one a pilot uses to pick a
 * way through a minefield — so it showed clean space, while the long-range
 * overview drew mines canon never puts there.
 *
 * `sca se` keeps its own mine loop: canon gives scan_se one at GECMDS.C:2598.
 */
import { ScanHandlerService } from '../../src/game/commands/handlers/scan.handler';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { PlanetStateService } from '../../src/game/planet/planet-state.service';
import { GalaxyService } from '../../src/game/galaxy/galaxy.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { MineRegistry } from '../../src/game/combat/mine.registry';
import { ShipState } from '../../src/game/ship/ship-state.types';
import { CommandContext, CommandResult } from '../../src/game/commands/command.types';
import { NUMITEMS } from '../../src/game/constants/items';

type GridResult = CommandResult & {
  scanRender?: { cells: { type: string }[] };
  scanGrid?: { cells: { type: string }[] };
};

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return {
    userid: 'u1', shipno: 1, shipname: 'S', shpclass: 1,
    heading: 0, head2b: 0, speed: 0, speed2b: 0,
    xcoord: 20, ycoord: 20, damage: 0, energy: 50_000,
    phasr: 0, phasrtype: 1, kills: 0, lastfired: 0,
    shieldtype: 0, shieldstat: 0, shield: 0, cloak: 0,
    degrees: 0, percent: 0, tactical: 0, helm: 0, train: 0,
    where: 0, ltorpsChannel: [], ltorpsDistance: [],
    lmisslChannel: [], lmisslDistance: [], lmisslEnergy: [],
    decout: [], jammer: 0, freq: [0, 0, 0],
    items: new Array(NUMITEMS).fill(0n),
    titem: 0, hostile: 0, cantexit: 0, repair: 0, hypha: 0,
    firecntl: 0, destruct: 0, status: 1, cybmine: 0,
    cybskill: 0, cybupdate: 0, tick: 0, emulate: 0,
    minesnear: 0, lock: 0, holdcourse: 0, topspeed: 10, warncntr: 0,
    scanNames: false, scanHome: false, scanFull: false, msgFilter: false,
    dirty: false, ...over,
  } as ShipState;
}

function build() {
  const ship = makeShip();
  const registry = new MineRegistry();
  // A live mine a short hop off the bow — inside the tactical picture.
  registry.add({
    id: 1, channel: 3, timer: 10,
    xcoord: 20.05, ycoord: 20, deployedBy: 'someone',
  } as never);

  const svc = new ScanHandlerService(
    { findAllShips: () => [ship] } as unknown as ShipStateService,
    { shipClass: { findMany: jest.fn().mockResolvedValue([]) } } as unknown as PrismaService,
    { getSector: () => undefined, getWormholes: () => [] } as unknown as GalaxyService,
    { getAll: () => [], get: () => undefined, getBySector: () => [] } as unknown as PlanetStateService,
    registry,
  );
  (svc as unknown as { classCache: Map<number, unknown> }).classCache.set(1, {
    scanRange: 100_000, typeName: 'Interceptor', maxTons: 1000,
  });
  return { svc, ship };
}

const ctx: CommandContext = {};
const cellsOf = (r: GridResult) => r.scanRender?.cells ?? r.scanGrid?.cells ?? [];

describe('mines are drawn on sca ra, not sca lo (GECMDS.C:2529)', () => {
  it('sca ra plots a live mine', async () => {
    const { svc, ship } = build();

    const res = await svc.command.handler(ship, ['ra', '1'], ctx) as GridResult;

    expect(cellsOf(res).some((c) => c.type === 'mine')).toBe(true);
  });

  it('sca lo plots no mines — canon has no loop there', async () => {
    const { svc, ship } = build();

    const res = await svc.command.handler(ship, ['lo'], ctx) as GridResult;

    expect(cellsOf(res).some((c) => c.type === 'mine')).toBe(false);
  });
});
