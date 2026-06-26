/**
 * Shared test fixture: seed the two neutral-zone planets that
 * MidnightRepository.refreshNeutralZone() hard-updates every midnight run.
 *
 * Call this after truncateAll() in every midnight test suite that invokes
 * service.run() (or repo.refreshNeutralZone() directly).
 *
 * @see src/game/midnight/midnight.repository.ts:refreshNeutralZone
 * @see GEMAIN.C:2147-2175 — "Updating Zygor" / "Updating T-station"
 */

import { PrismaService } from '../../../src/prisma/prisma.service';
import { NUMITEMS } from '../../../src/game/constants/items';
import { PLTYPE_PLNT } from '../../../src/game/constants';

function blankItems() {
  return {
    itemsQty:      Array<bigint>(NUMITEMS).fill(0n),
    itemsRate:     Array<number>(NUMITEMS).fill(0),
    itemsSell:     Array<number>(NUMITEMS).fill(0),
    itemsReserve:  Array<number>(NUMITEMS).fill(0),
    itemsMarkup2a: Array<number>(NUMITEMS).fill(0),
    itemsSold2a:   Array<bigint>(NUMITEMS).fill(0n),
  };
}

const NEUTRAL_ZONE_BASE = {
  type: PLTYPE_PLNT,
  xcoord: 0.0, ycoord: 0.0,
  userid: null,
  enviorn: 5, resource: 10,
  cash: 0n, debt: 0n, tax: 0n,
  taxrate: 0, warnings: 0,
  password: '', lastattack: '', beacon: '', spyowner: '',
  technology: 0, teamcode: 0n,
};

export async function seedNeutralZonePlanets(prisma: PrismaService): Promise<void> {
  await prisma.planet.createMany({
    data: [
      {
        // Zygor-3 — all 14 items restocked nightly
        xsect: 0, ysect: 0, plnum: 1,
        name: 'Zygor-3',
        ...NEUTRAL_ZONE_BASE,
        ...blankItems(),
      },
      {
        // Nexus Prime (T-station) — troops/men/food restocked nightly
        xsect: 0, ysect: 0, plnum: 2,
        name: 'Nexus Prime',
        ...NEUTRAL_ZONE_BASE,
        ...blankItems(),
      },
    ],
    skipDuplicates: true,
  });
}
