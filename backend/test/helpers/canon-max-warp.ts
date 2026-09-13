import { SHIP_CLASSES } from '../../prisma/seed/ship-classes';

/**
 * The canon top speed for a ship class — a warp FACTOR, never raw units.
 *
 * Canon sets it at creation: GEFUNCS.C:421 `		ptr->topspeed = shipclass[ptr->shpclass].max_warp;`
 *
 * Fixtures that want a moving ship should ask for this rather than inventing
 * a number, because inventing one is what produced
 * `topspeed: 8000` — a raw speed in a warp-factor field, which hid the
 * Cybertron movement bug for 339 commits.
 *
 * Read from the generated seed, which `test/balance/ship-class-canon.balance.spec.ts`
 * verifies field by field against `MBMGESHP.MSG`, so this is not a
 * transcription.
 */
export function canonMaxWarp(shpclass: number): number {
  const row = SHIP_CLASSES.find((c) => c.classNumber === shpclass);
  if (!row) throw new Error(`No canon ship class ${shpclass} — fixture asks for a hull that does not exist.`);
  return row.maxWarp;
}
