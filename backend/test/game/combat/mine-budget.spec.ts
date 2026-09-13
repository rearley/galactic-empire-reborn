import { MineRegistry, MineState } from '../../../src/game/combat/mine.registry';
import { MineRepository, MineTableFullError } from '../../../src/game/combat/mine.repository';
import { SYSOP_OPTIONS, resolveGameConfig } from '../../../src/game/config/game-config';

/**
 * NUMMINES — the GALAXY-WIDE mine budget, distinct from the per-user USRMINES cap.
 *
 * The original allocates ONE mine table of `nummines` slots for the whole
 * universe (`mines = (MINE *)alcmem(n=nummines*sizeof(MINE));`,
 * GEMAIN.C:754, sized by `nummines = numopt(NUMMINES,1,200);` GEMAIN.C:501)
 * and every mine operation walks `i<nummines` over it. `laymine()` first
 * counts the layer's own mines against `usermines` and returns 0 if they are
 * at their personal cap, then scans for a free slot and returns 0 if the table
 * has none (GECMDS.C:1785-1819). On either failure the caller prints MINE2 and
 * the mine is NOT spent: the `--ptr->items[I_MINE]` and `cantexit` writes live
 * inside the success branch (GECMDS.C:1809-1814).
 *
 * The port had no galaxy-wide table at all, so with the shipped NUMMINES=12
 * and USRMINES=3 five players could field 15 mines where the original allows
 * twelve.
 */
function mine(over: Partial<MineState> = {}): MineState {
  return { id: 1, channel: 1, timer: 100, xcoord: 0, ycoord: 0, deployedBy: 'u1', ...over };
}

describe('NUMMINES — galaxy-wide mine budget', () => {
  it('is declared as a wired option, not a recorded gap', () => {
    expect(SYSOP_OPTIONS.NUMMINES.implemented).toBe(true);
    expect(SYSOP_OPTIONS.NUMMINES.canonDefault).toBe(12);
  });

  it('sizes the registry from the resolved config', () => {
    expect(new MineRegistry().capacity).toBe(resolveGameConfig().NUMMINES);
  });

  it('refuses a mine once every slot in the table is taken', () => {
    const reg = new MineRegistry();
    const n = reg.capacity;
    // Spread across many deployers so USRMINES is never the binding limit.
    for (let i = 0; i < n; i++) {
      expect(reg.add(mine({ id: i, deployedBy: `u${i}` }))).toBe(true);
    }
    expect(reg.isFull()).toBe(true);
    expect(reg.add(mine({ id: n + 1, deployedBy: 'late' }))).toBe(false);
    expect(reg.getAll()).toHaveLength(n);
  });

  it('frees the slot again when a mine is removed', () => {
    const reg = new MineRegistry();
    for (let i = 0; i < reg.capacity; i++) reg.add(mine({ id: i, deployedBy: `u${i}` }));
    reg.remove(0);
    expect(reg.isFull()).toBe(false);
    expect(reg.add(mine({ id: 9999, deployedBy: 'late' }))).toBe(true);
  });

  it('updating a mine already in the table is not a new allocation', () => {
    const reg = new MineRegistry();
    for (let i = 0; i < reg.capacity; i++) reg.add(mine({ id: i, deployedBy: `u${i}` }));
    expect(reg.add(mine({ id: 0, deployedBy: 'u0', timer: 4 }))).toBe(true);
    expect(reg.getAll().find((m) => m.id === 0)!.timer).toBe(4);
  });

  it('hydrate() does not drop persisted mines that overflow a lowered budget', () => {
    // A sysop who lowers NUMMINES must not silently lose mines already on the
    // board; the table simply refuses new ones until it drains.
    const reg = new MineRegistry();
    const over = Array.from({ length: reg.capacity + 3 }, (_, i) => mine({ id: i }));
    reg.hydrate(over);
    expect(reg.getAll()).toHaveLength(reg.capacity + 3);
    expect(reg.isFull()).toBe(true);
  });
});

describe('MineRepository — the budget is enforced before anything is spent', () => {
  const prisma = { mine: { create: vi.fn() } };

  beforeEach(() => prisma.mine.create.mockReset());

  it('does not write a row when the galaxy table is full', async () => {
    const reg = new MineRegistry();
    for (let i = 0; i < reg.capacity; i++) reg.add(mine({ id: i, deployedBy: `u${i}` }));

    const repo = new MineRepository(prisma as never, reg);
    await expect(
      repo.create({ channel: 1, timer: 30, xcoord: 0, ycoord: 0, deployedBy: 'late' }),
    ).rejects.toBeInstanceOf(MineTableFullError);
    expect(prisma.mine.create).not.toHaveBeenCalled();
  });

  it('writes normally while a slot remains', async () => {
    const reg = new MineRegistry();
    prisma.mine.create.mockResolvedValue({ id: 1 });
    const repo = new MineRepository(prisma as never, reg);
    await repo.create({ channel: 1, timer: 30, xcoord: 0, ycoord: 0, deployedBy: 'u1' });
    expect(prisma.mine.create).toHaveBeenCalledTimes(1);
  });
});
