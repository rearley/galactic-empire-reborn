import { PrismaClient } from '../../src/prisma/client';
import fs from 'fs';
import path from 'path';
import { makePrismaClient } from '../helpers/make-prisma-client';

const prisma = makePrismaClient(process.env.TEST_DATABASE_URL);

/** Sentinel used to force a transaction rollback after assertions. */
class Rollback extends Error {}

const MIGRATION_SQL = path.resolve(
  __dirname,
  '../../prisma/migrations/20260626184027_multi_ship/migration.sql',
);

describe('multi-ship schema', () => {
  const uid = 'mship_test_user';
  afterAll(async () => {
    await prisma.ship.deleteMany({ where: { userid: uid } });
    await prisma.user.deleteMany({ where: { userid: uid } });
    await prisma.$disconnect();
  });

  it('allows multiple ships per userid (no unique constraint)', async () => {
    await prisma.user.create({ data: { userid: uid, username: uid, cash: 0n } });
    await prisma.ship.create({ data: { userid: uid, shipno: 1, shipname: 'A', shpclass: 1, status: 1 } });
    await expect(
      prisma.ship.create({ data: { userid: uid, shipno: 2, shipname: 'B', shpclass: 1, status: 0 } }),
    ).resolves.toBeDefined(); // would throw P2002 under @@unique([userid])
    const count = await prisma.ship.count({ where: { userid: uid } });
    expect(count).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// P-007 final-review fix 3: cover the migration's backfill UPDATE + the
// DROP CONSTRAINT, which globalSetup (prisma db push) never exercises.
// ---------------------------------------------------------------------------

describe('multi-ship migration — backfill UPDATE (real SQL from migration.sql)', () => {
  const uid = 'mship_backfill_user';
  const sql = fs.readFileSync(MIGRATION_SQL, 'utf8');

  // Extract the actual backfill UPDATE statement (verbatim) from the committed file.
  const backfillMatch = sql.match(/UPDATE "User"[\s\S]*?;/);
  const backfillStmt = backfillMatch ? backfillMatch[0] : '';

  it('committed migration.sql drops the one-ship-per-user constraint', () => {
    expect(sql).toContain('DROP CONSTRAINT "Ship_userid_key"');
  });

  it('committed migration.sql contains the noships/topshipno backfill UPDATE', () => {
    expect(backfillStmt).not.toBe('');
    expect(backfillStmt).toMatch(/UPDATE "User"/);
    expect(backfillStmt).toMatch(/"noships"/);
    expect(backfillStmt).toMatch(/"topshipno"/);
  });

  it('backfill UPDATE sets noships=COUNT and topshipno=MAX(shipno) for existing fleets', async () => {
    // Run the REAL backfill statement inside a transaction that rolls back, so it
    // is verified against a live DB without permanently mutating shared test data.
    await prisma
      .$transaction(async (tx) => {
        // User starts with the counters un-backfilled (0/0) and owns ships at
        // non-contiguous shipnos 1 and 3.
        await tx.user.create({ data: { userid: uid, username: uid, cash: 0n, noships: 0, topshipno: 0 } });
        await tx.ship.create({ data: { userid: uid, shipno: 1, shipname: 'One', shpclass: 1, status: 1 } });
        await tx.ship.create({ data: { userid: uid, shipno: 3, shipname: 'Three', shpclass: 1, status: 0 } });

        await tx.$executeRawUnsafe(backfillStmt);

        const u = await tx.user.findUnique({ where: { userid: uid }, select: { noships: true, topshipno: true } });
        expect(u?.noships).toBe(2);
        expect(u?.topshipno).toBe(3);

        throw new Rollback(); // discard all changes — keep shared test DB clean
      })
      .catch((err: unknown) => {
        if (!(err instanceof Rollback)) throw err;
      });

    // Confirm the rollback actually discarded the throwaway rows.
    const leftover = await prisma.user.findUnique({ where: { userid: uid } });
    expect(leftover).toBeNull();
  });
});
