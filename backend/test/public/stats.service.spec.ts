import { StatsService } from '../../src/public/stats.service';
import { PresenceService } from '../../src/public/presence.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { UserRepository } from '../../src/game/player/user.repository';

function makeService(rows: unknown[], commanderCount: number) {
  const findMany = vi.fn().mockResolvedValue(rows);
  const count = vi.fn().mockResolvedValue(commanderCount);
  const prisma = { user: { findMany, count } } as unknown as PrismaService;
  const presence = new PresenceService();
  return { svc: new StatsService(new UserRepository(prisma), presence), findMany, count, presence };
}

const RICK = { userid: 'usr_rick', username: 'rick', score: 15345n, kills: 31, planets: 3, population: 0n };
const VRASK = { userid: 'usr_v', username: 'vraskcmdr', score: 900n, kills: 2, planets: 0, population: 0n };

describe('getStats', () => {
  it('counts only accounts a human could log into', async () => {
    // 24 of 33 User rows are Cybertrons (Cybrg-200..223) with a null
    // passwordHash. Counting the table reports 33 players and is a lie.
    const { svc, count } = makeService([], 9);
    const stats = await svc.getStats();

    expect(stats.commanders).toBe(9);
    expect(count).toHaveBeenCalledWith({ where: { passwordHash: { not: null } } });
  });

  it('applies canon roster selection so AI can never reach the board', async () => {
    const { svc, findMany } = makeService([RICK], 9);
    await svc.getStats();

    const arg = findMany.mock.calls[0][0];
    const json = JSON.stringify(arg.where, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
    expect(json).toContain('Cybrg-');
    expect(arg.where.score).toEqual({ gt: 0n });
    expect(arg.orderBy).toEqual([{ score: 'desc' }, { kills: 'desc' }, { userid: 'asc' }]);
  });

  it('ranks from list order and serialises score as a string', async () => {
    // BigInt does not survive JSON.stringify — it throws. The endpoint would
    // 500 on the first player with a score.
    const { svc } = makeService([RICK, VRASK], 9);
    const stats = await svc.getStats();

    expect(stats.roster).toEqual([
      { rank: 1, username: 'rick', score: '15345', kills: 31, planets: 3 },
      { rank: 2, username: 'vraskcmdr', score: '900', kills: 2, planets: 0 },
    ]);
    expect(() => JSON.stringify(stats)).not.toThrow();
  });

  it('reports live presence', async () => {
    const { svc, presence } = makeService([], 9);
    presence.arrive('usr_rick');
    expect((await svc.getStats()).online).toBe(1);
  });

  it('serves a second call from cache without re-querying', async () => {
    // The endpoint is public and unauthenticated, and the page polls it. The
    // cache is the entire abuse story.
    const { svc, findMany, count } = makeService([RICK], 9);
    await svc.getStats();
    await svc.getStats();

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(count).toHaveBeenCalledTimes(1);
  });

  it('re-queries once the cache expires', async () => {
    const { svc, findMany } = makeService([RICK], 9);
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(1_000_000);
    await svc.getStats();
    now.mockReturnValue(1_000_000 + 15_001);
    await svc.getStats();

    expect(findMany).toHaveBeenCalledTimes(2);
    now.mockRestore();
  });

  it('reports live presence even on a cached read', async () => {
    // Online-now is the number that makes the page feel alive; freezing it for
    // 15 seconds is the one thing the cache must not do.
    const { svc, presence } = makeService([RICK], 9);
    await svc.getStats();
    presence.arrive('usr_rick');
    expect((await svc.getStats()).online).toBe(1);
  });

  it('falls back to userid when a scoring account has no username', async () => {
    const { svc } = makeService([{ ...RICK, username: null }], 9);
    expect((await svc.getStats()).roster[0].username).toBe('usr_rick');
  });

  // ── Finding 5 (final whole-branch review, 2026-09-07) ──────────────────
  //
  // `this.cached` was assigned AFTER the `await`, so N concurrent requests
  // arriving in a cold window each ran both queries — the 15-second cache
  // is not "the entire abuse story" for a public, unauthenticated endpoint
  // hit by a page that polls. The fix caches the in-flight PROMISE, not the
  // resolved value, so concurrent callers share one query.

  it('deduplicates concurrent cold calls into a single pair of queries', async () => {
    let resolveCount!: (v: number) => void;
    let resolveFindMany!: (v: unknown[]) => void;
    const countPromise = new Promise<number>((r) => { resolveCount = r; });
    const findManyPromise = new Promise<unknown[]>((r) => { resolveFindMany = r; });
    const count = vi.fn().mockReturnValue(countPromise);
    const findMany = vi.fn().mockReturnValue(findManyPromise);
    const prisma = { user: { count, findMany } } as unknown as PrismaService;
    const svc = new StatsService(new UserRepository(prisma), new PresenceService());

    // Two callers arrive before either query has resolved.
    const p1 = svc.getStats();
    const p2 = svc.getStats();

    resolveCount(9);
    resolveFindMany([RICK]);
    const [s1, s2] = await Promise.all([p1, p2]);

    expect(count).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(s1.commanders).toBe(9);
    expect(s2.commanders).toBe(9);
  });

  it('does not cache a rejected query — a later call retries instead of failing for 15s', async () => {
    const findMany = vi.fn()
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValueOnce([RICK]);
    const count = vi.fn().mockResolvedValue(9);
    const prisma = { user: { findMany, count } } as unknown as PrismaService;
    const svc = new StatsService(new UserRepository(prisma), new PresenceService());

    await expect(svc.getStats()).rejects.toThrow('db down');

    const stats = await svc.getStats();
    expect(stats.roster[0].username).toBe('rick');
    expect(findMany).toHaveBeenCalledTimes(2);
  });
});
