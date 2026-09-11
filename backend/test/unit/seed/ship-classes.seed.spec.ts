import { PrismaClient } from '../../../src/prisma/client';
import { SHIP_CLASSES } from '../../../prisma/seed/ship-classes';
import { makePrismaClient } from '../../helpers/make-prisma-client';

const prisma = makePrismaClient(process.env.TEST_DATABASE_URL);

async function runSeed(): Promise<void> {
  for (const row of SHIP_CLASSES) {
    await prisma.shipClass.upsert({
      where: { classNumber: row.classNumber },
      create: row,
      update: row,
    });
  }
}

beforeAll(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE "ShipClass" RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('ship-classes seed idempotency', () => {
  it('inserts correct row count on first run', async () => {
    await runSeed();
    const count = await prisma.shipClass.count();
    expect(count).toBe(SHIP_CLASSES.length);
  });

  it('second run produces identical row count and content (idempotent)', async () => {
    await runSeed();
    const count = await prisma.shipClass.count();
    expect(count).toBe(SHIP_CLASSES.length);

    for (const expected of SHIP_CLASSES) {
      const row = await prisma.shipClass.findUniqueOrThrow({
        where: { classNumber: expected.classNumber },
      });
      expect(row.typeName).toBe(expected.typeName);
      expect(row.category).toBe(expected.category);
      expect(row.maxShields).toBe(expected.maxShields);
    }
  });
});
