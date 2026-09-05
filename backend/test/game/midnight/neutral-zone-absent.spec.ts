/**
 * The nightly neutral-zone restock must not be able to abort midnight.
 *
 * It used `update` on the two fixed shop coordinates. In a galaxy generated
 * without a neutral zone the record is absent, Prisma throws `Record to update
 * not found`, and because the restock runs inside the nightly `$transaction`
 * that single throw rolls back scoring, production and mail as well — the whole
 * pass lost over two missing planets. @see GEMAIN.C:2145-2178
 */
import { MidnightRepository } from '../../../src/game/midnight/midnight.repository';

type UpdateManyArgs = { where: { xsect: number; ysect: number; plnum: number } };

function txWith(present: number[]) {
  const calls: UpdateManyArgs[] = [];
  const tx = {
    planet: {
      update: () => { throw new Error('refreshNeutralZone must not use update()'); },
      updateMany: (args: UpdateManyArgs) => {
        calls.push(args);
        return Promise.resolve({ count: present.includes(args.where.plnum) ? 1 : 0 });
      },
    },
  };
  return { tx, calls };
}

describe('refreshNeutralZone with planets missing', () => {
  const repo = new MidnightRepository(null as never);

  it('restocks both shops when the neutral zone is present', async () => {
    const { tx, calls } = txWith([1, 2]);
    await expect(repo.refreshNeutralZone(tx as never)).resolves.toBeUndefined();
    expect(calls.map((c) => c.where.plnum)).toEqual([1, 2]);
  });

  it('is a no-op, not a throw, when neither shop exists', async () => {
    const { tx } = txWith([]);
    await expect(repo.refreshNeutralZone(tx as never)).resolves.toBeUndefined();
  });

  it('still restocks Tahanian Station when only Zygor is missing', async () => {
    // The old code threw on Zygor and never reached the second update, so a
    // half-present neutral zone lost the restock it could have done.
    const { tx, calls } = txWith([2]);
    await expect(repo.refreshNeutralZone(tx as never)).resolves.toBeUndefined();
    expect(calls.map((c) => c.where.plnum)).toEqual([1, 2]);
  });
});
