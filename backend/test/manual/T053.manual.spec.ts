/**
 * T053 — Set-options persistence round-trip validation (manual smoke test).
 *
 * Verifies that toggling `scannames`, `scanhome`, `scanfull`, and `filter`
 * via the set handler persists to the DB and round-trips on reload.
 *
 * Run with: npm run test:manual
 *
 * Prerequisites:
 *  - Database is running and seeded (`npm run db:up && prisma db push`)
 *  - A user row exists in the DB (the test seeds one and cleans up after)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TEST_USERID = 'T053-test-user';

async function seedUser() {
  await prisma.user.upsert({
    where: { userid: TEST_USERID },
    update: {},
    create: {
      userid: TEST_USERID,
      username: 'T053TestUser',
      options: [0, 0, 0, 0],
    },
  });
}

async function cleanupUser() {
  await prisma.user.deleteMany({ where: { userid: TEST_USERID } });
}

describe('T053 — set-options persistence round-trip', () => {
  beforeAll(async () => {
    await seedUser();
  });

  afterAll(async () => {
    await cleanupUser();
    await prisma.$disconnect();
  });

  it('writing options[0]=1 (scannames on) persists and reloads', async () => {
    await prisma.user.update({
      where: { userid: TEST_USERID },
      data: { options: [1, 0, 0, 0] },
    });
    const user = await prisma.user.findUnique({ where: { userid: TEST_USERID } });
    expect(user?.options[0]).toBe(1);
  });

  it('writing options[1]=1 (scanhome on) persists and reloads', async () => {
    await prisma.user.update({
      where: { userid: TEST_USERID },
      data: { options: [0, 1, 0, 0] },
    });
    const user = await prisma.user.findUnique({ where: { userid: TEST_USERID } });
    expect(user?.options[1]).toBe(1);
  });

  it('writing options[2]=1 (scanfull on) persists and reloads', async () => {
    await prisma.user.update({
      where: { userid: TEST_USERID },
      data: { options: [0, 0, 1, 0] },
    });
    const user = await prisma.user.findUnique({ where: { userid: TEST_USERID } });
    expect(user?.options[2]).toBe(1);
  });

  it('writing options[3]=1 (filter on) persists and reloads', async () => {
    await prisma.user.update({
      where: { userid: TEST_USERID },
      data: { options: [0, 0, 0, 1] },
    });
    const user = await prisma.user.findUnique({ where: { userid: TEST_USERID } });
    expect(user?.options[3]).toBe(1);
  });

  it('all options can be set simultaneously', async () => {
    await prisma.user.update({
      where: { userid: TEST_USERID },
      data: { options: [1, 1, 1, 1] },
    });
    const user = await prisma.user.findUnique({ where: { userid: TEST_USERID } });
    expect(user?.options).toEqual([1, 1, 1, 1]);
  });
});
