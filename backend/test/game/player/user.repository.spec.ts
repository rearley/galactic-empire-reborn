import { UserRepository } from '../../../src/game/player/user.repository';
import { ROSTER_WHERE, ROSTER_ORDER_BY } from '../../../src/game/player/roster-query';

/**
 * These cases assert the QUERY, not the answer.
 *
 * `UserRepository` exists to move `prisma.user.*` behind a named boundary
 * without changing a single statement that reaches Postgres. A dropped `select`
 * field or a widened `where` is invisible in the callers' diffs, so the shape of
 * each call is pinned here against the call site it replaced.
 */
describe('UserRepository', () => {
  const makeRepo = (delegate: Record<string, jest.Mock>) =>
    new UserRepository({ user: delegate } as never);

  describe('cash reads', () => {
    it('reads cash with a narrow select, not the whole row', async () => {
      const findUnique = jest.fn().mockResolvedValue({ cash: 500n });
      const repo = makeRepo({ findUnique });

      await expect(repo.getCash('usr_a')).resolves.toBe(500n);
      expect(findUnique).toHaveBeenCalledWith({
        where: { userid: 'usr_a' },
        select: { cash: true },
      });
    });

    it('returns null when the account is gone, rather than throwing', async () => {
      const findUnique = jest.fn().mockResolvedValue(null);
      const repo = makeRepo({ findUnique });
      await expect(repo.getCash('usr_missing')).resolves.toBeNull();
    });

    it('reads cash alongside the fleet counters in one row', async () => {
      const findUnique = jest.fn().mockResolvedValue({ cash: 1n, noships: 2, topshipno: 7 });
      const repo = makeRepo({ findUnique });

      await expect(repo.getCashAndFleet('usr_a')).resolves.toEqual({ cash: 1n, noships: 2, topshipno: 7 });
      expect(findUnique).toHaveBeenCalledWith({
        where: { userid: 'usr_a' },
        select: { cash: true, noships: true, topshipno: true },
      });
    });

    it('reads topshipno on its own for the onboarding allocator', async () => {
      const findUnique = jest.fn().mockResolvedValue({ topshipno: 5 });
      const repo = makeRepo({ findUnique });

      await expect(repo.getTopshipno('usr_a')).resolves.toBe(5);
      expect(findUnique).toHaveBeenCalledWith({
        where: { userid: 'usr_a' },
        select: { topshipno: true },
      });
    });
  });

  describe('profile reads', () => {
    it('reads the five columns `rep acc` renders', async () => {
      const row = { cash: 1n, score: 2n, kills: 3, planets: 4, teamcode: 5n };
      const findUnique = jest.fn().mockResolvedValue(row);
      const repo = makeRepo({ findUnique });

      await expect(repo.getAccountSummary('usr_a')).resolves.toEqual(row);
      expect(findUnique).toHaveBeenCalledWith({
        where: { userid: 'usr_a' },
        select: { cash: true, score: true, kills: true, planets: true, teamcode: true },
      });
    });

    it('reads a display name only', async () => {
      const findUnique = jest.fn().mockResolvedValue({ username: 'Zaphod' });
      const repo = makeRepo({ findUnique });

      await expect(repo.getUsername('usr_a')).resolves.toBe('Zaphod');
      expect(findUnique).toHaveBeenCalledWith({
        where: { userid: 'usr_a' },
        select: { username: true },
      });
    });

    it('reports a missing account without loading a row', async () => {
      const findUnique = jest.fn().mockResolvedValue(null);
      const repo = makeRepo({ findUnique });

      await expect(repo.exists('usr_missing')).resolves.toBe(false);
      expect(findUnique).toHaveBeenCalledWith({
        where: { userid: 'usr_missing' },
        select: { userid: true },
      });
    });

    it('reads the five columns a reconnecting session rehydrates', async () => {
      const row = { teamcode: 1n, options: [1, 0, 0, 0], kills: 2, username: 'Ford', fkeys: ['sca'] };
      const findUnique = jest.fn().mockResolvedValue(row);
      const repo = makeRepo({ findUnique });

      await expect(repo.getSessionProfile('usr_a')).resolves.toEqual(row);
      expect(findUnique).toHaveBeenCalledWith({
        where: { userid: 'usr_a' },
        select: { teamcode: true, options: true, kills: true, username: true, fkeys: true },
      });
    });

    it('reads the option flag array', async () => {
      const findUnique = jest.fn().mockResolvedValue({ options: [0, 1] });
      const repo = makeRepo({ findUnique });

      await expect(repo.getOptions('usr_a')).resolves.toEqual([0, 1]);
      expect(findUnique).toHaveBeenCalledWith({
        where: { userid: 'usr_a' },
        select: { options: true },
      });
    });
  });

  describe('team reads', () => {
    it('reads a kick target as userid plus teamcode', async () => {
      const findUnique = jest.fn().mockResolvedValue({ userid: 'usr_b', teamcode: 3n });
      const repo = makeRepo({ findUnique });

      await expect(repo.findTeamMembership('usr_b')).resolves.toEqual({ userid: 'usr_b', teamcode: 3n });
      expect(findUnique).toHaveBeenCalledWith({
        where: { userid: 'usr_b' },
        select: { userid: true, teamcode: true },
      });
    });

    it('batches teamcodes for the live ship map', async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const repo = makeRepo({ findMany });

      await repo.findTeamcodesFor(['a', 'b']);
      expect(findMany).toHaveBeenCalledWith({
        where: { userid: { in: ['a', 'b'] } },
        select: { userid: true, teamcode: true },
      });
    });

    it('lists team members in userid order, capped', async () => {
      const findMany = jest.fn().mockResolvedValue([{ userid: 'a' }, { userid: 'b' }]);
      const repo = makeRepo({ findMany });

      await expect(repo.listTeamMemberIds(9n, 20)).resolves.toEqual(['a', 'b']);
      expect(findMany).toHaveBeenCalledWith({
        where: { teamcode: 9n },
        select: { userid: true },
        orderBy: { userid: 'asc' },
        take: 20,
      });
    });
  });

  describe('roster reads', () => {
    it('runs canon’s board query, population included', async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const repo = makeRepo({ findMany });

      await repo.findRoster(10);
      expect(findMany).toHaveBeenCalledWith({
        where: ROSTER_WHERE,
        orderBy: ROSTER_ORDER_BY,
        take: 10,
        select: { userid: true, username: true, score: true, kills: true, planets: true, population: true },
      });
    });

    it('runs the public board query, which does not read population', async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const repo = makeRepo({ findMany });

      await repo.findPublicRoster(20);
      expect(findMany).toHaveBeenCalledWith({
        where: ROSTER_WHERE,
        orderBy: ROSTER_ORDER_BY,
        take: 20,
        select: { userid: true, username: true, score: true, kills: true, planets: true },
      });
    });

    it('counts only accounts that can actually log in', async () => {
      const count = jest.fn().mockResolvedValue(3);
      const repo = makeRepo({ count });

      await expect(repo.countRegistered()).resolves.toBe(3);
      expect(count).toHaveBeenCalledWith({ where: { passwordHash: { not: null } } });
    });
  });

  describe('cash writes', () => {
    it('credits cash with an atomic increment', async () => {
      const update = jest.fn().mockResolvedValue({});
      const repo = makeRepo({ update });

      await repo.addCash('usr_a', 250n);
      expect(update).toHaveBeenCalledWith({
        where: { userid: 'usr_a' },
        data: { cash: { increment: 250n } },
      });
    });

    it('debits only when the balance still covers it, and reports whether it moved', async () => {
      const updateMany = jest.fn().mockResolvedValue({ count: 1 });
      const repo = makeRepo({ updateMany });

      await expect(repo.debitIfAffordable('usr_a', 100n)).resolves.toBe(true);
      expect(updateMany).toHaveBeenCalledWith({
        where: { userid: 'usr_a', cash: { gte: 100n } },
        data: { cash: { decrement: 100n } },
      });
    });

    it('reports a refused debit rather than throwing', async () => {
      const updateMany = jest.fn().mockResolvedValue({ count: 0 });
      const repo = makeRepo({ updateMany });
      await expect(repo.debitIfAffordable('usr_a', 100n)).resolves.toBe(false);
    });

    it('sets an absolute balance', async () => {
      const update = jest.fn().mockResolvedValue({});
      const repo = makeRepo({ update });

      await repo.setCash('usr_a', 0n);
      expect(update).toHaveBeenCalledWith({
        where: { userid: 'usr_a' },
        data: { cash: 0n },
      });
    });

    it('charges a shipyard upgrade as a decrement', async () => {
      const update = jest.fn().mockResolvedValue({});
      const repo = makeRepo({ update });

      await repo.applyUpgradeCharge('usr_a', 1000n, 0n);
      expect(update).toHaveBeenCalledWith({
        where: { userid: 'usr_a' },
        data: { cash: { decrement: 1000n } },
      });
    });

    it('pays a downgrade back as an increment', async () => {
      const update = jest.fn().mockResolvedValue({});
      const repo = makeRepo({ update });

      await repo.applyUpgradeCharge('usr_a', 0n, 500n);
      expect(update).toHaveBeenCalledWith({
        where: { userid: 'usr_a' },
        data: { cash: { increment: 500n } },
      });
    });
  });

  describe('other writes', () => {
    it('joins a team by writing the teamcode', async () => {
      const update = jest.fn().mockResolvedValue({});
      const repo = makeRepo({ update });

      await repo.setTeamcode('usr_a', 4n);
      expect(update).toHaveBeenCalledWith({
        where: { userid: 'usr_a' },
        data: { teamcode: 4n },
      });
    });

    it('leaves a team by nulling the teamcode', async () => {
      const update = jest.fn().mockResolvedValue({});
      const repo = makeRepo({ update });

      await repo.setTeamcode('usr_a', null);
      expect(update).toHaveBeenCalledWith({
        where: { userid: 'usr_a' },
        data: { teamcode: null },
      });
    });

    it('writes the whole option array back', async () => {
      const update = jest.fn().mockResolvedValue({});
      const repo = makeRepo({ update });

      await repo.setOptions('usr_a', [1, 0, 0, 0]);
      expect(update).toHaveBeenCalledWith({
        where: { userid: 'usr_a' },
        data: { options: [1, 0, 0, 0] },
      });
    });

    it('writes the whole fkey array back', async () => {
      const update = jest.fn().mockResolvedValue({});
      const repo = makeRepo({ update });

      await repo.setFkeys('usr_a', ['sca', '']);
      expect(update).toHaveBeenCalledWith({
        where: { userid: 'usr_a' },
        data: { fkeys: ['sca', ''] },
      });
    });

    it('increments the planet counter on a row that must exist', async () => {
      const update = jest.fn().mockResolvedValue({});
      const repo = makeRepo({ update });

      await repo.incrementPlanets('usr_a');
      expect(update).toHaveBeenCalledWith({
        where: { userid: 'usr_a' },
        data: { planets: { increment: 1 } },
      });
    });

    it('increments the planet counter tolerantly on claim', async () => {
      const updateMany = jest.fn().mockResolvedValue({ count: 1 });
      const repo = makeRepo({ updateMany });

      await repo.incrementPlanetsIfPresent('usr_a');
      expect(updateMany).toHaveBeenCalledWith({
        where: { userid: 'usr_a' },
        data: { planets: { increment: 1 } },
      });
    });

    it('decrements the planet counter only while it is above zero', async () => {
      const updateMany = jest.fn().mockResolvedValue({ count: 1 });
      const repo = makeRepo({ updateMany });

      await repo.decrementPlanetsIfPositive('usr_a');
      expect(updateMany).toHaveBeenCalledWith({
        where: { userid: 'usr_a', planets: { gt: 0 } },
        data: { planets: { decrement: 1 } },
      });
    });

    it('applies the onboarding grant exactly as composed by the caller', async () => {
      const update = jest.fn().mockResolvedValue({});
      const repo = makeRepo({ update });

      await repo.applyOnboardingGrant('usr_a', { cash: 1000n, noships: 1, topshipno: 1 });
      expect(update).toHaveBeenCalledWith({
        where: { userid: 'usr_a' },
        data: { cash: 1000n, noships: 1, topshipno: 1 },
      });
    });
  });
});
