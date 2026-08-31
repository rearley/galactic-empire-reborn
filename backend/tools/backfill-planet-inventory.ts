/**
 * One-off dev backfill: give already-generated planets the starting stock and
 * production rates that GEPLANET.C:617-627 assigns at generation time.
 *
 * Galaxies generated before that branch existed are entirely barren — every
 * planet has rate 0 and 0 men, so nothing ever produces. New galaxies get this
 * from the generator; this brings an existing one in line without a full reset.
 *
 * Only touches unowned planets whose stock and rates are all zero, so it never
 * disturbs a colony a player has already developed. Re-running it re-rolls only
 * the planets that came up barren, which is harmless but not idempotent — run
 * it once.
 *
 * Usage: npx ts-node tools/backfill-planet-inventory.ts
 */
import { PrismaClient } from '@prisma/client';
import { Rng } from '../src/game/galaxy/rng';
import { rollPlanetInventory } from '../src/game/galaxy/planet-seed';
import { PLTYPE_PLNT } from '../src/game/constants';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const rng = new Rng(20260831);
  try {
    const planets = await prisma.planet.findMany({
      // Sector 0,0 is the hand-seeded neutral-zone hub (S00), not a product of
      // getsector's random branch — its five trading planets must not be rolled.
      where: { userid: null, type: PLTYPE_PLNT, NOT: { xsect: 0, ysect: 0 } },
      select: { xsect: true, ysect: true, plnum: true, itemsQty: true, itemsRate: true },
    });

    let inhabited = 0;
    for (const p of planets) {
      const hasStock = p.itemsQty.some((q) => q > 0n) || p.itemsRate.some((r) => r > 0);
      if (hasStock) continue;

      const { itemsQty, itemsRate } = rollPlanetInventory(rng);
      if (itemsRate.every((r) => r === 0)) continue;
      inhabited++;

      await prisma.planet.update({
        where: { xsect_ysect_plnum: { xsect: p.xsect, ysect: p.ysect, plnum: p.plnum } },
        data: { itemsQty, itemsRate },
      });
    }

    // eslint-disable-next-line no-console
    console.log(`backfill: ${planets.length} barren planets scanned, ${inhabited} now inhabited`);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
