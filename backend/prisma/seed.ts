import { PrismaClient } from '@prisma/client';
import { SHIP_CLASSES } from './seed/ship-classes';

const prisma = new PrismaClient();

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
