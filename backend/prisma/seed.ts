import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/prisma/client';
import { SHIP_CLASSES } from './seed/ship-classes';

// Prisma 7 has no engine to hand a URL to, so the seed builds its own
// adapter. It runs from the CLI (`prisma db seed`) against DATABASE_URL,
// which `prisma.config.ts` resolves for migrations.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set — the seed has no database to write to.');
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main(): Promise<void> {
  for (const row of SHIP_CLASSES) {
    await prisma.shipClass.upsert({
      where: { classNumber: row.classNumber },
      create: row,
      update: row,
    });
  }
  console.log(`Seeded ${SHIP_CLASSES.length} ship classes.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
