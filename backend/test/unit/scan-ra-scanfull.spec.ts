/**
 * `set scanfull on` was a settable option that nothing read.
 *
 * Canon uses it in exactly one place — inside scan_ra:
 *
 *   GECMDS.C:2571   if (waruptr->options[SCANFULL])
 *                       printmapfull();
 *                   else
 *                       printmap();
 *
 * printmapfull() draws the map WITH the scantab side panel (letter, distance,
 * bearing, heading, speed, and names when SCANNAMES is on); printmap() draws
 * the map alone. scan_se and scan_lo call printmap() unconditionally, so the
 * range scan is the only place the option applies.
 *
 * This port built that panel onto a port-original `scan lo full` argument and
 * left `scanFull` wired to nothing: it loaded from User.options[2], `set
 * scanfull on` reported success, and no rendering code ever consulted it. A
 * player following canon's own help — "scannames ... (scanfull must be ON
 * too)" — set it, saw a success message, and got no change.
 *
 * @see GECMDS.C:2484 scan_ra, :2571 SCANFULL, :3064 SCANNAMES
 * @see GECMDS.C:2987 printmap, :3019 printmapfull
 */
import { ScanHandlerService } from '../../src/game/commands/handlers/scan.handler';
import { MineRegistry } from '../../src/game/combat/mine.registry';
import { ShipStateService } from '../../src/game/ship/ship-state.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ShipClassCacheService } from '../../src/game/physics/ship-class-cache.service';
import { GalaxyService } from '../../src/game/galaxy/galaxy.service';
import { PlanetStateService } from '../../src/game/planet/planet-state.service';
import { ShipState } from '../../src/game/ship/ship-state.types';
import { CommandResult } from '../../src/game/commands/command.types';
import { makeShip as baseMakeShip } from '../helpers/make-ship';

function makeShip(overrides: Partial<ShipState> = {}): ShipState {
  return baseMakeShip({
    shipname: 'Test',
    status: 0,
    topspeed: 0,
    ...overrides,
  });
}

function makeService(ships: ShipState[]) {
  const shipClassCache = new ShipClassCacheService({} as never);
  shipClassCache.setForTest(1, { maxAcceleration: 0, maxWarp: 0, scanRange: 100_000 });
  const service = new ScanHandlerService(
    { findAllShips: vi.fn().mockReturnValue(ships), findByName: vi.fn(), findByUserid: vi.fn().mockReturnValue([]) } as unknown as ShipStateService,
    {} as unknown as PrismaService,
    { getSectorPlanets: vi.fn().mockReturnValue([]), getSectorWormholes: vi.fn().mockReturnValue([]), findPlanetByName: vi.fn().mockReturnValue(null), getMeta: vi.fn(), onModuleInit: vi.fn() } as unknown as GalaxyService,
    { get: vi.fn().mockReturnValue(undefined) } as unknown as PlanetStateService,
    new MineRegistry(),
    undefined,
    shipClassCache,
  );
  return service;
}

/** A second ship close enough to land inside the grid at level 9. */
const OTHER = makeShip({ userid: 'u2', shipno: 1, shipname: 'Vraska', xcoord: 0.1, ycoord: 0.1, speed: 0 });

async function scanRa(ship: ShipState, others: ShipState[]): Promise<CommandResult> {
  const service = makeService([ship, ...others]);
  return (await service.command.handler(ship, ['ra', '9'], {})) as CommandResult;
}

describe('scan ra honours SCANFULL', () => {
  it('draws no side panel when the option is off — printmap()', async () => {
    const ship = makeShip({ scanFull: false });
    const result = await scanRa(ship, [OTHER]);
    expect(result.scanRender?.kind).toBe('ra');
    expect(result.scanRender?.sidePanel).toBeUndefined();
  });

  it('draws the side panel when the option is on — printmapfull()', async () => {
    // The whole point: before this, setting the option changed nothing at all.
    const ship = makeShip({ scanFull: true });
    const result = await scanRa(ship, [OTHER]);
    expect(result.scanRender?.sidePanel).toBeDefined();
    expect(result.scanRender?.sidePanel?.length).toBeGreaterThan(0);
  });

  it('omits names from that panel unless SCANNAMES is also on', async () => {
    const ship = makeShip({ scanFull: true, scanNames: false });
    const result = await scanRa(ship, [OTHER]);
    const rows = result.scanRender?.sidePanel ?? [];
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach((r) => expect(r.name).toBeUndefined());
  });

  it('shows names when both are on, which is what the help promises', async () => {
    // "scannames - show user names in Range Scans (scanfull must be ON too)"
    const ship = makeShip({ scanFull: true, scanNames: true });
    const result = await scanRa(ship, [OTHER]);
    const rows = result.scanRender?.sidePanel ?? [];
    expect(rows.some((r) => r.name === 'Vraska')).toBe(true);
  });

  it('gives names nowhere when scanfull is off, even with scannames on', async () => {
    // The dependency canon states runs one way and this is the half that bites:
    // flip scannames alone and nothing appears, because there is no panel.
    const ship = makeShip({ scanFull: false, scanNames: true });
    const result = await scanRa(ship, [OTHER]);
    expect(result.scanRender?.sidePanel).toBeUndefined();
  });
});
