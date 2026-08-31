import { PlanetStateService } from '../../src/game/planet/planet-state.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ShipStateService } from '../../src/game/ship/ship-state.service';

/**
 * `sca pl` used to read GalaxyService's planet read-model, which hydrates once
 * at boot (`GalaxyService.hydrate`) and is never refreshed. A planet claimed
 * since startup therefore still listed as "(unnamed)" with no owner: players
 * scanned a sector, picked what looked like a free planet, flew to it, and only
 * discovered it was taken when the landing was refused. Claim and land read the
 * live PlanetStateService map, so the two disagreed.
 *
 * These cover the live views the scan now uses.
 */
describe('PlanetStateService — the live view scans read', () => {
  let planets: PlanetStateService;

  beforeEach(async () => {
    const rows = [
      { xsect: 1, ysect: 2, plnum: 2, name: 'Bravo', userid: 'alice' },
      { xsect: 1, ysect: 2, plnum: 1, name: '', userid: null },
      { xsect: 9, ysect: 9, plnum: 1, name: 'Elsewhere', userid: 'bob' },
    ].map((r) => ({
      ...r, type: 1, xcoord: r.xsect + 0.5, ycoord: r.ysect + 0.5,
      enviorn: 2, resource: 2, cash: 0n, debt: 0n, tax: 0n, taxrate: 0,
      warnings: 0, password: 'none', lastattack: '', beacon: '', spyowner: '',
      technology: 0, teamcode: 0n,
      itemsQty: [], itemsRate: [], itemsSell: [], itemsReserve: [],
      itemsMarkup2a: [], itemsSold2a: [],
    }));

    const prisma = {
      planet: { findMany: jest.fn().mockResolvedValue(rows), update: jest.fn().mockResolvedValue({}) },
      planetItem: { findMany: jest.fn().mockResolvedValue([]) },
      user: { update: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({}) },
    } as unknown as PrismaService;
    const ships = { findAllShips: jest.fn().mockReturnValue([]) } as unknown as ShipStateService;

    planets = new PlanetStateService(prisma, ships);
    await planets.onModuleInit();
  });

  it('lists a sector\'s planets in plnum order', () => {
    expect(planets.bySector(1, 2).map((p) => p.plnum)).toEqual([1, 2]);
  });

  it('returns an empty list for a sector with no planets', () => {
    expect(planets.bySector(4, 4)).toEqual([]);
  });

  it('reports the current owner, so a claimed planet stops looking free', async () => {
    expect(planets.bySector(1, 2).find((p) => p.plnum === 1)!.userid).toBeNull();

    await planets.claim(1, 2, 1, 'carol', 'New Terra');

    const after = planets.bySector(1, 2).find((p) => p.plnum === 1)!;
    expect(after.userid).toBe('carol');
    expect(after.name).toBe('New Terra');
  });

  it('finds a planet by name across sectors, case-insensitively', () => {
    expect(planets.byName('elsewhere')?.plnum).toBe(1);
    expect(planets.byName('  BRAVO ')?.name).toBe('Bravo');
  });

  it('returns undefined for an unknown or blank name', () => {
    expect(planets.byName('Nowhere')).toBeUndefined();
    expect(planets.byName('   ')).toBeUndefined();
  });
});
