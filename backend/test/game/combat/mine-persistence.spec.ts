import 'reflect-metadata';
// Integration: real Prisma against TEST_DATABASE_URL. Skipped if not set.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { MineRepository } from '../../../src/game/combat/mine.repository';

const HAS_TEST_DB = !!process.env.TEST_DATABASE_URL;
const describeIfDb = HAS_TEST_DB ? describe : describe.skip;

describeIfDb('MineRepository — integration (real Prisma)', () => {
  let prisma: PrismaService;
  let repo: MineRepository;
  let seedPrisma: PrismaClient;

  beforeAll(async () => {
    seedPrisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    prisma = new PrismaService();
    await prisma.onModuleInit();
    repo = new MineRepository(prisma);
  });

  afterAll(async () => {
    await prisma.onModuleDestroy?.();
    await seedPrisma.$disconnect();
  });

  beforeEach(async () => {
    await seedPrisma.mine.deleteMany({});
  });

  it('findAllActive() returns seeded rows', async () => {
    await seedPrisma.mine.createMany({
      data: [
        { channel: 1, timer: 100, xcoord: 1.0, ycoord: 2.0, deployedBy: 'u1' },
        { channel: 2, timer: 200, xcoord: 3.0, ycoord: 4.0, deployedBy: 'u2' },
      ],
    });
    const rows = await repo.findAllActive();
    expect(rows).toHaveLength(2);
  });

  it('create() persists a new mine', async () => {
    const created = await repo.create({
      channel: 7,
      timer: 50,
      xcoord: 9.0,
      ycoord: 9.0,
      deployedBy: 'u-create',
    });
    expect(created.id).toBeDefined();
    const all = await seedPrisma.mine.findMany();
    expect(all).toHaveLength(1);
    expect(all[0].channel).toBe(7);
  });

  it('delete() removes a mine by id', async () => {
    const m = await seedPrisma.mine.create({
      data: { channel: 1, timer: 10, xcoord: 0, ycoord: 0, deployedBy: 'u-del' },
    });
    await repo.delete(m.id);
    const remaining = await seedPrisma.mine.findMany();
    expect(remaining).toHaveLength(0);
  });
});
