/**
 * The scan headers, in canon's own words and canon's own units.
 *
 * MBMGEMSG.MSG ships two of them and they are NOT the same shape:
 *
 *   SCAN24 {   Range Scan Dist:%s (s:%d %d)     -- lo / lo full / ra
 *   SCAN25 {   Sector Scan mag:1x (s:%d %d)     -- se, with NO range at all
 *
 * `%s` is the RAW range: canon prints `spr("%ld",(long)range)` while `range`
 * is still in raw coordinate units and only divides by 10 000 afterwards
 * (GECMDS.C:2516 then :2521; :2673 then :2676).
 *
 * The port printed `Range: <n>pc` on `sca lo`, where `<n>` was the range
 * already divided by 10 000 — so the same screen showed "Range: 1235" from
 * `sca ra` and "Range: 30pc" from `sca lo`, two readouts of the same kind of
 * quantity differing by four orders of magnitude and wearing a unit canon
 * never uses. `pc` was doing even more damage in the side panel, where it was
 * suffixed to raw units.
 */
import { ScanHandlerService } from '../../src/game/commands/handlers/scan.handler';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ShipClassCacheService } from '../../src/game/physics/ship-class-cache.service';
import { GalaxyService } from '../../src/game/galaxy/galaxy.service';
import { PlanetStateService } from '../../src/game/planet/planet-state.service';
import { MineRegistry } from '../../src/game/combat/mine.registry';
import { ShipState } from '../../src/game/ship/ship-state.types';
import { NUMITEMS } from '../../src/game/constants';
import { makeShip as baseMakeShip } from '../helpers/make-ship';

function makeShip(over: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    shipname: 'Probe',
    xcoord: 5.5,
    ycoord: 5.5,
    phasrtype: 1,
    shieldtype: 1,
    items: new Array(NUMITEMS).fill(0n),
    topspeed: 8,
    channel: over.channel ?? 1,
    ...over,
  });
}

function makeService(scanRange = 100_000) {
  const shipClassCache = new ShipClassCacheService({} as never);
  shipClassCache.setForTest(1, { maxAcceleration: 0, maxWarp: 0, scanRange });
  const service = new ScanHandlerService(
    { findAllShips: () => [], findByName: () => undefined, findByUserid: () => [] } as unknown as ShipStateService,
    {} as unknown as PrismaService,
    {
      getSectorPlanets: () => [], getSectorWormholes: () => [],
      findPlanetByName: () => null, getMeta: () => undefined, onModuleInit: () => undefined,
    } as unknown as GalaxyService,
    { get: () => undefined } as unknown as PlanetStateService,
    new MineRegistry(),
    undefined,
    shipClassCache,
  );
  return service;
}

const header = async (service: ScanHandlerService, ship: ShipState, args: string[]) => {
  const r = await (service.command.handler(ship, args, {} as never) as Promise<{
    scanRender?: { header?: string };
  }>);
  return r.scanRender!.header!;
};

describe('scan headers follow SCAN24 / SCAN25', () => {
  it('`sca se` says mag:1x and carries NO range — SCAN25', async () => {
    const service = await makeService();
    const h = await header(service, makeShip(), ['se']);

    expect(h).toBe('   Sector Scan mag:1x (s:5 5)');
    expect(h).not.toMatch(/Range|Dist/);
  });

  it('`sca lo` prints the RAW range under SCAN24, not range/10000', async () => {
    const service = await makeService(100_000);
    const h = await header(service, makeShip(), ['lo']);

    // 100 000 scanRange x SCAN_LO_PROJECTION_MULTIPLIER (3) = 300 000 raw.
    expect(h).toBe('   Range Scan Dist:300000 (s:5 5)');
  });

  it('`sca ra` uses the same SCAN24 shape, so the two agree', async () => {
    const service = await makeService(100_000);
    const lo = await header(service, makeShip(), ['lo']);
    const ra = await header(service, makeShip(), ['ra']);

    expect(ra).toMatch(/^ {3}Range Scan Dist:\d+ \(s:5 5\)$/);
    expect(lo).toMatch(/^ {3}Range Scan Dist:\d+ \(s:5 5\)$/);
  });

  it('never says "pc" — canon has no such unit anywhere', async () => {
    const service = await makeService();
    for (const mode of [['se'], ['lo'], ['ra'], ['lo', 'full']]) {
      expect(await header(service, makeShip(), mode)).not.toMatch(/pc/);
    }
  });
});
