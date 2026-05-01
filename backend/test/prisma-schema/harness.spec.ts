/**
 * Harness smoke-test: verifies the test database connection works and
 * truncateAll() runs without error. Once models exist, this also validates
 * that Prisma client generation succeeded (an import failure here means
 * schema.prisma or generation is broken).
 */
import { prisma, truncateAll } from "./helpers/prisma-test-client";

afterAll(async () => {
  await prisma.$disconnect();
});

describe("test harness", () => {
  it("connects to the test database", async () => {
    await expect(prisma.$queryRaw`SELECT 1`).resolves.toBeDefined();
  });

  it("truncateAll() runs without error", async () => {
    await expect(truncateAll()).resolves.toBeUndefined();
  });
});
