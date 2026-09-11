import { WormholeRepository } from '../../../src/game/galaxy/wormhole.repository';

/**
 * Each method mirrors the exact query it is scaffolded from — same `where`,
 * `select` and verb as the call site it is meant to eventually replace.
 * @see orbit.handler.ts isSectorWormhole, scan-planet.ts findSectorWormhole
 *   and the `sca pl` visible-listing, galaxy.service.ts hydrate()
 */
describe('WormholeRepository', () => {
  it('reports whether a sector slot is a wormhole, selecting only plnum', async () => {
    const findFirst = vi.fn().mockResolvedValue({ plnum: 2 });
    const repo = new WormholeRepository({ wormhole: { findFirst } } as never);

    const result = await repo.existsInSector(3, -1, 2);

    expect(findFirst).toHaveBeenCalledWith({
      where: { xsect: 3, ysect: -1, plnum: 2 },
      select: { plnum: true },
    });
    expect(result).toBe(true);
  });

  it('is false when no wormhole occupies the slot', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const repo = new WormholeRepository({ wormhole: { findFirst } } as never);

    await expect(repo.existsInSector(0, 0, 1)).resolves.toBe(false);
  });

  it('finds a sector wormhole by coordinates, selecting position and name', async () => {
    const findFirst = vi.fn().mockResolvedValue({ xcoord: 1.5, ycoord: 2.5, name: 'Rift' });
    const repo = new WormholeRepository({ wormhole: { findFirst } } as never);

    const result = await repo.findSectorWormhole(3, -1, 2);

    expect(findFirst).toHaveBeenCalledWith({
      where: { xsect: 3, ysect: -1, plnum: 2 },
      select: { xcoord: true, ycoord: true, name: true },
    });
    expect(result).toEqual({ xcoord: 1.5, ycoord: 2.5, name: 'Rift' });
  });

  it('lists visible wormholes in a sector, selecting plnum and name only', async () => {
    const findMany = vi.fn().mockResolvedValue([{ plnum: 4, name: 'Rift' }]);
    const repo = new WormholeRepository({ wormhole: { findMany } } as never);

    await repo.findVisibleInSector(3, -1);

    expect(findMany).toHaveBeenCalledWith({
      where: { xsect: 3, ysect: -1, visible: 1 },
      select: { plnum: true, name: true },
    });
  });

  it('reads every wormhole with no where and no select, for galaxy hydration', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const repo = new WormholeRepository({ wormhole: { findMany } } as never);

    await repo.findAll();

    expect(findMany).toHaveBeenCalledWith();
  });
});
