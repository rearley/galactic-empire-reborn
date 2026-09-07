import { MidnightRepository } from '../../../src/game/midnight/midnight.repository';
import { ABANDONED_SIGNUP_DAYS } from '../../../src/game/midnight/midnight.constants';
import { PrismaService } from '../../../src/prisma/prisma.service';

function makeRepo() {
  const deleteMany = jest.fn().mockResolvedValue({ count: 0 });
  const tx = { user: { deleteMany } } as never;
  return { repo: new MidnightRepository({} as PrismaService), tx, deleteMany };
}

const NOW = new Date('2026-09-07T00:00:00Z');

describe('purgeAbandonedSignups', () => {
  it('deletes only rows with credentials, no username, and age past the cutoff', async () => {
    const { repo, tx, deleteMany } = makeRepo();
    await repo.purgeAbandonedSignups(tx, ABANDONED_SIGNUP_DAYS, NOW);

    const where = deleteMany.mock.calls[0][0].where;

    // All three conditions are load-bearing. passwordHash keeps the sweep off
    // the 24 Cybertron rows; the null username is what marks the row abandoned
    // mid-signup and makes a real player unreachable by this code at any age.
    expect(where.passwordHash).toEqual({ not: null });
    expect(where.username).toBeNull();
    expect(where.createdAt.lt).toEqual(new Date('2026-08-28T00:00:00Z'));
  });

  it('uses a 10-day threshold', () => {
    expect(ABANDONED_SIGNUP_DAYS).toBe(10);
  });

  it('returns how many it deleted', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 4 });
    const tx = { user: { deleteMany } } as never;
    expect(await new MidnightRepository({} as PrismaService).purgeAbandonedSignups(tx, 10, NOW)).toBe(4);
  });

  it('is idempotent — a second run finds nothing left', async () => {
    const deleteMany = jest.fn()
      .mockResolvedValueOnce({ count: 4 })
      .mockResolvedValueOnce({ count: 0 });
    const tx = { user: { deleteMany } } as never;
    const repo = new MidnightRepository({} as PrismaService);

    expect(await repo.purgeAbandonedSignups(tx, 10, NOW)).toBe(4);
    expect(await repo.purgeAbandonedSignups(tx, 10, NOW)).toBe(0);
  });
});
