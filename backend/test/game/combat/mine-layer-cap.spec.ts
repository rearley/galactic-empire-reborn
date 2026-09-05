/**
 * `laymine()` caps EVERY layer at USRMINES, not just players.
 *
 *     cnt = 0;
 *     for (i=0; i<nummines;++i)
 *         if (mines[i].channel == (byte)usrn) cnt++;
 *     if (cnt >= usermines) return(0);
 *
 * (GECMDS.C:1794-1802.) That check is the first thing the function does, above
 * the free-slot scan, and droids (GEDROIDS.C:512) and Cybertrons (GECYBS.C:315,
 * :632) reach it through the same function players do.
 *
 * We enforced it in the player's command handler only. The AI was uncapped, so
 * one droid could hold all twelve slots of a galaxy-wide table and every
 * captain alive would meet MINE2 — the crowding question raised in
 * docs/PROGRESS.md, with a canon defect underneath it rather than a balance
 * dial.
 */
import { MineRegistry } from '../../../src/game/combat/mine.registry';
import {
  MineRepository,
  MineLayerCapError,
  MineTableFullError,
  MineRefusedError,
} from '../../../src/game/combat/mine.repository';
import { USERMINES } from '../../../src/game/constants';
import type { PrismaService } from '../../../src/prisma/prisma.service';

function build() {
  const registry = new MineRegistry();
  let nextId = 1;
  const created: unknown[] = [];
  const prisma = {
    mine: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return Promise.resolve({ id: nextId++, ...data });
      }),
    },
  } as unknown as PrismaService;
  return { registry, prisma, created, repo: new MineRepository(prisma, registry) };
}

/** Lay one mine and file it in the registry, exactly as every caller does. */
async function lay(
  h: ReturnType<typeof build>,
  deployedBy: string,
): Promise<void> {
  const m = await h.repo.create({ channel: 1, timer: 10, xcoord: 0, ycoord: 0, deployedBy });
  h.registry.add({ ...m, deployedBy });
}

describe('per-layer mine cap (USRMINES)', () => {
  it('refuses a layer already holding USRMINES mines', async () => {
    const h = build();
    for (let i = 0; i < USERMINES; i++) await lay(h, '@Droid-1');

    await expect(lay(h, '@Droid-1')).rejects.toBeInstanceOf(MineLayerCapError);
    expect(h.created).toHaveLength(USERMINES);
  });

  it('writes no row when it refuses — a refused lay costs nothing', async () => {
    const h = build();
    for (let i = 0; i < USERMINES; i++) await lay(h, 'Cybrg-1');
    const rowsBefore = h.created.length;

    await expect(lay(h, 'Cybrg-1')).rejects.toThrow();
    expect(h.created).toHaveLength(rowsBefore);
  });

  it('caps each layer independently — a full droid does not block a captain', async () => {
    const h = build();
    for (let i = 0; i < USERMINES; i++) await lay(h, '@Droid-1');

    await expect(lay(h, 'rick')).resolves.toBeUndefined();
  });

  it('checks the layer cap BEFORE the free-slot scan, as canon does', async () => {
    // Fill the galaxy table with OTHER layers, then have a capped layer ask.
    // Both refusals are legal here; canon's order decides which one you get.
    const h = build();
    for (let i = 0; i < USERMINES; i++) await lay(h, '@Droid-9');
    let filler = 0;
    while (!h.registry.isFull()) await lay(h, `filler-${filler++}`);

    await expect(lay(h, '@Droid-9')).rejects.toBeInstanceOf(MineLayerCapError);
  });

  it('still reports a full galaxy table for a layer under its own cap', async () => {
    const h = build();
    let filler = 0;
    while (!h.registry.isFull()) await lay(h, `filler-${filler++}`);

    await expect(lay(h, 'rick')).rejects.toBeInstanceOf(MineTableFullError);
  });

  it('both refusals share a base class, because canon draws no distinction', () => {
    // Every caller catches MineRefusedError; C returns 0 for both and the
    // caller prints the one message, MINE2.
    expect(new MineLayerCapError(3)).toBeInstanceOf(MineRefusedError);
    expect(new MineTableFullError(12)).toBeInstanceOf(MineRefusedError);
  });
});
