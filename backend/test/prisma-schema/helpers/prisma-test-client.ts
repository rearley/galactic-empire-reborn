import { makePrismaClient } from "../../helpers/make-prisma-client";

// Singleton client pointing at the test database.
// Each test file imports this directly; globalSetup ensures the schema
// is applied before any spec runs.
// Prisma 7 removed `datasources`; a connection is made through a driver
// adapter. `makePrismaClient` throws rather than construct a client with no
// connection string, which is what a missing TEST_DATABASE_URL used to produce
// — a client that built fine and failed later with an unrelated error.
export const prisma = makePrismaClient(process.env.TEST_DATABASE_URL);

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
