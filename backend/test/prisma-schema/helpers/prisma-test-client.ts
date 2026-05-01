import { PrismaClient } from "@prisma/client";

// Singleton client pointing at the test database.
// Each test file imports this directly; globalSetup ensures the schema
// is applied before any spec runs.
export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.TEST_DATABASE_URL,
    },
  },
});

/**
 * Truncates all tables between tests.
 * Table list grows as models are added — update here when new models land.
 * @see specs/001-prisma-schema/tasks.md for the update cadence.
 */
export async function truncateAll(): Promise<void> {
  // Ordered to respect FK constraints (children before parents)
  await prisma.$executeRawUnsafe(`
    TRUNCATE
      "Ship",
      "Mail",
      "MailStat",
      "Mine",
      "User",
      "Sector",
      "Planet",
      "Wormhole",
      "Team",
      "ShipClass"
    RESTART IDENTITY CASCADE
  `);
}
