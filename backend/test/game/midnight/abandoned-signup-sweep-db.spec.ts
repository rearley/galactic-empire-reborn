/**
 * Integration test for `MidnightRepository.purgeAbandonedSignups` against a
 * real Postgres instance (the `ge_test` database, never the dev database).
 *
 * The unit test in abandoned-signup-sweep.spec.ts asserts on the `where`
 * object passed to Prisma's mocked `deleteMany` — it proves we built the
 * predicate we meant to build, but not that Prisma renders `username: null`
 * as SQL `IS NULL` (matching abandoned rows) rather than `= NULL` (matching
 * nothing, in which case this job would silently do nothing forever). This
 * test exercises the real query engine against real rows to close that gap.
 *
 * Follows the pattern in test/prisma-schema/ (a PrismaClient pointed at
 * TEST_DATABASE_URL, schema pushed once by the shared jest globalSetup) since
 * there is no existing repository-level DB test elsewhere in the suite.
 */
import { PrismaClient } from '../../../src/prisma/client';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { MidnightRepository } from '../../../src/game/midnight/midnight.repository';
import { ABANDONED_SIGNUP_DAYS } from '../../../src/game/midnight/midnight.constants';
import { makePrismaClient } from '../../helpers/make-prisma-client';

const prisma = makePrismaClient(process.env.TEST_DATABASE_URL);

// Unmistakably synthetic identifiers, scoped to this spec so cleanup can
// target them precisely without relying on another file's truncateAll().
const PREFIX = 'sweep_db_test_';
const ABANDONED_OLD = `${PREFIX}abandoned_old`;
const ABANDONED_NEW = `${PREFIX}abandoned_new`;
const REGISTERED_ANCIENT = `${PREFIX}registered_ancient`;
const CYBERTRON_SHAPED = `${PREFIX}cybertron_shaped`;

const ALL_TEST_USERIDS = [ABANDONED_OLD, ABANDONED_NEW, REGISTERED_ANCIENT, CYBERTRON_SHAPED];

const NOW = new Date('2026-09-07T00:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

async function cleanupFixtures(): Promise<void> {
  await prisma.user.deleteMany({ where: { userid: { in: ALL_TEST_USERIDS } } });
}

afterAll(async () => {
  await cleanupFixtures();
  await prisma.$disconnect();
});

describe('purgeAbandonedSignups — real Postgres', () => {
  it('deletes only the abandoned row past the cutoff, and leaves every survivor untouched', async () => {
    await cleanupFixtures();

    await prisma.user.createMany({
      data: [
        {
          // 1. Abandoned, older than the cutoff — MUST be deleted.
          userid: ABANDONED_OLD,
          username: null,
          passwordHash: 'hash',
          email: `${ABANDONED_OLD}@example.test`,
          createdAt: daysAgo(ABANDONED_SIGNUP_DAYS + 1),
          options: [],
        },
        {
          // 2. Abandoned, but not yet 10 days old — MUST survive.
          userid: ABANDONED_NEW,
          username: null,
          passwordHash: 'hash',
          email: `${ABANDONED_NEW}@example.test`,
          createdAt: daysAgo(ABANDONED_SIGNUP_DAYS - 1),
          options: [],
        },
        {
          // 3. Fully registered, ancient createdAt — MUST survive. This is
          // the safety property: a real player is unreachable at any age
          // because their username is non-null.
          userid: REGISTERED_ANCIENT,
          username: 'RealPlayerHandle',
          passwordHash: 'hash',
          email: `${REGISTERED_ANCIENT}@example.test`,
          createdAt: daysAgo(365),
          options: [],
        },
        {
          // 4. Cybertron-shaped: NULL passwordHash, a non-null username, an
          // old createdAt — MUST survive because passwordHash IS NOT NULL
          // excludes it.
          userid: CYBERTRON_SHAPED,
          username: 'Cybrg-999',
          passwordHash: null,
          email: null,
          createdAt: daysAgo(365),
          options: [],
        },
      ],
    });

    const repo = new MidnightRepository({} as PrismaService);
    const deletedCount = await repo.purgeAbandonedSignups(prisma, ABANDONED_SIGNUP_DAYS, NOW);

    expect(deletedCount).toBe(1);

    const deleted = await prisma.user.findUnique({ where: { userid: ABANDONED_OLD } });
    expect(deleted).toBeNull();

    const stillAbandonedButYoung = await prisma.user.findUnique({ where: { userid: ABANDONED_NEW } });
    expect(stillAbandonedButYoung).not.toBeNull();
    expect(stillAbandonedButYoung?.username).toBeNull();

    const registered = await prisma.user.findUnique({ where: { userid: REGISTERED_ANCIENT } });
    expect(registered).not.toBeNull();
    expect(registered?.username).toBe('RealPlayerHandle');

    const cybertron = await prisma.user.findUnique({ where: { userid: CYBERTRON_SHAPED } });
    expect(cybertron).not.toBeNull();
    expect(cybertron?.passwordHash).toBeNull();

    await cleanupFixtures();
  });
});
