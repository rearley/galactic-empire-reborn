import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });

describe('multi-ship schema', () => {
  const uid = 'mship_test_user';
  afterAll(async () => { await prisma.ship.deleteMany({ where: { userid: uid } }); await prisma.user.deleteMany({ where: { userid: uid } }); await prisma.$disconnect(); });

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
